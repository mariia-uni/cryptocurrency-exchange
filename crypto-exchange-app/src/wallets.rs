use crate::auth;
use crate::db::DbPool;
use crate::models::{
    CreateWalletRequest, Cryptocurrency, GenerateAddressRequest, NewWallet, NewWalletAddress,
    NewWalletBalance, Wallet, WalletAddress, WalletAddressResponse, WalletBalance,
    WalletBalanceResponse, WalletResponseWithAddresses,
};
use crate::pricing;
use crate::schema::{wallet_addresses, wallet_balances, wallets};
use actix_web::{HttpRequest, HttpResponse, get, post, web};
use bigdecimal::BigDecimal;
use chrono::Utc;
use diesel::RunQueryDsl;
use diesel::prelude::*;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

pub mod crypto_addresses;

// Create a new multi-chain wallet
#[post("/create")]
pub async fn create_wallet(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    wallet_req: web::Json<CreateWalletRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    // Validate wallet type
    let wallet_type = wallet_req.wallet_type.to_uppercase();
    if wallet_type != "CUSTODIAL" && wallet_type != "NON_CUSTODIAL" {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid wallet type. Must be CUSTODIAL or NON_CUSTODIAL."
        })));
    }

    // Generate a default name if not provided
    let name = wallet_req
        .name
        .clone()
        .unwrap_or_else(|| "My Wallet".to_string());

    // Create new wallet record (chain-agnostic)
    let new_wallet = NewWallet {
        user_id,
        wallet_type: wallet_type.clone(),
        status: "ACTIVE".to_string(),
        name: name,
    };

    // Save to database
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_result = web::block(move || {
        diesel::insert_into(wallets::table)
            .values(&new_wallet)
            .get_result::<Wallet>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to create wallet: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to create wallet")
    })?;

    let wallet = wallet_result.map_err(|e| {
        error!("Diesel error creating wallet: {:?}", e);
        actix_web::error::ErrorInternalServerError("Database error creating wallet")
    })?;

    // Return the new wallet info
    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": "Wallet created successfully",
        "wallet": {
            "wallet_id": wallet.wallet_id,
            "user_id": wallet.user_id,
            "wallet_type": wallet.wallet_type,
            "name": wallet.name,
            "status": wallet.status,
            "created_at": wallet.created_at,
            "addresses": [],
            "balances": []
        }
    })))
}

// Update the validate_cryptocurrency function to allow any cryptocurrency in our database
async fn validate_cryptocurrency(
    cryptocurrency: &str,
    pool: &web::Data<DbPool>,
) -> Result<bool, actix_web::Error> {
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let cryptocurrency_clone = cryptocurrency.to_string();

    // Explicitly specify the return type of the closure to handle the inner Result
    let crypto_exists = web::block(move || -> Result<bool, diesel::result::Error> {
        use crate::schema::cryptocurrencies::dsl::*;
        let count = cryptocurrencies
            .filter(symbol.eq(cryptocurrency_clone))
            .filter(is_active.eq(true))
            .count()
            .get_result::<i64>(&mut conn)?;

        Ok(count > 0)
    })
    .await
    .map_err(|e| {
        error!("Database error when validating cryptocurrency: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to validate cryptocurrency")
    })?;

    // Unwrap the inner Result
    match crypto_exists {
        Ok(exists) => Ok(exists),
        Err(e) => {
            error!("Diesel error when validating cryptocurrency: {:?}", e);
            Err(actix_web::error::ErrorInternalServerError(
                "Database error validating cryptocurrency",
            ))
        }
    }
}

// Generate a cryptocurrency address for a wallet
#[post("/address/generate")]
pub async fn generate_address(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    address_req: web::Json<GenerateAddressRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    // Validate cryptocurrency
    let cryptocurrency = address_req.cryptocurrency.to_uppercase();

    // Check if cryptocurrency is in our database
    if !validate_cryptocurrency(&cryptocurrency, &pool).await? {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Unsupported cryptocurrency: {}", cryptocurrency)
        })));
    }

    // Verify wallet ownership and existence
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_id = address_req.wallet_id;
    let wallet = web::block(move || {
        wallets::table
            .filter(wallets::wallet_id.eq(wallet_id))
            .filter(wallets::user_id.eq(user_id))
            .first::<Wallet>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to verify wallet")
    })?;

    let wallet = match wallet {
        Ok(Some(w)) => w,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Wallet not found or you don't have permission to access it"
            })));
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error when verifying wallet"
            })));
        }
    };

    // Check if address for this cryptocurrency already exists
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let cryptocurrency_clone = cryptocurrency.clone();
    let existing_address = web::block(move || {
        wallet_addresses::table
            .filter(wallet_addresses::wallet_id.eq(wallet_id))
            .filter(wallet_addresses::cryptocurrency.eq(&cryptocurrency_clone))
            .first::<WalletAddress>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to check existing addresses")
    })?;

    if let Ok(Some(address)) = existing_address {
        // Address already exists for this cryptocurrency
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Address for {} already exists for this wallet", cryptocurrency),
            "address": address.address
        })));
    }

    // Generate a new address for the selected cryptocurrency
    let address_generator = crypto_addresses::create_address_generator(&cryptocurrency);
    let (address, private_key) = match address_generator.generate_address() {
        Ok((addr, key)) => (addr, key),
        Err(e) => {
            error!("Failed to generate address: {:?}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to generate cryptocurrency address"
            })));
        }
    };

    // Print private key to console for debugging (in a real system, this would be securely handled)
    info!(
        "Generated address for {} wallet {}: {}",
        cryptocurrency, wallet_id, address
    );
    info!("Private key (for demonstration only): {}", private_key);

    // Store the new address in the database
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let new_address = NewWalletAddress {
        wallet_id,
        cryptocurrency: cryptocurrency.clone(),
        address: address.clone(),
    };

    let saved_address = web::block(move || {
        diesel::insert_into(wallet_addresses::table)
            .values(&new_address)
            .get_result::<WalletAddress>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to save address: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to save address")
    })?
    .map_err(|e| {
        error!("Diesel error saving address: {:?}", e);
        actix_web::error::ErrorInternalServerError("Database error saving address")
    })?;

    // Create initial balance record with zero balance
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let new_balance = NewWalletBalance {
        wallet_id,
        cryptocurrency: cryptocurrency.clone(),
        balance: BigDecimal::from_str("0").unwrap(),
        usd_value: None,  // Initially zero USD value
        last_price: None, // No price initially
    };

    let _ = web::block(move || {
        diesel::insert_into(wallet_balances::table)
            .values(&new_balance)
            .on_conflict((wallet_balances::wallet_id, wallet_balances::cryptocurrency))
            .do_nothing()
            .execute(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to save initial balance: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to initialize balance")
    })?;

    // Return the saved address
    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": format!("{} address generated successfully", cryptocurrency),
        "address": {
            "cryptocurrency": saved_address.cryptocurrency,
            "address": saved_address.address,
            "created_at": saved_address.created_at
        }
    })))
}

// Get wallet details including all addresses and balances
#[get("/{wallet_id}")]
pub async fn get_wallet(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    path: web::Path<i64>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;
    let wallet_id = path.into_inner();

    // Get wallet, addresses, and balances
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    // Verify wallet ownership and existence
    let wallet = web::block(move || {
        wallets::table
            .filter(wallets::wallet_id.eq(wallet_id))
            .filter(wallets::user_id.eq(user_id))
            .first::<Wallet>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to retrieve wallet")
    })?;

    let wallet = match wallet {
        Ok(Some(w)) => w,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Wallet not found or you don't have permission to access it"
            })));
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error when retrieving wallet"
            })));
        }
    };

    // Get addresses for this wallet
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let addresses = web::block(move || {
        wallet_addresses::table
            .filter(wallet_addresses::wallet_id.eq(wallet_id))
            .load::<WalletAddress>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to load addresses: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to load wallet addresses")
    })?;

    // Get balances for this wallet
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let balances = web::block(move || {
        wallet_balances::table
            .filter(wallet_balances::wallet_id.eq(wallet_id))
            .load::<WalletBalance>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to load balances: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to load wallet balances")
    })?;

    // Construct response
    let addresses_response: Vec<WalletAddressResponse> = addresses
        .unwrap_or_default()
        .into_iter()
        .map(|addr| WalletAddressResponse {
            cryptocurrency: addr.cryptocurrency,
            address: addr.address,
            created_at: addr.created_at,
        })
        .collect();

    let balances_response: Vec<WalletBalanceResponse> = balances
        .unwrap_or_default()
        .into_iter()
        .map(|bal| WalletBalanceResponse {
            cryptocurrency: bal.cryptocurrency,
            balance: bal.balance.to_string(),
            last_updated: bal.last_updated,
            usd_value: bal.usd_value.as_ref().map(|val| val.to_string()),
            last_price: bal.last_price.as_ref().map(|price| price.to_string()),
        })
        .collect();

    let wallet_response = WalletResponseWithAddresses {
        wallet_id: wallet.wallet_id,
        user_id: wallet.user_id,
        wallet_type: wallet.wallet_type,
        name: wallet.name,
        status: wallet.status,
        created_at: wallet.created_at,
        addresses: addresses_response,
        balances: balances_response,
    };

    Ok(HttpResponse::Ok().json(serde_json::json!({ "wallet": wallet_response })))
}

// List all wallets with their addresses and balances
#[get("/list")]
pub async fn list_wallets(
    req: HttpRequest,
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    // Query all wallets for this user with proper error handling
    let mut conn = pool.get().map_err(|e| {
        error!("Failed to get DB connection: {}", e);
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let result = web::block(
        move || -> Result<Vec<WalletResponseWithAddresses>, diesel::result::Error> {
            // Get all cryptocurrencies from the database
            use crate::schema::cryptocurrencies::dsl as crypto_dsl;
            let all_cryptocurrencies = crypto_dsl::cryptocurrencies
                .filter(crypto_dsl::is_active.eq(true))
                .load::<Cryptocurrency>(&mut conn)?;

            // Get all wallets for this user
            let wallets: Vec<Wallet> = wallets::table
                .filter(wallets::user_id.eq(user_id))
                .load::<Wallet>(&mut conn)?;

            let mut wallet_responses = Vec::new();

            for wallet in wallets {
                // Get addresses for this wallet
                let addresses = wallet_addresses::table
                    .filter(wallet_addresses::wallet_id.eq(wallet.wallet_id))
                    .load::<WalletAddress>(&mut conn)?;

                // Get existing balances for this wallet
                let existing_balances = wallet_balances::table
                    .filter(wallet_balances::wallet_id.eq(wallet.wallet_id))
                    .load::<WalletBalance>(&mut conn)?;

                // Create a map of cryptocurrency symbol to balance
                let mut balance_map: std::collections::HashMap<String, WalletBalance> =
                    existing_balances
                        .into_iter()
                        .map(|b| (b.cryptocurrency.clone(), b))
                        .collect();

                // Create balance responses for all cryptocurrencies
                let mut balances_response: Vec<WalletBalanceResponse> = Vec::new();

                // Add all cryptocurrencies to the response
                for crypto in &all_cryptocurrencies {
                    // Check if we have a balance for this cryptocurrency
                    if let Some(balance) = balance_map.get(&crypto.symbol) {
                        // Use existing balance
                        balances_response.push(WalletBalanceResponse {
                            cryptocurrency: balance.cryptocurrency.clone(),
                            balance: balance.balance.to_string(),
                            last_updated: balance.last_updated,
                            usd_value: balance.usd_value.as_ref().map(|val| val.to_string()),
                            last_price: balance.last_price.as_ref().map(|price| price.to_string()),
                        });
                    } else {
                        // Create zero balance entry
                        balances_response.push(WalletBalanceResponse {
                            cryptocurrency: crypto.symbol.clone(),
                            balance: "0".to_string(),
                            last_updated: chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap(),
                            usd_value: None,  // No USD value for zero balance
                            last_price: None, // No price for zero balance
                        });
                    }
                }

                // Sort balances by cryptocurrency symbol
                balances_response.sort_by(|a, b| a.cryptocurrency.cmp(&b.cryptocurrency));

                let addresses_response = addresses
                    .iter()
                    .map(|addr| WalletAddressResponse {
                        cryptocurrency: addr.cryptocurrency.clone(),
                        address: addr.address.clone(),
                        created_at: addr.created_at,
                    })
                    .collect();

                wallet_responses.push(WalletResponseWithAddresses {
                    wallet_id: wallet.wallet_id,
                    user_id: wallet.user_id,
                    wallet_type: wallet.wallet_type,
                    name: wallet.name,
                    status: wallet.status,
                    created_at: wallet.created_at,
                    addresses: addresses_response,
                    balances: balances_response,
                });
            }

            Ok(wallet_responses)
        },
    )
    .await
    .map_err(|e| {
        error!("Error listing wallets: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to list wallets")
    })?;

    // Unwrap the inner Result
    let wallet_responses = result.map_err(|e| {
        error!("Diesel error listing wallets: {:?}", e);
        actix_web::error::ErrorInternalServerError("Database error listing wallets")
    })?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "wallets": wallet_responses })))
}

// Update wallet balance (for simulating trades, deposits, withdrawals)
#[post("/balance/update")]
pub async fn update_balance(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    balance_req: web::Json<UpdateBalanceRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Only admins or system processes should be able to update balances
    // In a real system, this would have stricter authorization
    let user_id = auth::extract_user_id(&req)?;

    // Verify wallet ownership
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_id = balance_req.wallet_id;
    let wallet = web::block(move || {
        wallets::table
            .filter(wallets::wallet_id.eq(wallet_id))
            .filter(wallets::user_id.eq(user_id))
            .first::<Wallet>(&mut conn)
            .optional()
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to verify wallet")
    })?;

    let wallet = match wallet {
        Ok(Some(w)) => w,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Wallet not found or you don't have permission to access it"
            })));
        }
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error when verifying wallet"
            })));
        }
    };

    // Validate cryptocurrency and amount
    let cryptocurrency = balance_req.cryptocurrency.to_uppercase();
    if !validate_cryptocurrency(&cryptocurrency, &pool).await? {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Invalid cryptocurrency: {}", cryptocurrency)
        })));
    }

    let amount = match BigDecimal::from_str(&balance_req.amount) {
        Ok(a) => a,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid amount format. Must be a valid decimal number."
            })));
        }
    };

    // Update the balance
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_id_inner = wallet_id;
    let cryptocurrency_inner = cryptocurrency.clone();
    let operation = balance_req.operation.to_uppercase();
    let operation_clone = operation.clone(); // Clone it before moving into closure

    let result = web::block(move || -> Result<WalletBalance, diesel::result::Error> {
        conn.transaction(|conn| {
            // Get current balance
            let current_balance = wallet_balances::table
                .filter(wallet_balances::wallet_id.eq(wallet_id_inner))
                .filter(wallet_balances::cryptocurrency.eq(&cryptocurrency_inner))
                .first::<WalletBalance>(conn)
                .optional()?;

            match current_balance {
                Some(balance) => {
                    // Calculate new balance based on operation
                    let new_balance = match operation_clone.as_str() {
                        // Use the clone here
                        "ADD" => balance.balance.clone() + amount.clone(),
                        "SUBTRACT" => {
                            let result = balance.balance.clone() - amount.clone();
                            if result < BigDecimal::from(0) {
                                return Err(diesel::result::Error::RollbackTransaction);
                            }
                            result
                        }
                        "SET" => amount.clone(),
                        _ => return Err(diesel::result::Error::RollbackTransaction),
                    };

                    // Update the balance
                    diesel::update(wallet_balances::table)
                        .filter(wallet_balances::id.eq(balance.id))
                        .set((
                            wallet_balances::balance.eq(new_balance),
                            wallet_balances::last_updated.eq(diesel::dsl::now),
                        ))
                        .get_result::<WalletBalance>(conn)
                }
                None => {
                    // Create a new balance record
                    if operation_clone == "SUBTRACT" {
                        // Use the clone here too
                        // Can't subtract from non-existent balance
                        return Err(diesel::result::Error::RollbackTransaction);
                    }

                    let new_balance = if operation_clone == "ADD" {
                        // And here
                        amount.clone()
                    } else {
                        // SET
                        amount.clone()
                    };

                    // Create a price future and execute it in the blocking context
                    let crypto_clone = cryptocurrency_inner.clone();
                    let price_future = pricing::get_current_price(&crypto_clone);
                    let price = match tokio::runtime::Handle::current().block_on(price_future) {
                        Ok(p) => {
                            let price_decimal = BigDecimal::from_str(&p.to_string()).unwrap_or_else(|_| BigDecimal::from_str("0").unwrap());
                            Some(price_decimal)
                        },
                        Err(_) => None,
                    };

                    // Calculate USD value if price is available
                    let usd_value = match &price {
                        Some(p) => Some(&new_balance * p),
                        None => None,
                    };

                    let new_balance_record = NewWalletBalance {
                        wallet_id: wallet_id_inner,
                        cryptocurrency: cryptocurrency_inner.clone(),
                        balance: new_balance,
                        usd_value,
                        last_price: price,
                    };

                    diesel::insert_into(wallet_balances::table)
                        .values(&new_balance_record)
                        .get_result::<WalletBalance>(conn)
                }
            }
        })
    })
    .await
    .map_err(|e| {
        error!("Failed to update balance: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to update balance")
    })?;

    match result {
        Ok(updated_balance) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "message": "Balance updated successfully",
            "balance": {
                "cryptocurrency": updated_balance.cryptocurrency,
                "balance": updated_balance.balance.to_string(),
                "last_updated": updated_balance.last_updated,
                "usd_value": updated_balance.usd_value.as_ref().map(|val| val.to_string()),
                "last_price": updated_balance.last_price.as_ref().map(|price| price.to_string())
            }
        }))),
        Err(_) => {
            if operation == "SUBTRACT" {
                Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Insufficient balance for subtraction"
                })))
            } else {
                Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to update balance"
                })))
            }
        }
    }
}

#[derive(Deserialize)]
pub struct UpdateBalanceRequest {
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub amount: String,
    pub operation: String, // "ADD", "SUBTRACT", or "SET"
}

// Register these functions in your main.rs app service
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/wallet")
            .service(create_wallet)
            .service(get_wallet)
            .service(list_wallets)
            .service(generate_address)
            .service(update_balance),
    );
}
