use crate::db::DbPool;
use crate::models::{Wallet, NewWallet};
use crate::schema::wallets;
use actix_web::{web, HttpRequest, HttpResponse, get, post};
use diesel::prelude::*;
use diesel::RunQueryDsl;
use rand::{thread_rng, Rng};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use hex;
use k256::elliptic_curve::{ScalarCore, sec1::EncodedPoint};
use k256::{PublicKey, SecretKey};
use k256::elliptic_curve::sec1::ToEncodedPoint;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use chrono::Utc;
use std::str::FromStr;
use crate::auth;

#[derive(Deserialize)]
pub struct CreateWalletRequest {
    pub wallet_type: String,
    pub network: String,
}

#[derive(Serialize)]
pub struct WalletResponse {
    pub wallet_id: i64,
    pub user_id: i32,
    pub wallet_type: String,
    pub address: String,
    pub network: String,
    pub status: String,
    pub created_at: chrono::NaiveDateTime,
}

impl From<Wallet> for WalletResponse {
    fn from(wallet: Wallet) -> Self {
        Self {
            wallet_id: wallet.wallet_id,
            user_id: wallet.user_id,
            wallet_type: wallet.wallet_type,
            address: wallet.address,
            network: wallet.network,
            status: wallet.status,
            created_at: wallet.created_at,
        }
    }
}

// Mock mnemonic generator for non-custodial wallets
fn generate_seed_phrase() -> String {
    // List of BIP-39 words (abbreviated for simplicity)
    const WORDS: [&str; 20] = [
        "abandon", "ability", "able", "about", "above",
        "absent", "absorb", "abstract", "absurd", "abuse",
        "access", "accident", "account", "accuse", "achieve",
        "acid", "acoustic", "acquire", "across", "act",
    ];
    
    // Generate 12 random words for the seed phrase
    let mut rng = thread_rng();
    let phrase: Vec<&str> = (0..12)
        .map(|_| WORDS[rng.gen_range(0..WORDS.len())])
        .collect();
    
    phrase.join(" ")
}

// Generate a private key as a 256-bit random number
fn generate_private_key() -> SecretKey {
    let mut rng = thread_rng();
    
    // Use the built-in random generation from k256
    SecretKey::random(&mut rng)
}

// Derive public key from private key using elliptic curve multiplication
fn derive_public_key(private_key: &SecretKey) -> PublicKey {
    PublicKey::from_secret_scalar(&private_key.to_nonzero_scalar())
}

// Generate Ethereum address from public key
fn generate_ethereum_address(public_key: &PublicKey) -> String {
    // Convert public key to uncompressed bytes (65 bytes, starting with 0x04)
    let public_key_bytes = public_key.to_encoded_point(false);
    
    // Skip the first byte (0x04) which indicates uncompressed format
    let public_key_bytes = &public_key_bytes.as_bytes()[1..];
    
    // Hash the public key with Keccak-256
    let mut hasher = Keccak256::new_with_prefix(public_key_bytes);
    let hash = hasher.finalize();
    
    // Take the last 20 bytes of the hash
    let eth_address = &hash[12..32];
    
    // Convert to checksummed address according to EIP-55
    let address = format!("0x{}", hex::encode(eth_address));
    
    // Apply EIP-55 checksum
    eip55_checksum(&address)
}

// Implementation of EIP-55 checksum
fn eip55_checksum(address: &str) -> String {
    // Remove '0x' prefix if present
    let address_no_prefix = if address.starts_with("0x") {
        &address[2..]
    } else {
        address
    };
    
    // Convert to lowercase
    let address_lower = address_no_prefix.to_lowercase();
    
    // Hash the lowercase address
    // Hash the lowercase address
    let mut hasher = Keccak256::new_with_prefix(address_lower.as_bytes());
    let hash = hasher.finalize();
    
    // Apply checksum rules
    let mut checksummed = String::with_capacity(42); // 0x + 40 hex chars
    checksummed.push_str("0x");
    
    for (i, ch) in address_lower.char_indices() {
        if ch.is_digit(16) { // If it's a hex digit
            // Check if the corresponding hash nibble is >= 8
            let hash_byte = hash[i / 2];
            let hash_nibble = if i % 2 == 0 {
                hash_byte >> 4
            } else {
                hash_byte & 0x0F
            };
            
            if hash_nibble >= 8 {
                // Convert to uppercase if the hash nibble is >= 8
                checksummed.push(ch.to_ascii_uppercase());
            } else {
                checksummed.push(ch);
            }
        } else {
            checksummed.push(ch);
        }
    }
    
    checksummed
}

// Encrypt private key or seed phrase with AES-256-GCM
fn encrypt_sensitive_data(data: &str, secret_key: &[u8]) -> Result<(String, String, String), String> {
    let mut rng = thread_rng();
    
    // Generate a random 12-byte nonce
    let mut nonce_bytes = [0u8; 12];
    rng.fill(&mut nonce_bytes);
    
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // Create cipher instance
    let cipher = match Aes256Gcm::new_from_slice(secret_key) {
        Ok(c) => c,
        Err(_) => return Err("Failed to create cipher".to_string()),
    };
    
    // Encrypt the data
    let ciphertext = match cipher.encrypt(nonce, data.as_bytes().as_ref()) {
        Ok(c) => c,
        Err(_) => return Err("Encryption failed".to_string()),
    };
    
    // Convert to hex for storage
    let encrypted_data = hex::encode(&ciphertext);
    let iv = hex::encode(nonce_bytes);
    
    // For simplicity, use part of the ciphertext as the auth tag
    // In a real implementation, you would properly extract the auth tag from the AES-GCM operation
    let auth_tag = hex::encode(&ciphertext[ciphertext.len().saturating_sub(16)..]);
    
    Ok((encrypted_data, iv, auth_tag))
}

// Get the application encryption key - in a real app, this would be properly managed
fn get_encryption_key() -> [u8; 32] {
    // In production, this would be securely stored and retrieved,
    // possibly using a KMS or secure environment variables
    let mut key = [0u8; 32];
    
    // Use a hardcoded value for the mock implementation
    // IMPORTANT: This is for demonstration only!
    let mock_key = b"cryptocurrency-exchange-mock-key-32";
    key.copy_from_slice(&mock_key[0..32]);
    
    key
}

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
    
    // Validate network
    let network = wallet_req.network.to_uppercase();
    if network != "ETHEREUM" && network != "ETHEREUM_TESTNET" {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid network. Must be ETHEREUM or ETHEREUM_TESTNET."
        })));
    }
    
    // Generate private key and derive public key and address
    let private_key = generate_private_key();
    let public_key = derive_public_key(&private_key);
    let address = generate_ethereum_address(&public_key);
    
    // Convert to string representations
    
    let private_key_hex = hex::encode(private_key.to_nonzero_scalar().to_bytes());
    let public_key_hex = hex::encode(public_key.to_encoded_point(false).as_bytes());
    
    // Get encryption key for securing sensitive data
    let encryption_key = get_encryption_key();
    
    // Encrypt private key
    let (encrypted_private_key, encryption_iv, encryption_auth_tag) = 
        encrypt_sensitive_data(&private_key_hex, &encryption_key)
            .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
    
    // For NON_CUSTODIAL wallets, generate and encrypt a seed phrase
    let (seed_phrase_encrypted, seed_phrase_iv, seed_phrase_auth_tag) = if wallet_type == "NON_CUSTODIAL" {
        let seed_phrase = generate_seed_phrase();
        let (encrypted, iv, tag) = encrypt_sensitive_data(&seed_phrase, &encryption_key)
            .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
        (Some(encrypted), Some(iv), Some(tag))
    } else {
        (None, None, None)
    };
    
    // Create new wallet record
    let new_wallet = NewWallet {
        user_id,
        wallet_type: wallet_type.clone(),
        address: address.clone(),
        public_key: public_key_hex,
        encrypted_private_key,
        encryption_iv,
        encryption_auth_tag,
        seed_phrase_encrypted,
        seed_phrase_iv,
        seed_phrase_auth_tag,
        network: network.clone(),
        status: "ACTIVE".to_string(),
    };
    
    // Save to database
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;
    
    let wallet = web::block(move || {
        diesel::insert_into(wallets::table)
            .values(&new_wallet)
            .get_result::<Wallet>(&mut conn)
    })
    .await
    .map_err(|e| {
        log::error!("Failed to create wallet: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to create wallet")
    })?
    .map_err(|e| {
        log::error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to create wallet")
    })?;
    
    // Return the new wallet info (excluding sensitive data)
    let wallet_response = WalletResponse::from(wallet);
    
    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": "Wallet created successfully",
        "wallet": wallet_response
    })))
}

#[get("/list")]
pub async fn list_wallets(
    req: HttpRequest,
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token
    let user_id = auth::extract_user_id(&req)?;
    
    // Query all wallets for this user
    let mut conn = pool
        .get()
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection error"))?;
    
    let wallets = web::block(move || {
        wallets::table
            .filter(wallets::user_id.eq(user_id))
            .load::<Wallet>(&mut conn)
    })
    .await
    .map_err(|e| {
        log::error!("Failed to list wallets: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to list wallets")
    })?
    .map_err(|e| {
        log::error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Failed to list wallets")
    })?;
    
    // Convert wallets to response DTOs
    let wallet_responses: Vec<WalletResponse> = wallets
        .into_iter()
        .map(WalletResponse::from)
        .collect();
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "wallets": wallet_responses
    })))
}

// Register these functions in your main.rs app service
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/wallet")
            .service(create_wallet)
            .service(list_wallets)
    );
}