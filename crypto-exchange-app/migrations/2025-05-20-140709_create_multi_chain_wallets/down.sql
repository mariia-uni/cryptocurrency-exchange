-- This file should undo anything in `up.sql`

-- Drop new tables
DROP TABLE IF EXISTS wallet_balances;
DROP TABLE IF EXISTS wallet_addresses;

-- Revert changes to wallets table
ALTER TABLE wallets 
    DROP COLUMN name;

-- Re-add original columns (with default values to handle existing data)
ALTER TABLE wallets
    ADD COLUMN address VARCHAR(42) NOT NULL DEFAULT '',
    ADD COLUMN public_key VARCHAR(130) NOT NULL DEFAULT '',
    ADD COLUMN encrypted_private_key TEXT NOT NULL DEFAULT '',
    ADD COLUMN encryption_iv VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN encryption_auth_tag VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN seed_phrase_encrypted TEXT,
    ADD COLUMN seed_phrase_iv VARCHAR(32),
    ADD COLUMN seed_phrase_auth_tag VARCHAR(32),
    ADD COLUMN network VARCHAR(50) NOT NULL DEFAULT 'ETHEREUM';
