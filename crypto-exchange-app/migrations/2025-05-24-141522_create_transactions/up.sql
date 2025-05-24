-- Your SQL goes here
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    wallet_id BIGINT NOT NULL REFERENCES wallets(wallet_id),
    amount NUMERIC NOT NULL,
    cryptocurrency VARCHAR(20) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    transaction_hash VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    blockchain VARCHAR(50),
    address VARCHAR(100),
    fee NUMERIC,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_transaction_type CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer'))
);

CREATE INDEX transactions_user_id_idx ON transactions(user_id);
CREATE INDEX transactions_wallet_id_idx ON transactions(wallet_id);
CREATE INDEX transactions_created_at_idx ON transactions(created_at);
