-- Your SQL goes here
CREATE TABLE cryptocurrencies (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    cmc_id INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    icon_url TEXT,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (symbol)
);
-- Increase the cryptocurrency field length in existing tables
ALTER TABLE wallet_addresses
ALTER COLUMN cryptocurrency TYPE VARCHAR(20);
ALTER TABLE wallet_balances
ALTER COLUMN cryptocurrency TYPE VARCHAR(20);
-- Insert default cryptocurrencies
INSERT INTO cryptocurrencies (symbol, name, cmc_id, is_active)
VALUES ('BTC', 'Bitcoin', 1, true),
    ('ETH', 'Ethereum', 1027, true),
    ('BTC_TESTNET', 'Bitcoin Testnet', 1, true),
    ('ETH_TESTNET', 'Ethereum Testnet', 1027, true);