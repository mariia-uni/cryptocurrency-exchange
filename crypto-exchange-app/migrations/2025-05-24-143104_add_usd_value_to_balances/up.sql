-- Your SQL goes here

ALTER TABLE wallet_balances
ADD COLUMN usd_value NUMERIC DEFAULT 0.0;

ALTER TABLE wallet_balances
ADD COLUMN last_price NUMERIC DEFAULT 0.0;
