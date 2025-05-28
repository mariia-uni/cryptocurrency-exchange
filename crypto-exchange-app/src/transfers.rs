use actix_web::{HttpRequest, HttpResponse, post, web};
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::auth;
use crate::db::DbPool;
use crate::models::{NewWalletAddress, NewWalletBalance, User, WalletAddress, WalletBalance};
use crate::schema::{users, wallet_addresses, wallet_balances, wallets};
use crate::transactions;
use crate::wallets::crypto_addresses;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct InternalTransferRequest {
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub amount: String,
    pub recipient_id: Option<i32>,
    pub recipient_username: Option<String>,
    pub recipient_email: String,
}

#[derive(Serialize)]
pub struct TransferResponse {
    pub success: bool,
    pub transaction_id: String,
    pub new_balance: String,
    pub recipient_address: String,
    pub message: String,
}

// Process an internal transfer between users
#[post("/internal")]
pub async fn internal_transfer(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    transfer_req: web::Json<InternalTransferRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let sender_id = auth::extract_user_id(&req)?;

    // Get database connection
    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    // Validate wallet ownership
    let wallet_id_value = transfer_req.wallet_id;
    let sender_id_value = sender_id;

    let wallet = web::block(move || {
        use crate::schema::wallets::dsl::*;

        wallets
            .filter(wallet_id.eq(wallet_id_value))
            .filter(user_id.eq(sender_id_value))
            .first::<crate::models::Wallet>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error validating wallet ownership")
    })?;

    let wallet = match wallet {
        Ok(wallet_option) => {
            if wallet_option.is_none() {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Invalid wallet or wallet does not belong to you"
                })));
            }
            wallet_option.unwrap()
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Error validating wallet"
            })));
        }
    };

    // Find the recipient user
    let recipient_email = transfer_req.recipient_email.clone();
    let recipient_username = transfer_req.recipient_username.clone();
    let recipient_id = transfer_req.recipient_id;

    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let recipient = web::block(move || {
        let mut query = users::table.into_boxed();

        if let Some(id) = recipient_id {
            query = query.filter(users::id.eq(id));
        } else if let Some(username) = recipient_username {
            query = query.filter(users::username.eq(username));
        } else {
            query = query.filter(users::email.eq(recipient_email));
        }

        query.first::<User>(&mut conn).optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error finding recipient")
    })?;

    let recipient = match recipient {
        Ok(Some(user)) => user,
        Ok(None) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Recipient user not found"
            })));
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error when finding recipient"
            })));
        }
    };

    // Prevent transfers to self
    if recipient.id == sender_id {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Cannot transfer to yourself"
        })));
    }

    // Parse amount
    let amount = match BigDecimal::from_str(&transfer_req.amount) {
        Ok(amount) => {
            if amount <= BigDecimal::from(0) {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Transfer amount must be positive"
                })));
            }
            amount
        }
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid amount format"
            })));
        }
    };

    // Check sender's balance
    let cryptocurrency = transfer_req.cryptocurrency.to_uppercase();
    let cryptocurrency_for_transactions = cryptocurrency.clone();
    let cryptocurrency_for_address = cryptocurrency.clone();
    let cryptocurrency_for_transfer = cryptocurrency.clone(); // Add this line
    let wallet_id = transfer_req.wallet_id;
    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let sender_balance = web::block(move || {
        wallet_balances::table
            .filter(wallet_balances::wallet_id.eq(wallet_id))
            .filter(wallet_balances::cryptocurrency.eq(&cryptocurrency)) // This moves cryptocurrency
            .first::<WalletBalance>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error checking balance")
    })?;

    let sender_balance = match sender_balance {
        Ok(Some(balance)) => {
            if balance.balance < amount {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Insufficient balance"
                })));
            }
            balance
        }
        Ok(None) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "You don't have a balance for this cryptocurrency"
            })));
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error when checking balance"
            })));
        }
    };

    // Find or create recipient's wallet
    let recipient_id = recipient.id;
    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let recipient_wallet = web::block(
        move || -> Result<crate::models::Wallet, diesel::result::Error> {
            // Find user's first wallet or create one if they don't have any
            let existing_wallet = wallets::table
                .filter(wallets::user_id.eq(recipient_id))
                .first::<crate::models::Wallet>(&mut conn)
                .optional()?;

            if let Some(wallet) = existing_wallet {
                Ok(wallet)
            } else {
                // Create a new wallet for the recipient
                let new_wallet = crate::models::NewWallet {
                    user_id: recipient_id,
                    wallet_type: "CUSTODIAL".to_string(),
                    status: "ACTIVE".to_string(),
                    name: "My Wallet".to_string(),
                };

                let wallet = diesel::insert_into(wallets::table)
                    .values(&new_wallet)
                    .get_result::<crate::models::Wallet>(&mut conn)?;

                Ok(wallet)
            }
        },
    )
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error finding/creating recipient wallet")
    })?;

    let recipient_wallet = match recipient_wallet {
        Ok(wallet) => wallet,
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Error preparing recipient's wallet"
            })));
        }
    };

    // Find or generate a wallet address for the recipient
    let cryptocurrency_clone = cryptocurrency_for_address; // Use the pre-cloned variable instead
    let recipient_wallet_id = recipient_wallet.wallet_id;
    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let recipient_address = web::block(move || {
        // Check if address already exists
        let existing_address = wallet_addresses::table
            .filter(wallet_addresses::wallet_id.eq(recipient_wallet_id))
            .filter(wallet_addresses::cryptocurrency.eq(&cryptocurrency_clone))
            .first::<WalletAddress>(&mut conn)
            .optional()?;

        if let Some(address) = existing_address {
            Ok(address)
        } else {
            // Generate a new address
            let address_generator =
                crypto_addresses::create_address_generator(&cryptocurrency_clone);
            let (address, private_key) = match address_generator.generate_address() {
                Ok((addr, key)) => (addr, key),
                Err(e) => {
                    error!("Failed to generate address: {:?}", e);
                    return Err(diesel::result::Error::RollbackTransaction);
                }
            };

            info!(
                "Generated address for recipient {}: {}",
                recipient_id, address
            );
            info!("Private key (for demonstration only): {}", private_key);

            // Store the new address
            let new_address = NewWalletAddress {
                wallet_id: recipient_wallet_id,
                cryptocurrency: cryptocurrency_clone,
                address: address.clone(),
            };

            let saved_address = diesel::insert_into(wallet_addresses::table)
                .values(&new_address)
                .get_result::<WalletAddress>(&mut conn)?;

            Ok(saved_address)
        }
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error finding/creating recipient address")
    })?;

    let recipient_address = match recipient_address {
        Ok(address) => address,
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Error preparing recipient's address"
            })));
        }
    };

    // Process the transfer within a transaction
    let sender_wallet_id = wallet_id;
    let amount_clone = amount.clone();
    let cryptocurrency_clone = cryptocurrency_for_transfer; // Use the pre-cloned variable
    let recipient_wallet_id = recipient_wallet.wallet_id;
    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let transfer_result = web::block(move || {
        // Use a transaction to ensure atomicity
        conn.transaction(|conn| {
            // 1. Deduct from sender's balance
            let new_sender_balance = sender_balance.balance.clone() - amount_clone.clone();
            diesel::update(wallet_balances::table)
                .filter(wallet_balances::id.eq(sender_balance.id))
                .set((
                    wallet_balances::balance.eq(new_sender_balance),
                    wallet_balances::last_updated.eq(diesel::dsl::now),
                ))
                .execute(conn)?;

            // 2. Add to recipient's balance
            let existing_balance = wallet_balances::table
                .filter(wallet_balances::wallet_id.eq(recipient_wallet_id))
                .filter(wallet_balances::cryptocurrency.eq(&cryptocurrency_clone))
                .first::<WalletBalance>(conn)
                .optional()?;

            match existing_balance {
                Some(balance) => {
                    // Update existing balance
                    let new_balance = balance.balance + amount_clone.clone();
                    diesel::update(wallet_balances::table)
                        .filter(wallet_balances::id.eq(balance.id))
                        .set((
                            wallet_balances::balance.eq(new_balance),
                            wallet_balances::last_updated.eq(diesel::dsl::now),
                        ))
                        .execute(conn)?;
                }
                None => {
                    // Create new balance record
                    let new_balance = NewWalletBalance {
                        wallet_id: recipient_wallet_id,
                        cryptocurrency: cryptocurrency_clone.clone(),
                        balance: amount_clone.clone(),
                        usd_value: None,
                        last_price: None,
                    };

                    diesel::insert_into(wallet_balances::table)
                        .values(&new_balance)
                        .execute(conn)?;
                }
            }

            // Return updated sender balance
            wallet_balances::table
                .filter(wallet_balances::wallet_id.eq(sender_wallet_id))
                .filter(wallet_balances::cryptocurrency.eq(&cryptocurrency_clone))
                .first::<WalletBalance>(conn)
        })
    })
    .await
    .map_err(|e| {
        error!("Database error during transfer: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error processing transfer")
    })?;

    match transfer_result {
        Ok(updated_balance) => {
            // Clone cryptocurrency one more time for display
            let display_currency = cryptocurrency_for_transactions.clone(); // Use this instead

            // Create transaction ID and records
            let transaction_id = format!(
                "TX-{}-{}",
                chrono::Utc::now().timestamp(),
                Uuid::new_v4().as_simple()
            );

            // Create transaction record for sender
            let _ = transactions::create_transaction(
                &pool,
                sender_id,
                wallet_id,
                amount.clone(),
                cryptocurrency_for_transactions.clone(),
                "transfer".to_string(), // Changed to allowed value from constraint
                transaction_id.clone(),
                None,
                Some(recipient_address.address.clone()),
                None,
            )
            .await;

            // Create transaction record for recipient
            let _ = transactions::create_transaction(
                &pool,
                recipient.id,
                recipient_wallet.wallet_id,
                amount.clone(),
                cryptocurrency_for_transactions.clone(),
                "transfer".to_string(), // Changed to allowed value from constraint
                transaction_id.clone(),
                None,
                Some(recipient_address.address.clone()),
                None,
            )
            .await;

            // Return success response
            Ok(HttpResponse::Ok().json(TransferResponse {
                success: true,
                transaction_id,
                new_balance: updated_balance.balance.to_string(),
                recipient_address: recipient_address.address,
                message: format!(
                    "Successfully transferred {} {} to {}",
                    amount, display_currency, recipient.email
                ),
            }))
        }
        Err(e) => {
            error!("Database error during transfer: {:?}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to process transfer"
            })))
        }
    }
}

// Configure routes
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/transfer").service(internal_transfer));
}
