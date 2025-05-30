use actix_web::{HttpRequest, HttpResponse, web};
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use log::{error, info};
use serde::{Deserialize, Serialize};

use crate::auth;
use crate::db::DbPool;
use crate::models::{NewTransaction, Transaction, TransactionResponse};
use crate::schema::{transactions, users, wallets};

// Create a transaction record
pub async fn create_transaction(
    pool: &web::Data<DbPool>,
    user_id: i32,
    wallet_id: i64,
    amount: BigDecimal,
    cryptocurrency: String,
    transaction_type: String,
    transaction_hash: String,
    blockchain: Option<String>,
    address: Option<String>,
    fee: Option<BigDecimal>,
) -> Result<Transaction, actix_web::Error> {
    let mut conn = pool.get().map_err(|e| {
        error!("Failed to get database connection: {:?}", e);
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    let new_transaction = NewTransaction {
        user_id,
        wallet_id,
        amount,
        cryptocurrency,
        transaction_type,
        transaction_hash,
        status: "completed".to_string(),
        blockchain,
        address,
        fee,
    };

    web::block(move || {
        diesel::insert_into(transactions::table)
            .values(&new_transaction)
            .get_result::<Transaction>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to insert transaction record: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to record transaction")
    })?
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })
}

// Get user's transaction history
#[derive(Deserialize)]
pub struct TransactionFilters {
    pub transaction_type: Option<String>,
    pub cryptocurrency: Option<String>,
    pub from_date: Option<chrono::NaiveDateTime>,
    pub to_date: Option<chrono::NaiveDateTime>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn get_user_transactions(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    filters: web::Query<TransactionFilters>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    let mut conn = pool.get().map_err(|_| {
        actix_web::error::ErrorInternalServerError("Failed to get database connection")
    })?;

    // Build query with filters
    let limit = filters.limit.unwrap_or(50).min(100); // Limit to 100 max
    let offset = filters.offset.unwrap_or(0);

    // Copy values before moving into closure
    let user_id_copy = user_id;
    let transaction_type = filters.transaction_type.clone();
    let cryptocurrency = filters.cryptocurrency.clone();
    let from_date = filters.from_date;
    let to_date = filters.to_date;

    let transactions_result = web::block(move || {
        // Start with base query
        let mut query = transactions::table
            .filter(transactions::user_id.eq(user_id_copy))
            .order_by(transactions::created_at.desc())
            .limit(limit)
            .offset(offset)
            .into_boxed();

        // Apply filters if provided
        if let Some(tx_type) = transaction_type {
            query = query.filter(transactions::transaction_type.eq(tx_type));
        }

        if let Some(crypto) = cryptocurrency {
            query = query.filter(transactions::cryptocurrency.eq(crypto));
        }

        if let Some(from) = from_date {
            query = query.filter(transactions::created_at.ge(from));
        }

        if let Some(to) = to_date {
            query = query.filter(transactions::created_at.le(to));
        }

        // Execute query
        query.load::<Transaction>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Failed to fetch transactions: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch transactions")
    })?;

    match transactions_result {
        Ok(txs) => {
            // Convert to response DTOs
            let transaction_responses: Vec<TransactionResponse> =
                txs.into_iter().map(TransactionResponse::from).collect();

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "transactions": transaction_responses,
                "count": transaction_responses.len(),
                "offset": offset,
                "limit": limit
            })))
        }
        Err(e) => {
            error!("Database error: {:?}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve transaction history"
            })))
        }
    }
}

// API endpoint to get transaction history
#[actix_web::get("/history")]
pub async fn transaction_history(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    filters: web::Query<TransactionFilters>,
) -> Result<HttpResponse, actix_web::Error> {
    get_user_transactions(req, pool, filters).await
}

// Add new struct for the response
#[derive(Serialize)]
pub struct TransactionHistoryItem {
    pub id: i32,
    pub transaction_id: String,
    pub cryptocurrency: String,
    pub amount: String,
    pub fee: String,
    pub address: String,
    pub blockchain: Option<String>,
    pub transaction_type: String,
    pub is_internal: bool,
    pub status: String,
    pub created_at: chrono::NaiveDateTime,
}

// API endpoint to get complete transaction history
#[actix_web::get("/history/all")]
pub async fn complete_transaction_history(
    req: HttpRequest,
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    // Get all transactions for this user
    let transactions_result = web::block(move || {
        transactions::table
            .filter(transactions::user_id.eq(user_id))
            .order_by(transactions::created_at.desc())
            .load::<Transaction>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch transaction history")
    })?;

    match transactions_result {
        Ok(txs) => {
            // Convert to response DTOs with direction and type information
            let history_items: Vec<TransactionHistoryItem> = txs
                .into_iter()
                .map(|tx| {
                    // Determine if internal transfer by checking transaction type and blockchain presence
                    let is_internal = tx.transaction_type == "transfer" && tx.blockchain.is_none();

                    TransactionHistoryItem {
                        id: tx.id,
                        transaction_id: tx.transaction_hash.clone(),
                        cryptocurrency: tx.cryptocurrency,
                        amount: tx.amount.to_string(),
                        fee: tx
                            .fee
                            .map(|f| f.to_string())
                            .unwrap_or_else(|| "0".to_string()),
                        address: tx.address.unwrap_or_else(|| "".to_string()),
                        blockchain: tx.blockchain,
                        transaction_type: tx.transaction_type,
                        is_internal,
                        status: tx.status,
                        created_at: tx.created_at,
                    }
                })
                .collect();

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "transactions": history_items
            })))
        }
        Err(e) => {
            error!("Database query error: {:?}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to retrieve transaction history"
            })))
        }
    }
}

// Configure transaction routes
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/transactions")
            .service(transaction_history)
            .service(complete_transaction_history),
    );
}
