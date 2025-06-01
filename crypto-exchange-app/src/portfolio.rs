use crate::auth::extract_user_id;
use crate::db;
use actix_web::{HttpResponse, Responder, get, web};
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use log::{error, info};
use num_traits::ToPrimitive;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct AssetDistribution {
    cryptocurrency: String,
    balance: f64,
    usd_value: f64,
}

#[derive(Serialize, Deserialize)]
struct PortfolioDistribution {
    assets: Vec<AssetDistribution>,
    total_value: f64,
}

#[get("/api/portfolio/distribution")]
pub async fn get_portfolio_distribution(
    req: actix_web::HttpRequest,
    pool: web::Data<db::DbPool>,
) -> impl Responder {
    let user_id = match extract_user_id(&req) {
        Ok(id) => id,
        Err(e) => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": e.to_string()
            }));
        }
    };

    info!("Fetching portfolio distribution for user: {}", user_id);

    let mut conn = match pool.get() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to get DB connection: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database connection error"
            }));
        }
    };

    // Get all wallets belonging to the user and their balances
    use crate::schema::{wallet_balances, wallets};

    let portfolio_result = web::block(move || {
        // Get all user wallets with their balances in a single query using joins
        let wallet_balances_data: Vec<(
            crate::models::Wallet,
            Option<crate::models::WalletBalance>,
        )> = wallets::table
            .filter(wallets::user_id.eq(&user_id))
            .left_join(wallet_balances::table.on(wallet_balances::wallet_id.eq(wallets::wallet_id)))
            .load::<(crate::models::Wallet, Option<crate::models::WalletBalance>)>(&mut conn)?;

        let mut crypto_totals: std::collections::HashMap<String, (BigDecimal, Option<BigDecimal>)> =
            std::collections::HashMap::new();

        // Aggregate balances by cryptocurrency across all wallets
        for (_wallet, balance_opt) in wallet_balances_data {
            if let Some(balance) = balance_opt {
                let entry = crypto_totals
                    .entry(balance.cryptocurrency.clone())
                    .or_insert((BigDecimal::from(0), Some(BigDecimal::from(0))));

                // Add balance
                entry.0 += &balance.balance;

                // Add USD value if available
                if let Some(ref usd_val) = balance.usd_value {
                    if let Some(ref mut total_usd) = entry.1 {
                        *total_usd += usd_val;
                    }
                } else {
                    entry.1 = None; // If any balance doesn't have USD value, set total to None
                }
            }
        }

        // Convert to AssetDistribution format
        let mut assets = Vec::new();
        let mut total_portfolio_value = 0.0;

        for (cryptocurrency, (balance, usd_value_opt)) in crypto_totals {
            // Only include cryptocurrencies with positive balances
            if balance > BigDecimal::from(0) {
                let balance_f64 = balance.to_f64().unwrap_or(0.0);
                let usd_value = if let Some(usd_val) = usd_value_opt {
                    usd_val.to_f64().unwrap_or(0.0)
                } else {
                    0.0
                };

                if usd_value > 0.0 {
                    total_portfolio_value += usd_value;
                    assets.push(AssetDistribution {
                        cryptocurrency,
                        balance: balance_f64,
                        usd_value,
                    });
                }
            }
        }

        // Sort assets by USD value (descending)
        assets.sort_by(|a, b| {
            b.usd_value
                .partial_cmp(&a.usd_value)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        diesel::result::QueryResult::Ok(PortfolioDistribution {
            assets,
            total_value: total_portfolio_value,
        })
    })
    .await;

    match portfolio_result {
        Ok(Ok(portfolio)) => {
            info!(
                "Successfully fetched portfolio for user {}: {} assets, total value: ${:.2}",
                user_id,
                portfolio.assets.len(),
                portfolio.total_value
            );
            HttpResponse::Ok().json(portfolio)
        }
        Ok(Err(e)) => {
            error!("Database error fetching portfolio: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch portfolio data"
            }))
        }
        Err(e) => {
            error!("Blocking error fetching portfolio: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Server error while processing portfolio data"
            }))
        }
    }
}
