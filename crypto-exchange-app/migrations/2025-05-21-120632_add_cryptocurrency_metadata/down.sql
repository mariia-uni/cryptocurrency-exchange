-- This file should undo anything in `up.sql`
DROP TABLE cryptocurrencies;
ALTER TABLE wallet_addresses
ALTER COLUMN cryptocurrency TYPE VARCHAR(10);
ALTER TABLE wallet_balances
ALTER COLUMN cryptocurrency TYPE VARCHAR(10);