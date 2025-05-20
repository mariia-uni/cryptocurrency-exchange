-- Modify existing wallets table to be chain-agnostic
ALTER TABLE wallets DROP COLUMN address,
    DROP COLUMN public_key,
    DROP COLUMN encrypted_private_key,
    DROP COLUMN encryption_iv,
    DROP COLUMN encryption_auth_tag,
    DROP COLUMN seed_phrase_encrypted,
    DROP COLUMN seed_phrase_iv,
    DROP COLUMN seed_phrase_auth_tag,
    DROP COLUMN network;
-- Add name column for user-friendly wallet identification
ALTER TABLE wallets
ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT 'My Wallet';
-- Create wallet_addresses table to store blockchain-specific addresses
CREATE TABLE wallet_addresses (
    id SERIAL PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(wallet_id),
    cryptocurrency VARCHAR(10) NOT NULL,
    -- 'ETH', 'BTC', etc.
    address VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (wallet_id, cryptocurrency)
);
-- Create wallet_balances table to track cryptocurrency balances
CREATE TABLE wallet_balances (
    id SERIAL PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(wallet_id),
    cryptocurrency VARCHAR(10) NOT NULL,
    -- 'ETH', 'BTC', etc.
    balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (wallet_id, cryptocurrency)
);