use bigdecimal::BigDecimal;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Queryable, Selectable, Debug, Clone, Serialize)]
#[diesel(table_name = crate::schema::users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub password: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_admin: bool, // Add this new field
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::users)]
pub struct NewUser {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_admin: bool, // Add this new field
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        UserResponse {
            id: user.id,
            username: user.username,
            email: user.email,
            created_at: user.created_at,
            is_admin: user.is_admin, // Add this new field
        }
    }
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Queryable, Selectable, Debug, Clone, Serialize)]
#[diesel(table_name = crate::schema::user_verifications)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct UserVerification {
    pub id: i32,
    pub user_id: i32,
    pub first_name: String,
    pub last_name: String,
    pub dob_day: i32,
    pub dob_month: i32,
    pub dob_year: i32,
    pub street_address: String,
    pub apartment: Option<String>,
    pub city: String,
    pub postal_code: String,
    pub country_code: String,
    pub phone_number: String,
    pub occupation: String,
    pub verification_status: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub id_front_path: Option<String>,
    pub id_verification_status: String,
    pub id_verified_at: Option<chrono::NaiveDateTime>,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::user_verifications)]
pub struct NewUserVerification {
    pub user_id: i32,
    pub first_name: String,
    pub last_name: String,
    pub dob_day: i32,
    pub dob_month: i32,
    pub dob_year: i32,
    pub street_address: String,
    pub apartment: Option<String>,
    pub city: String,
    pub postal_code: String,
    pub country_code: String,
    pub phone_number: String,
    pub occupation: String,
}

#[derive(Deserialize)]
pub struct VerificationRequest {
    pub first_name: String,
    pub last_name: String,
    pub dob_day: i32,
    pub dob_month: i32,
    pub dob_year: i32,
    pub street_address: String,
    pub apartment: Option<String>,
    pub city: String,
    pub postal_code: String,
    pub country_code: String,
    pub phone_number: String,
    pub occupation: String,
}

#[derive(Serialize)]
pub struct VerificationResponse {
    pub id: i32,
    pub verification_status: String,
    pub created_at: chrono::NaiveDateTime,
    pub id_document: Option<IdDocumentResponse>,
}

impl From<UserVerification> for VerificationResponse {
    fn from(verification: UserVerification) -> Self {
        let id_document = if verification.id_front_path.is_some() {
            Some(IdDocumentResponse {
                id_verification_status: verification.id_verification_status,
                id_front_path: verification.id_front_path,
                id_verified_at: verification.id_verified_at,
            })
        } else {
            None
        };

        Self {
            id: verification.id,
            verification_status: verification.verification_status,
            created_at: verification.created_at,
            id_document,
        }
    }
}

impl<E> From<Result<UserVerification, E>> for VerificationResponse {
    fn from(verification_result: Result<UserVerification, E>) -> Self {
        match verification_result {
            Ok(verification) => Self {
                id: verification.id,
                verification_status: verification.verification_status,
                created_at: verification.created_at,
                id_document: if verification.id_front_path.is_some() {
                    Some(IdDocumentResponse {
                        id_verification_status: verification.id_verification_status,
                        id_front_path: verification.id_front_path,
                        id_verified_at: verification.id_verified_at,
                    })
                } else {
                    None
                },
            },
            Err(_) => {
                // Provide default values for error case
                Self {
                    id: 0,
                    verification_status: "error".to_string(),
                    created_at: chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap_or_default(),
                    id_document: None,
                }
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct IdDocumentResponse {
    pub id_verification_status: String,
    pub id_front_path: Option<String>,
    pub id_verified_at: Option<chrono::NaiveDateTime>,
}

// Add this struct for password reset requests
#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordResetRequest {
    pub email: String,
}

// If you want to implement password reset tokens, you should also add:
#[derive(Debug, Queryable, Insertable)]
#[diesel(table_name = crate::schema::password_reset_tokens)]
pub struct PasswordResetToken {
    pub id: i32,
    pub user_id: i32,
    pub token: String,
    pub created_at: chrono::NaiveDateTime,
    pub expires_at: chrono::NaiveDateTime,
    pub used: bool,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = crate::schema::password_reset_tokens)]
pub struct NewPasswordResetToken {
    pub user_id: i32,
    pub token: String,
    pub expires_at: chrono::NaiveDateTime,
}

// Add this new model for password reset validation

#[derive(Debug, Serialize, Deserialize)]
pub struct ResetPasswordRequest {
    pub email: String,
    pub token: String,
    pub new_password: String,
}

// Wallet model matching the database schema
#[derive(Queryable, Serialize, Debug)]
pub struct Wallet {
    pub wallet_id: i64,
    pub user_id: i32,
    pub wallet_type: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub status: String,
    pub name: String,
}

// For inserting new wallets
#[derive(Insertable, Debug)]
#[diesel(table_name = crate::schema::wallets)]
pub struct NewWallet {
    pub user_id: i32,
    pub wallet_type: String,
    pub status: String,
    pub name: String,
}

// New models for wallet addresses
#[derive(Queryable, Serialize, Debug)]
pub struct WalletAddress {
    pub id: i32,
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub address: String,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = crate::schema::wallet_addresses)]
pub struct NewWalletAddress {
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub address: String,
}

// Models for wallet balances
#[derive(Queryable, Serialize, Debug)]
pub struct WalletBalance {
    pub id: i32,
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub balance: BigDecimal,
    pub last_updated: chrono::NaiveDateTime,
    pub usd_value: Option<BigDecimal>,  // New field
    pub last_price: Option<BigDecimal>, // New field
}

#[derive(Insertable, Debug)]
#[diesel(table_name = crate::schema::wallet_balances)]
pub struct NewWalletBalance {
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub balance: BigDecimal,
    pub usd_value: Option<BigDecimal>,  // New field
    pub last_price: Option<BigDecimal>, // New field
}

// Wallet response DTO with cryptocurrency addresses and balances
#[derive(Serialize)]
pub struct WalletResponseWithAddresses {
    pub wallet_id: i64,
    pub user_id: i32,
    pub wallet_type: String,
    pub name: String,
    pub status: String,
    pub created_at: chrono::NaiveDateTime,
    pub addresses: Vec<WalletAddressResponse>,
    pub balances: Vec<WalletBalanceResponse>,
}

#[derive(Serialize)]
pub struct WalletAddressResponse {
    pub cryptocurrency: String,
    pub address: String,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Serialize)]
pub struct WalletBalanceResponse {
    pub cryptocurrency: String,
    pub balance: String,
    pub last_updated: chrono::NaiveDateTime,
    pub usd_value: Option<String>,  // New field
    pub last_price: Option<String>, // New field
}

// Request model for creating a new wallet
#[derive(Deserialize)]
pub struct CreateWalletRequest {
    pub wallet_type: String,
    pub name: Option<String>,
}

// Request model for generating a cryptocurrency address
#[derive(Deserialize)]
pub struct GenerateAddressRequest {
    pub wallet_id: i64,
    pub cryptocurrency: String,
}

// Cryptocurrency model
#[derive(Queryable, Serialize, Debug)]
pub struct Cryptocurrency {
    pub id: i32,
    pub symbol: String,
    pub name: String,
    pub cmc_id: i32,
    pub is_active: bool,
    pub icon_url: Option<String>,
    pub last_updated: chrono::NaiveDateTime,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = crate::schema::cryptocurrencies)]
pub struct NewCryptocurrency {
    pub symbol: String,
    pub name: String,
    pub cmc_id: i32,
    pub is_active: bool,
    pub icon_url: Option<String>,
}

// API response struct for cryptocurrencies
#[derive(Serialize)]
pub struct CryptocurrencyResponse {
    pub symbol: String,
    pub name: String,
    pub icon_url: Option<String>,
    pub is_active: bool,
}

// Transaction model matching the database schema
#[derive(Queryable, Serialize, Debug)]
pub struct Transaction {
    pub id: i32,
    pub user_id: i32,
    pub wallet_id: i64,
    pub amount: BigDecimal,
    pub cryptocurrency: String,
    pub transaction_type: String,
    pub transaction_hash: String,
    pub status: String,
    pub blockchain: Option<String>,
    pub address: Option<String>,
    pub fee: Option<BigDecimal>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

// For inserting new transactions
#[derive(Insertable, Debug)]
#[diesel(table_name = crate::schema::transactions)]
pub struct NewTransaction {
    pub user_id: i32,
    pub wallet_id: i64,
    pub amount: BigDecimal,
    pub cryptocurrency: String,
    pub transaction_type: String,
    pub transaction_hash: String,
    pub status: String,
    pub blockchain: Option<String>,
    pub address: Option<String>,
    pub fee: Option<BigDecimal>,
}

// Response DTO for transaction history
#[derive(Serialize)]
pub struct TransactionResponse {
    pub id: i32,
    pub wallet_id: i64,
    pub amount: String,
    pub cryptocurrency: String,
    pub transaction_type: String,
    pub transaction_hash: String,
    pub status: String,
    pub blockchain: Option<String>,
    pub address: Option<String>,
    pub fee: Option<String>,
    pub created_at: chrono::NaiveDateTime,
}

impl From<Transaction> for TransactionResponse {
    fn from(tx: Transaction) -> Self {
        TransactionResponse {
            id: tx.id,
            wallet_id: tx.wallet_id,
            amount: tx.amount.to_string(),
            cryptocurrency: tx.cryptocurrency,
            transaction_type: tx.transaction_type,
            transaction_hash: tx.transaction_hash,
            status: tx.status,
            blockchain: tx.blockchain,
            address: tx.address,
            fee: tx.fee.map(|f| f.to_string()),
            created_at: tx.created_at,
        }
    }
}

// Models for withdrawals
#[derive(Queryable, Serialize, Debug)]
pub struct Withdrawal {
    pub id: i32,
    pub user_id: i32,
    pub wallet_id: i64,
    pub transaction_id: String,
    pub cryptocurrency: String,
    pub amount: BigDecimal,
    pub fee: BigDecimal,
    pub address: String,
    pub blockchain: String,
    pub withdrawal_type: String,
    pub status: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub completed_at: Option<chrono::NaiveDateTime>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = crate::schema::withdrawals)]
pub struct NewWithdrawal {
    pub user_id: i32,
    pub wallet_id: i64,
    pub transaction_id: String,
    pub cryptocurrency: String,
    pub amount: BigDecimal,
    pub fee: BigDecimal,
    pub address: String,
    pub blockchain: String,
    pub withdrawal_type: String,
    pub status: String,
}

// Request DTO for withdrawal
#[derive(Deserialize)]
pub struct WithdrawalRequest {
    pub wallet_id: i64,
    pub cryptocurrency: String,
    pub amount: String,
    pub address: String,
    pub blockchain: String,
    pub withdrawal_type: String,
}

// Response DTO for withdrawal
#[derive(Serialize)]
pub struct WithdrawalResponse {
    pub success: bool,
    pub transaction_id: String,
    pub status: String,
    pub message: String,
}

// Response DTO for withdrawal history
#[derive(Serialize)]
pub struct WithdrawalHistoryItem {
    pub id: i32,
    pub transaction_id: String,
    pub cryptocurrency: String,
    pub amount: String,
    pub fee: String,
    pub address: String,
    pub blockchain: String,
    pub status: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub completed_at: Option<chrono::NaiveDateTime>,
}
