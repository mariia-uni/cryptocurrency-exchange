use actix_web::{HttpRequest, HttpResponse, get, post, put, web};
use bigdecimal::{BigDecimal, FromPrimitive};
use diesel::PgConnection;
use diesel::prelude::*;
use log::{error, info};
use serde_json::json;
use std::str::FromStr; // Add this import

use crate::auth;
use crate::db::DbPool;
use crate::models::{
    ClosePositionRequest, CreatePositionRequest, FundingRate, FuturesBalance,
    FuturesBalanceResponse, FuturesPnlHistory, FuturesPosition, NewFundingRate, NewFuturesBalance,
    NewFuturesPnlHistory, NewFuturesPosition, PositionResponse,
};
use crate::pricing;
use crate::schema::{
    funding_rates, futures_balances, futures_pnl_history, futures_positions, wallet_balances,
    wallets,
};

// Trading constants
const COMMISSION_RATE: f64 = 0.001; // 0.1%
const FUNDING_RATE: f64 = 0.0001; // 0.01% every 8 hours
const FUNDING_INTERVAL_HOURS: i64 = 8;
const LIQUIDATION_THRESHOLD: f64 = 0.05; // 5% margin remaining triggers liquidation

pub struct FuturesCalculator;

impl FuturesCalculator {
    /// Calculate required margin for a position
    pub fn calculate_margin(size: &BigDecimal, price: &BigDecimal, leverage: i32) -> BigDecimal {
        let notional_value = size * price;
        notional_value / BigDecimal::from(leverage)
    }

    /// Calculate liquidation price
    pub fn calculate_liquidation_price(
        entry_price: &BigDecimal,
        leverage: i32,
        side: &str,
    ) -> BigDecimal {
        let leverage_decimal = BigDecimal::from(leverage);
        let threshold = BigDecimal::from_f64(LIQUIDATION_THRESHOLD).unwrap();

        match side {
            "long" => {
                // For long: liquidation_price = entry_price * (1 - 1/leverage + threshold)
                let factor =
                    BigDecimal::from(1) - (BigDecimal::from(1) / &leverage_decimal) + threshold;
                entry_price * factor
            }
            "short" => {
                // For short: liquidation_price = entry_price * (1 + 1/leverage - threshold)
                let factor =
                    BigDecimal::from(1) + (BigDecimal::from(1) / &leverage_decimal) - threshold;
                entry_price * factor
            }
            _ => entry_price.clone(),
        }
    }

    /// Calculate unrealized P&L
    pub fn calculate_unrealized_pnl(
        entry_price: &BigDecimal,
        current_price: &BigDecimal,
        size: &BigDecimal,
        side: &str,
        leverage: i32,
    ) -> BigDecimal {
        let price_diff = current_price - entry_price;
        let leverage_decimal = BigDecimal::from(leverage);

        match side {
            "long" => price_diff * size * leverage_decimal,
            "short" => (entry_price - current_price) * size * leverage_decimal,
            _ => BigDecimal::from(0),
        }
    }

    /// Calculate realized P&L
    pub fn calculate_realized_pnl(
        entry_price: &BigDecimal,
        exit_price: &BigDecimal,
        size: &BigDecimal,
        side: &str,
        leverage: i32,
    ) -> BigDecimal {
        Self::calculate_unrealized_pnl(entry_price, exit_price, size, side, leverage)
    }

    /// Calculate commission
    pub fn calculate_commission(notional_value: &BigDecimal) -> BigDecimal {
        notional_value * BigDecimal::from_f64(COMMISSION_RATE).unwrap()
    }

    /// Calculate funding fee
    pub fn calculate_funding_fee(
        notional_value: &BigDecimal,
        funding_rate: &BigDecimal,
    ) -> BigDecimal {
        notional_value * funding_rate
    }

    /// Check if position should be liquidated
    pub fn should_liquidate(
        _entry_price: &BigDecimal,
        current_price: &BigDecimal,
        liquidation_price: &BigDecimal,
        side: &str,
    ) -> bool {
        match side {
            "long" => current_price <= liquidation_price,
            "short" => current_price >= liquidation_price,
            _ => false,
        }
    }
}

/// Create a new futures position
#[post("/positions")]
pub async fn create_position(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    position_req: web::Json<CreatePositionRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = auth::extract_user_id(&req)?;

    // Validate input
    if position_req.leverage < 1 || position_req.leverage > 100 {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "Leverage must be between 1 and 100"
        })));
    }

    if position_req.side != "long" && position_req.side != "short" {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "Side must be 'long' or 'short'"
        })));
    }

    let size = match BigDecimal::from_str(&position_req.size) {
        Ok(s) if s > BigDecimal::from(0) => s,
        _ => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": "Invalid position size"
            })));
        }
    };

    // Get current market price
    let current_price = match get_current_market_price(&position_req.symbol).await {
        Ok(price) => price,
        Err(e) => {
            error!("Failed to get market price: {}", e);
            return Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to get market price"
            })));
        }
    };

    // Calculate position parameters
    let margin = FuturesCalculator::calculate_margin(&size, &current_price, position_req.leverage);
    let liquidation_price = FuturesCalculator::calculate_liquidation_price(
        &current_price,
        position_req.leverage,
        &position_req.side,
    );

    // Check if user has sufficient balance
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let user_balance = get_user_futures_balance(&mut conn, user_id, "USDT").map_err(|e| {
        error!("Error getting user futures balance: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to get user balance")
    })?;

    if user_balance.available_balance < margin {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "Insufficient balance for margin requirement",
            "required_margin": margin.to_string(),
            "available_balance": user_balance.available_balance.to_string()
        })));
    }

    // Create new position
    let new_position = NewFuturesPosition {
        user_id,
        symbol: position_req.symbol.clone(),
        side: position_req.side.clone(),
        size: size.clone(),
        entry_price: current_price.clone(),
        current_price: current_price.clone(),
        leverage: position_req.leverage,
        margin: margin.clone(),
        liquidation_price,
        unrealized_pnl: BigDecimal::from(0),
        status: "open".to_string(),
    };

    let position = web::block(move || {
        conn.transaction::<FuturesPosition, diesel::result::Error, _>(|conn| {
            // Insert new position
            let position: FuturesPosition = diesel::insert_into(futures_positions::table)
                .values(&new_position)
                .get_result(conn)?;

            // Update user balance (move margin from available to margin balance)
            update_user_balance_for_margin(conn, user_id, "USDT", &margin, true)?;

            Ok(position)
        })
    })
    .await
    .map_err(|e| {
        error!("Database error creating position: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to create position")
    })?
    .map_err(|e| {
        error!("Database transaction error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to create position")
    })?;

    // Calculate commission
    let notional_value = &size * &current_price;
    let commission = FuturesCalculator::calculate_commission(&notional_value);

    info!(
        "Created {} position for user {}: {} {} at {} with {}x leverage",
        position_req.side, user_id, size, position_req.symbol, current_price, position_req.leverage
    );

    Ok(HttpResponse::Created().json(json!({
        "message": "Position created successfully",
        "position": PositionResponse::from(position),
        "commission": commission.to_string(),
        "notional_value": notional_value.to_string()
    })))
}

/// Close a futures position
#[put("/positions/{position_id}/close")]
pub async fn close_position(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    path: web::Path<i32>,
    close_req: web::Json<ClosePositionRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = auth::extract_user_id(&req)?;
    let position_id = path.into_inner();

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    // Get the position
    let position: FuturesPosition = web::block(move || {
        futures_positions::table
            .filter(futures_positions::id.eq(position_id))
            .filter(futures_positions::user_id.eq(user_id))
            .filter(futures_positions::status.eq("open"))
            .first(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch position")
    })?
    .map_err(|_| actix_web::error::ErrorNotFound("Position not found or already closed"))?;

    // Determine close size (full or partial)
    let close_size = if let Some(size_str) = &close_req.size {
        match BigDecimal::from_str(size_str) {
            Ok(s) if s > BigDecimal::from(0) && s <= position.size => s,
            _ => {
                return Ok(HttpResponse::BadRequest().json(json!({
                    "error": "Invalid close size"
                })));
            }
        }
    } else {
        position.size.clone()
    };

    // Get current market price
    let current_price = match get_current_market_price(&position.symbol).await {
        Ok(price) => price,
        Err(e) => {
            error!("Failed to get market price: {}", e);
            return Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to get market price"
            })));
        }
    };

    // Calculate realized P&L and fees
    let realized_pnl = FuturesCalculator::calculate_realized_pnl(
        &position.entry_price,
        &current_price,
        &close_size,
        &position.side,
        position.leverage,
    );

    let notional_value = &close_size * &current_price;
    let commission = FuturesCalculator::calculate_commission(&notional_value);

    // Get funding rate and calculate funding fee
    let mut conn2 = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let funding_rate = get_current_funding_rate(&mut conn2, &position.symbol).map_err(|e| {
        error!("Failed to get funding rate: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to get funding rate")
    })?;
    let funding_fee = FuturesCalculator::calculate_funding_fee(&notional_value, &funding_rate.rate);

    let net_pnl = &realized_pnl - &commission - &funding_fee;

    // Calculate margin to release
    let margin_to_release = (&close_size / &position.size) * &position.margin;

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    // Clone necessary values before the web::block closure
    let close_size_for_response = close_size.clone();
    let symbol_for_response = position.symbol.clone();
    let current_price_for_response = current_price.clone();
    let net_pnl_for_response = net_pnl.clone();
    let realized_pnl_for_response = realized_pnl.clone();
    let commission_for_response = commission.clone();
    let funding_fee_for_response = funding_fee.clone();

    let result = web::block(move || {
        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            let is_full_close = close_size >= position.size;

            if is_full_close {
                // Full close - update position status
                diesel::update(futures_positions::table.find(position_id))
                    .set((
                        futures_positions::status.eq("closed"),
                        futures_positions::current_price.eq(&current_price),
                        futures_positions::closed_at.eq(Some(chrono::Utc::now())),
                        futures_positions::updated_at.eq(chrono::Utc::now()),
                    ))
                    .execute(conn)?;
            } else {
                // Partial close - update position size and margin
                let new_size = &position.size - &close_size;
                let new_margin = &position.margin - &margin_to_release;

                diesel::update(futures_positions::table.find(position_id))
                    .set((
                        futures_positions::size.eq(&new_size),
                        futures_positions::margin.eq(&new_margin),
                        futures_positions::current_price.eq(&current_price),
                        futures_positions::updated_at.eq(chrono::Utc::now()),
                    ))
                    .execute(conn)?;
            }

            // Record P&L history
            let pnl_record = NewFuturesPnlHistory {
                user_id,
                position_id,
                symbol: position.symbol.clone(),
                side: position.side.clone(),
                size: close_size.clone(),
                entry_price: position.entry_price.clone(),
                exit_price: current_price.clone(),
                leverage: position.leverage,
                margin: margin_to_release.clone(),
                realized_pnl: realized_pnl.clone(),
                commission: commission.clone(),
                funding_fee: funding_fee.clone(),
            };

            diesel::insert_into(futures_pnl_history::table)
                .values(&pnl_record)
                .execute(conn)?;

            // Update user balance
            update_user_balance_for_close(conn, user_id, "USDT", &margin_to_release, &net_pnl)?;

            Ok(())
        })
    })
    .await
    .map_err(|e| {
        error!("Database error closing position: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to close position")
    })?
    .map_err(|e| {
        error!("Database transaction error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to close position")
    })?;

    info!(
        "Closed position {} for user {}: {} {} at {} with realized P&L: {}",
        position_id,
        user_id,
        close_size_for_response,
        symbol_for_response,
        current_price_for_response,
        net_pnl_for_response
    );

    Ok(HttpResponse::Ok().json(json!({
        "message": "Position closed successfully",
        "realized_pnl": realized_pnl_for_response.to_string(),
        "commission": commission_for_response.to_string(),
        "funding_fee": funding_fee_for_response.to_string(),
        "net_pnl": net_pnl_for_response.to_string(),
        "close_size": close_size_for_response.to_string(),
        "exit_price": current_price_for_response.to_string()
    })))
}

/// Get user's open positions
#[get("/positions")]
pub async fn get_positions(
    req: HttpRequest,
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = auth::extract_user_id(&req)?;

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let positions: Vec<FuturesPosition> = web::block(move || {
        futures_positions::table
            .filter(futures_positions::user_id.eq(user_id))
            .filter(futures_positions::status.eq("open"))
            .order(futures_positions::created_at.desc())
            .load(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch positions")
    })?
    .map_err(|e| {
        error!("Database query error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch positions")
    })?;

    // Update positions with current prices and unrealized P&L
    let mut updated_positions = Vec::new();
    for mut position in positions {
        if let Ok(current_price) = get_current_market_price(&position.symbol).await {
            position.current_price = current_price.clone();
            position.unrealized_pnl = FuturesCalculator::calculate_unrealized_pnl(
                &position.entry_price,
                &current_price,
                &position.size,
                &position.side,
                position.leverage,
            );

            // Check for liquidation
            if FuturesCalculator::should_liquidate(
                &position.entry_price,
                &current_price,
                &position.liquidation_price,
                &position.side,
            ) {
                // Handle liquidation asynchronously
                tokio::spawn(handle_liquidation(pool.clone(), position.id));
                position.status = "liquidated".to_string();
            }
        }
        updated_positions.push(PositionResponse::from(position));
    }

    Ok(HttpResponse::Ok().json(json!({
        "positions": updated_positions
    })))
}

/// Get user's P&L history
#[get("/pnl-history")]
pub async fn get_pnl_history(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = auth::extract_user_id(&req)?;

    let limit = query
        .get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(50)
        .min(100);

    let offset = query
        .get("offset")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let pnl_history: Vec<FuturesPnlHistory> = web::block(move || {
        futures_pnl_history::table
            .filter(futures_pnl_history::user_id.eq(user_id))
            .order(futures_pnl_history::created_at.desc())
            .limit(limit)
            .offset(offset)
            .load(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch P&L history")
    })?
    .map_err(|e| {
        error!("Database query error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch P&L history")
    })?;

    Ok(HttpResponse::Ok().json(json!({
        "pnl_history": pnl_history
    })))
}

/// Get user's futures balance
#[get("/balance")]
pub async fn get_futures_balance(
    req: HttpRequest,
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = auth::extract_user_id(&req)?;

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let balance = get_user_futures_balance(&mut conn, user_id, "USDT").map_err(|e| {
        error!("Error getting futures balance: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to get futures balance")
    })?;

    let total_balance =
        &balance.available_balance + &balance.margin_balance + &balance.unrealized_pnl;

    let balance_response = FuturesBalanceResponse {
        currency: "USDT".to_string(),
        available_balance: balance.available_balance.to_string(),
        margin_balance: balance.margin_balance.to_string(),
        unrealized_pnl: balance.unrealized_pnl.to_string(),
        total_balance: total_balance.to_string(),
    };

    Ok(HttpResponse::Ok().json(balance_response))
}

// Helper functions

async fn get_current_market_price(symbol: &str) -> Result<BigDecimal, Box<dyn std::error::Error>> {
    // Extract base currency from symbol (e.g., "BTCUSDT" -> "BTC")
    let base_currency = if symbol.ends_with("USDT") {
        &symbol[..symbol.len() - 4]
    } else {
        symbol
    };

    let price = pricing::get_current_price(base_currency).await?;
    Ok(BigDecimal::from_f64(price).unwrap_or(BigDecimal::from(0)))
}

fn get_user_futures_balance(
    conn: &mut PgConnection,
    _user_id: i32,
    _currency: &str,
) -> Result<FuturesBalance, diesel::result::Error> {
    use crate::schema::futures_balances::dsl::*;

    // Try to get existing balance
    let existing_balance = futures_balances
        .filter(user_id.eq(_user_id))
        .filter(currency.eq(_currency))
        .first::<FuturesBalance>(conn)
        .optional()?;

    match existing_balance {
        Some(balance) => Ok(balance),
        None => {
            // Create initial balance from spot wallet
            let spot_balance = get_total_spot_balance(conn, _user_id, _currency)?;

            let new_balance = NewFuturesBalance {
                user_id: _user_id,
                currency: _currency.to_string(),
                available_balance: spot_balance,
                margin_balance: BigDecimal::from(0),
                unrealized_pnl: BigDecimal::from(0),
            };

            diesel::insert_into(futures_balances)
                .values(&new_balance)
                .get_result(conn)
        }
    }
}

fn get_total_spot_balance(
    conn: &mut PgConnection,
    _user_id: i32,
    _currency: &str,
) -> Result<BigDecimal, diesel::result::Error> {
    let total_balance: Option<BigDecimal> = wallets::table
        .inner_join(wallet_balances::table)
        .filter(wallets::user_id.eq(_user_id))
        .filter(wallet_balances::cryptocurrency.eq(_currency))
        .select(diesel::dsl::sum(wallet_balances::balance))
        .first(conn)?;

    Ok(total_balance.unwrap_or(BigDecimal::from(0)))
}

fn update_user_balance_for_margin(
    conn: &mut PgConnection,
    _user_id: i32,
    _currency: &str,
    margin_amount: &BigDecimal,
    is_opening: bool, // true for opening position, false for closing
) -> Result<(), diesel::result::Error> {
    use crate::schema::futures_balances::dsl::*;

    if is_opening {
        // Move money from available to margin
        diesel::update(
            futures_balances
                .filter(user_id.eq(_user_id))
                .filter(currency.eq(_currency)),
        )
        .set((
            available_balance.eq(available_balance - margin_amount),
            margin_balance.eq(margin_balance + margin_amount),
            last_updated.eq(chrono::Utc::now()),
        ))
        .execute(conn)?;
    } else {
        // Move money from margin back to available
        diesel::update(
            futures_balances
                .filter(user_id.eq(_user_id))
                .filter(currency.eq(_currency)),
        )
        .set((
            available_balance.eq(available_balance + margin_amount),
            margin_balance.eq(margin_balance - margin_amount),
            last_updated.eq(chrono::Utc::now()),
        ))
        .execute(conn)?;
    }

    Ok(())
}

fn update_user_balance_for_close(
    conn: &mut PgConnection,
    _user_id: i32,
    _currency: &str,
    margin_amount: &BigDecimal,
    net_pnl: &BigDecimal,
) -> Result<(), diesel::result::Error> {
    use crate::schema::futures_balances::dsl::*;

    // Release margin and add/subtract P&L
    diesel::update(
        futures_balances
            .filter(user_id.eq(_user_id))
            .filter(currency.eq(_currency)),
    )
    .set((
        available_balance.eq(available_balance + margin_amount + net_pnl),
        margin_balance.eq(margin_balance - margin_amount),
        last_updated.eq(chrono::Utc::now()),
    ))
    .execute(conn)?;

    Ok(())
}

fn get_current_funding_rate(
    conn: &mut PgConnection,
    _symbol: &str,
) -> Result<FundingRate, diesel::result::Error> {
    use crate::schema::funding_rates::dsl::*;

    // Get the most recent funding rate for the symbol
    let existing_rate = funding_rates
        .filter(symbol.eq(_symbol))
        .order(timestamp.desc())
        .first::<FundingRate>(conn)
        .optional()?;

    match existing_rate {
        Some(r) => Ok(r),
        None => {
            // Create default funding rate
            let default_rate = NewFundingRate {
                symbol: _symbol.to_string(),
                rate: BigDecimal::from_f64(FUNDING_RATE).unwrap(),
                next_funding_time: chrono::Utc::now()
                    + chrono::Duration::hours(FUNDING_INTERVAL_HOURS),
            };

            diesel::insert_into(funding_rates)
                .values(&default_rate)
                .get_result(conn)
        }
    }
}

async fn handle_liquidation(pool: web::Data<DbPool>, position_id: i32) {
    let mut conn = match pool.get() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to get database connection for liquidation: {}", e);
            return;
        }
    };

    let result = web::block(move || {
        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            // Update position status to liquidated
            diesel::update(futures_positions::table.find(position_id))
                .set((
                    futures_positions::status.eq("liquidated"),
                    futures_positions::closed_at.eq(Some(chrono::Utc::now())),
                    futures_positions::updated_at.eq(chrono::Utc::now()),
                ))
                .execute(conn)?;

            // Additional liquidation logic would go here
            // (e.g., insurance fund, auto-deleveraging, etc.)

            Ok(())
        })
    })
    .await;

    match result {
        Ok(_) => info!("Position {} liquidated successfully", position_id),
        Err(e) => error!("Failed to liquidate position {}: {:?}", position_id, e),
    }
}

// Configure routes
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/futures")
            .service(create_position)
            .service(close_position)
            .service(get_positions)
            .service(get_pnl_history)
            .service(get_futures_balance),
    );
}
