-- Your SQL goes here
CREATE TABLE wallets (
    wallet_id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    wallet_type VARCHAR(15) NOT NULL CHECK (wallet_type IN ('CUSTODIAL', 'NON_CUSTODIAL')),
    address VARCHAR(42) NOT NULL UNIQUE,
    public_key VARCHAR(130) NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    encryption_iv VARCHAR(32) NOT NULL,
    encryption_auth_tag VARCHAR(32) NOT NULL,
    seed_phrase_encrypted TEXT,
    seed_phrase_iv VARCHAR(32),
    seed_phrase_auth_tag VARCHAR(32),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    network VARCHAR(50) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_address ON wallets(address);
CREATE INDEX idx_wallets_status ON wallets(status);
