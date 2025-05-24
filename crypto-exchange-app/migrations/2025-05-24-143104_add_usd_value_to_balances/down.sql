-- This file should undo anything in `up.sql`

ALTER TABLE wallet_balances
DROP COLUMN usd_value;

ALTER TABLE wallet_balances
DROP COLUMN last_price;
