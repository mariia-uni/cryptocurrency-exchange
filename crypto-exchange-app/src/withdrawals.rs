use actix_web::{HttpRequest, HttpResponse, get, post, web};
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use uuid::Uuid;

use crate::auth;
use crate::db::DbPool;
use crate::models::{
    Cryptocurrency, NewWithdrawal, Wallet, WalletBalance, Withdrawal, WithdrawalHistoryItem,
    WithdrawalRequest, WithdrawalResponse,
};
use crate::schema::{cryptocurrencies, wallet_balances, wallets, withdrawals};
use crate::transactions;

// Get user withdrawal history
#[get("/history")]
pub async fn withdrawal_history(
    req: HttpRequest,
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    // Get user withdrawals ordered by creation date (newest first)
    let user_withdrawals = web::block(move || {
        withdrawals::table
            .filter(withdrawals::user_id.eq(user_id))
            .order_by(withdrawals::created_at.desc())
            .load::<Withdrawal>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Database error fetching withdrawals: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to fetch withdrawal history")
    })?
    .map_err(|e| {
        error!("Query error fetching withdrawals: {:?}", e);
        actix_web::error::ErrorInternalServerError(
            "Database error when fetching withdrawal history",
        )
    })?;

    // Convert to response DTOs
    let history_items: Vec<WithdrawalHistoryItem> = user_withdrawals
        .into_iter()
        .map(|w| WithdrawalHistoryItem {
            id: w.id,
            transaction_id: w.transaction_id,
            cryptocurrency: w.cryptocurrency,
            amount: w.amount.to_string(),
            fee: w.fee.to_string(),
            address: w.address,
            blockchain: w.blockchain,
            status: w.status,
            created_at: w.created_at,
            updated_at: w.updated_at,
            completed_at: w.completed_at,
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "withdrawals": history_items
    })))
}

// Submit a withdrawal request
#[post("/submit")]
pub async fn submit_withdrawal(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    withdrawal_req: web::Json<WithdrawalRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;

    // Validate the wallet belongs to the user
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_id_value = withdrawal_req.wallet_id;
    let user_id_value = user_id;

    let wallet_option = web::block(move || {
        wallets::table
            .filter(wallets::wallet_id.eq(wallet_id_value))
            .filter(wallets::user_id.eq(user_id_value))
            .first::<Wallet>(&mut conn)
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
    })?;

    if wallet_option.is_none() {
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "You do not have permission to withdraw from this wallet"
        })));
    }

    // Clone fields for the second web::block
    let cryptocurrency_value = withdrawal_req.cryptocurrency.clone();

    // Validate cryptocurrency exists
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let crypto_option = web::block(move || {
        cryptocurrencies::table
            .filter(cryptocurrencies::symbol.eq(&cryptocurrency_value))
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
    let amount = match BigDecimal::from_str(&withdrawal_req.amount) {
        Ok(amount) => amount,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid withdrawal amount"
            })));
        }
    };

    // Check if amount is positive
    if amount <= BigDecimal::from(0) {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Withdrawal amount must be greater than zero"
        })));
    }

    // Fixed fee for the example (in a real system, this would be dynamic)
    let fee =
        BigDecimal::from_str("0.000113").unwrap_or_else(|_| BigDecimal::from_str("0").unwrap());

    // Generate a transaction ID
    let transaction_id = format!(
        "WD-{}-{}",
        chrono::Utc::now().timestamp(),
        Uuid::new_v4().to_string()[..8].to_string()
    );

    // Validate balance and update it
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;

    let wallet_id_clone = withdrawal_req.wallet_id;
    let crypto_clone = withdrawal_req.cryptocurrency.clone();
    let amount_clone = amount.clone();
    let fee_clone = fee.clone();

    let balance_update_result = web::block(move || -> Result<(), diesel::result::Error> {
        conn.transaction(|conn| {
            // Check current balance
            let balance = wallet_balances::table
                .filter(wallet_balances::wallet_id.eq(wallet_id_clone))
                .filter(wallet_balances::cryptocurrency.eq(&crypto_clone))
                .first::<WalletBalance>(conn)?;

            // Validate sufficient balance
            if balance.balance < &amount_clone + &fee_clone {
                return Err(diesel::result::Error::RollbackTransaction);
            }

            // Subtract amount and fee from balance
            let new_balance = &balance.balance - &amount_clone - &fee_clone;

            // Update the balance
            diesel::update(wallet_balances::table.find(balance.id))
                .set(wallet_balances::balance.eq(&new_balance))
                .execute(conn)?;

            Ok(())
        })
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to update balance")
    })?;

    match balance_update_result {
        Ok(_) => {
            // Successfully updated balance, now record the withdrawal
            let mut conn = pool.get().map_err(|_| {
                actix_web::error::ErrorInternalServerError("Database connection error")
            })?;

            let new_withdrawal = NewWithdrawal {
                user_id,
                wallet_id: withdrawal_req.wallet_id,
                transaction_id: transaction_id.clone(),
                cryptocurrency: withdrawal_req.cryptocurrency.clone(),
                amount: amount.clone(),
                fee: fee.clone(),
                address: withdrawal_req.address.clone(),
                blockchain: withdrawal_req.blockchain.clone(),
                withdrawal_type: withdrawal_req.withdrawal_type.clone(),
                status: "pending".to_string(), // Default status
            };

            let withdrawal_result = web::block(move || {
                diesel::insert_into(withdrawals::table)
                    .values(&new_withdrawal)
                    .get_result::<Withdrawal>(&mut conn)
            })
            .await
            .map_err(|e| {
                error!("Failed to save withdrawal: {:?}", e);
                actix_web::error::ErrorInternalServerError("Failed to save withdrawal")
            })?;

            match withdrawal_result {
                Ok(_) => {
                    // Record the transaction
                    let trans_result = transactions::create_transaction(
                        &pool,
                        user_id,
                        withdrawal_req.wallet_id,
                        amount.clone(),
                        withdrawal_req.cryptocurrency.clone(),
                        "withdrawal".to_string(),
                        transaction_id.clone(),
                        Some(withdrawal_req.blockchain.clone()),
                        Some(withdrawal_req.address.clone()),
                        Some(fee.clone()),
                    )
                    .await;

                    if let Err(e) = trans_result {
                        error!("Failed to record transaction: {:?}", e);
                        // Continue anyway - the withdrawal was successful
                    }

                    Ok(HttpResponse::Ok().json(WithdrawalResponse {
                        success: true,
                        transaction_id,
                        status: "pending".to_string(),
                        message: format!(
                            "Successfully submitted withdrawal request for {} {}",
                            withdrawal_req.amount, withdrawal_req.cryptocurrency
                        ),
                    }))
                }
                Err(e) => {
                    error!("Database error saving withdrawal: {:?}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to save withdrawal record"
                    })))
                }
            }
        }
        Err(_) => {
            // Either insufficient balance or database error
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Insufficient balance for withdrawal including fee"
            })))
        }
    }
}

pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/withdrawal")
            .service(withdrawal_history)
            .service(submit_withdrawal),
    );
}
