-- Your SQL goes here
CREATE TABLE withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    wallet_id BIGINT NOT NULL REFERENCES wallets(wallet_id),
    transaction_id TEXT NOT NULL,
    cryptocurrency TEXT NOT NULL,
    amount NUMERIC(28, 8) NOT NULL,
    fee NUMERIC(28, 8) NOT NULL,
    address TEXT NOT NULL,
    blockchain TEXT NOT NULL,
    withdrawal_type TEXT NOT NULL DEFAULT 'on-chain',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    completed_at TIMESTAMP
);
CREATE INDEX withdrawals_user_id_idx ON withdrawals(user_id);
CREATE INDEX withdrawals_wallet_id_idx ON withdrawals(wallet_id);
CREATE INDEX withdrawals_status_idx ON withdrawals(status);