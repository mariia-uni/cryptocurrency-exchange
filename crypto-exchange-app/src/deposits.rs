use actix_web::{HttpRequest, HttpResponse, post, web};
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::auth;
use crate::db::DbPool;
use crate::models::{Cryptocurrency, WalletBalance};
use crate::pricing;
use crate::schema::{cryptocurrencies, wallet_addresses, wallet_balances};
use crate::transactions;

#[derive(Deserialize)]
pub struct DepositRequest {
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub blockchain: String,
    pub address: String,
    pub amount: String,
    pub confirmation_token: String,
}

#[derive(Serialize)]
pub struct DepositResponse {
    pub success: bool,
    pub transaction_id: String,
    pub new_balance: String,
    pub message: String,
}

// Process a deposit request
#[post("/process")]
pub async fn process_deposit(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    deposit_req: web::Json<DepositRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    // Clone deposit_req fields before the first web::block call
    let wallet_id_value = deposit_req.wallet_id;
    let user_id_value = user_id;

    // Validate the wallet belongs to the user
    let wallet_option = web::block(move || {
        use crate::schema::wallets::dsl::*;
        
        wallets
            .filter(wallet_id.eq(wallet_id_value))
            .filter(user_id.eq(user_id_value))
            .first::<crate::models::Wallet>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error validating wallet")
    })? 
    .map_err(|e| {
        error!("Database query error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error querying database")
    })?; // This unwraps the BlockingError, but we still have a Result<Option<Wallet>, diesel::Error>
    
    if wallet_option.is_none() {
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "You do not have permission to deposit to this wallet"
        })));
    }

    // Clone fields for the second web::block
    let wallet_id_value2 = deposit_req.wallet_id;
    let cryptocurrency_value = deposit_req.cryptocurrency.clone();
    let address_value = deposit_req.address.clone();

    // Validate the address belongs to the wallet
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let address_option = web::block(move || {
        wallet_addresses::table
            .filter(wallet_addresses::wallet_id.eq(wallet_id_value2))
            .filter(wallet_addresses::cryptocurrency.eq(&cryptocurrency_value))
            .filter(wallet_addresses::address.eq(&address_value))
            .first::<crate::models::WalletAddress>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error validating address")
    })? 
    .map_err(|e| {
        error!("Database query error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error querying address")
    })?;

    if address_option.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid address for this wallet and cryptocurrency"
        })));
    }

    // Clone fields for the third web::block
    let cryptocurrency_value2 = deposit_req.cryptocurrency.clone();

    // Validate cryptocurrency exists
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let crypto_option = web::block(move || {
        cryptocurrencies::table
            .filter(cryptocurrencies::symbol.eq(&cryptocurrency_value2))
            .filter(cryptocurrencies::is_active.eq(true))
            .first::<Cryptocurrency>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error validating cryptocurrency")
    })?
    .map_err(|e| {
        error!("Database query error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error querying cryptocurrency")
    })?;

    if crypto_option.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid or inactive cryptocurrency"
        })));
    }

    // Convert amount string to BigDecimal
    let amount = match BigDecimal::from_str(&deposit_req.amount) {
        Ok(amount) => amount,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid deposit amount"
            })));
        }
    };

    // Generate a mock transaction ID
    let transaction_id = format!(
        "TX-{}-{}",
        chrono::Utc::now().timestamp(),
        uuid::Uuid::new_v4().to_string()[..8].to_string()
    );

    // Update or create wallet balance
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_id_clone = deposit_req.wallet_id;
    let crypto_clone = deposit_req.cryptocurrency.clone();
    let amount_clone = amount.clone();

    let balance_result = web::block(move || -> Result<WalletBalance, diesel::result::Error> {
        // Check if balance exists
        let existing_balance = wallet_balances::table
            .filter(wallet_balances::wallet_id.eq(wallet_id_clone))
            .filter(wallet_balances::cryptocurrency.eq(&crypto_clone))
            .first::<WalletBalance>(&mut conn)
            .optional()?;

        match existing_balance {
            Some(mut balance) => {
                // Update existing balance
                balance.balance = balance.balance + amount_clone;
                
                // Get current price for USD calculation - using a blocking call in this thread for simplicity
                let price_future = pricing::get_current_price(&crypto_clone);
                let price = match tokio::runtime::Handle::current().block_on(price_future) {
                    Ok(p) => BigDecimal::from_str(&p.to_string()).unwrap_or(BigDecimal::from_str("0").unwrap()),
                    Err(_) => BigDecimal::from_str("0").unwrap(), // Fallback price if API fails
                };
                
                // Calculate USD value
                let usd_value = if price > BigDecimal::from_str("0").unwrap() {
                    Some(&balance.balance * &price)
                } else {
                    balance.usd_value
                };
                
                diesel::update(wallet_balances::table.find(balance.id))
                    .set((
                        wallet_balances::balance.eq(&balance.balance),
                        wallet_balances::usd_value.eq(&usd_value),
                        wallet_balances::last_price.eq(&price),
                        wallet_balances::last_updated.eq(diesel::dsl::now),
                    ))
                    .execute(&mut conn)?;
                
                // Update the in-memory balance object with new values
                balance.usd_value = usd_value;
                balance.last_price = Some(price);
                
                Ok(balance)
            }
            None => {
                // Get current price for USD calculation
                let price_future = pricing::get_current_price(&crypto_clone);
                let price = match tokio::runtime::Handle::current().block_on(price_future) {
                    Ok(p) => BigDecimal::from_str(&p.to_string()).unwrap_or(BigDecimal::from_str("0").unwrap()),
                    Err(_) => BigDecimal::from_str("0").unwrap(), // Fallback price if API fails
                };
                
                // Calculate USD value
                let usd_value = if price > BigDecimal::from_str("0").unwrap() {
                    Some(&amount_clone * &price)
                } else {
                    None
                };
                
                // Create new balance
                let new_balance = crate::models::NewWalletBalance {
                    wallet_id: wallet_id_clone,
                    cryptocurrency: crypto_clone,
                    balance: amount_clone,
                    usd_value,
                    last_price: Some(price),
                };

                diesel::insert_into(wallet_balances::table)
                    .values(&new_balance)
                    .get_result::<WalletBalance>(&mut conn)
            }
        }
    })
    .await
    .map_err(|e| {
        error!("Database error updating balance: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error updating balance")
    })?;

    match balance_result {
        Ok(balance) => {
            info!(
                "Deposit successful: {} {} to wallet {}",
                deposit_req.amount, deposit_req.cryptocurrency, deposit_req.wallet_id
            );

            // Record the transaction
            let transaction_result = transactions::create_transaction(
                &pool,
                user_id,
                deposit_req.wallet_id,
                amount.clone(),
                deposit_req.cryptocurrency.clone(),
                "deposit".to_string(),
                transaction_id.clone(),  // Use the same transaction hash
                Some(deposit_req.blockchain.clone()),
                Some(deposit_req.address.clone()),
                None,  // No fee for deposits in this simplified model
            )
            .await;

            if let Err(e) = transaction_result {
                error!("Failed to record transaction: {:?}", e);
                // Continue anyway - the deposit was successful
            }

            Ok(HttpResponse::Ok().json(DepositResponse {
                success: true,
                transaction_id,
                new_balance: balance.balance.to_string(),
                message: format!(
                    "Successfully deposited {} {} to your wallet",
                    deposit_req.amount, deposit_req.cryptocurrency
                ),
            }))
        }
        Err(e) => {
            error!("Failed to update balance: {:?}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to process deposit"
            })))
        }
    }
}

// Get supported blockchains for a specific cryptocurrency
#[derive(Serialize)]
pub struct BlockchainInfo {
    pub id: String,
    pub name: String,
    pub network_fee: String,
    pub is_active: bool,
    pub min_deposit: String,
    pub confirmation_blocks: i32,
}

#[derive(Serialize)]
pub struct BlockchainsResponse {
    pub blockchains: Vec<BlockchainInfo>,
}

// Configure the routes
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/deposit").service(process_deposit));
}
