use bs58;
use k256::SecretKey;
use k256::elliptic_curve::sec1::ToEncodedPoint;
use log::{error, info};
use rand::{Rng, thread_rng};
use ripemd160::{Digest as Ripemd160Digest, Ripemd160};
use secp256k1::{PublicKey as Secp256k1PublicKey, Secp256k1};
use sha2::{Digest as Sha256Digest, Sha256};
use sha3::{Digest, Keccak256};
use std::error::Error;

// Interface for cryptocurrency address generators
pub trait AddressGenerator {
    fn generate_address(&self) -> Result<(String, String), Box<dyn Error>>;
}

// Ethereum address generator
pub struct EthereumAddressGenerator;

impl AddressGenerator for EthereumAddressGenerator {
    fn generate_address(&self) -> Result<(String, String), Box<dyn Error>> {
        // Generate private key
        let mut rng = thread_rng();
        let private_key = SecretKey::random(&mut rng);

        // Derive public key
        let public_key = k256::PublicKey::from_secret_scalar(&private_key.to_nonzero_scalar());

        // Convert to Ethereum address
        let address = generate_ethereum_address(&public_key);

        // Convert private key to hex for return
        let private_key_hex = hex::encode(private_key.to_be_bytes());

        Ok((address, private_key_hex))
    }
}

// Bitcoin address generator
pub struct BitcoinAddressGenerator {
    testnet: bool,
}

impl BitcoinAddressGenerator {
    pub fn new(testnet: bool) -> Self {
        Self { testnet }
    }
}

impl AddressGenerator for BitcoinAddressGenerator {
    fn generate_address(&self) -> Result<(String, String), Box<dyn Error>> {
        // Create secp256k1 context
        let secp = Secp256k1::new();

        // Generate random private key
        let mut rng = thread_rng();
        let mut private_key_bytes = [0u8; 32];
        rng.fill(&mut private_key_bytes);

        // Convert to secp256k1 private key
        let private_key = secp256k1::SecretKey::from_slice(&private_key_bytes)?;

        // Derive public key
        let public_key = Secp256k1PublicKey::from_secret_key(&secp, &private_key);
        let public_key_bytes = public_key.serialize();

        // Generate Bitcoin address
        let address = if self.testnet {
            generate_bitcoin_testnet_address(&public_key_bytes)?
        } else {
            generate_bitcoin_mainnet_address(&public_key_bytes)?
        };

        // Convert private key to WIF format for future use
        let private_key_hex = hex::encode(private_key.secret_bytes());

        Ok((address, private_key_hex))
    }
}

// Factory for creating appropriate address generator
pub fn create_address_generator(cryptocurrency: &str) -> Box<dyn AddressGenerator> {
    // For Bitcoin and variants, use BitcoinAddressGenerator
    if cryptocurrency.starts_with("BTC") {
        if cryptocurrency.contains("TESTNET") {
            return Box::new(BitcoinAddressGenerator::new(true));
        } else {
            return Box::new(BitcoinAddressGenerator::new(false));
        }
    }

    // For Ethereum and variants, use EthereumAddressGenerator
    if cryptocurrency.starts_with("ETH") {
        return Box::new(EthereumAddressGenerator);
    }

    // For any other cryptocurrency, use Ethereum address format as fallback
    // In a production environment, you'd implement specific generators for each chain
    info!(
        "Using Ethereum address generator as fallback for {}",
        cryptocurrency
    );
    Box::new(EthereumAddressGenerator)
}

// Helper function to generate Ethereum address from public key
fn generate_ethereum_address(public_key: &k256::PublicKey) -> String {
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

// Apply EIP-55 checksum
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
    let mut hasher = Keccak256::new_with_prefix(address_lower.as_bytes());
    let hash = hasher.finalize();

    // Apply checksum rules
    let mut checksummed = String::with_capacity(42); // 0x + 40 hex chars
    checksummed.push_str("0x");

    for (i, ch) in address_lower.char_indices() {
        if ch.is_digit(16) {
            // If it's a hex digit
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

// Generate Bitcoin mainnet address (P2PKH)
fn generate_bitcoin_mainnet_address(public_key: &[u8]) -> Result<String, Box<dyn Error>> {
    // Apply SHA-256 to the public key
    let mut sha256_hasher = Sha256::new();
    sha256_hasher.update(public_key);
    let sha256_hash = sha256_hasher.finalize();

    // Apply RIPEMD-160 to the SHA-256 hash
    let mut ripemd160_hasher = Ripemd160::new();
    ripemd160_hasher.update(&sha256_hash);
    let ripemd160_hash = ripemd160_hasher.finalize();

    // Prepend version byte (0x00 for mainnet)
    let mut address_bytes = vec![0x00];
    address_bytes.extend_from_slice(&ripemd160_hash);

    // Apply double SHA-256 for checksum
    let mut checksum_hasher1 = Sha256::new();
    checksum_hasher1.update(&address_bytes);
    let checksum_hash1 = checksum_hasher1.finalize();

    let mut checksum_hasher2 = Sha256::new();
    checksum_hasher2.update(&checksum_hash1);
    let checksum_hash2 = checksum_hasher2.finalize();

    // Take first 4 bytes of the second SHA-256 hash as checksum
    address_bytes.extend_from_slice(&checksum_hash2[0..4]);

    // Encode with Base58
    let address = bs58::encode(address_bytes).into_string();

    Ok(address)
}

// Generate Bitcoin testnet address (P2PKH)
fn generate_bitcoin_testnet_address(public_key: &[u8]) -> Result<String, Box<dyn Error>> {
    // Apply SHA-256 to the public key
    let mut sha256_hasher = Sha256::new();
    sha256_hasher.update(public_key);
    let sha256_hash = sha256_hasher.finalize();

    // Apply RIPEMD-160 to the SHA-256 hash
    let mut ripemd160_hasher = Ripemd160::new();
    ripemd160_hasher.update(&sha256_hash);
    let ripemd160_hash = ripemd160_hasher.finalize();

    // Prepend version byte (0x6F for testnet)
    let mut address_bytes = vec![0x6F];
    address_bytes.extend_from_slice(&ripemd160_hash);

    // Apply double SHA-256 for checksum
    let mut checksum_hasher1 = Sha256::new();
    checksum_hasher1.update(&address_bytes);
    let checksum_hash1 = checksum_hasher1.finalize();

    let mut checksum_hasher2 = Sha256::new();
    checksum_hasher2.update(&checksum_hash1);
    let checksum_hash2 = checksum_hasher2.finalize();

    // Take first 4 bytes of the second SHA-256 hash as checksum
    address_bytes.extend_from_slice(&checksum_hash2[0..4]);

    // Encode with Base58
    let address = bs58::encode(address_bytes).into_string();

    Ok(address)
}
