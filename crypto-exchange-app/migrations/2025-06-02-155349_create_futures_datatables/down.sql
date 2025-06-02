-- This file should undo anything in `up.sql`
-- Drop the trigger first
DROP TRIGGER IF EXISTS update_futures_positions_updated_at ON futures_positions;
-- Drop the function
DROP FUNCTION IF EXISTS update_updated_at_column();
-- Drop indexes (in reverse order of creation)
DROP INDEX IF EXISTS idx_funding_rates_timestamp;
DROP INDEX IF EXISTS idx_funding_rates_symbol;
DROP INDEX IF EXISTS idx_futures_balances_currency;
DROP INDEX IF EXISTS idx_futures_balances_user_id;
DROP INDEX IF EXISTS idx_futures_pnl_history_created_at;
DROP INDEX IF EXISTS idx_futures_pnl_history_position_id;
DROP INDEX IF EXISTS idx_futures_pnl_history_user_id;
DROP INDEX IF EXISTS idx_futures_positions_created_at;
DROP INDEX IF EXISTS idx_futures_positions_status;
DROP INDEX IF EXISTS idx_futures_positions_symbol;
DROP INDEX IF EXISTS idx_futures_positions_user_id;
-- Drop tables (in reverse order of dependencies)
-- Drop tables that reference other futures tables first
DROP TABLE IF EXISTS funding_rates;
DROP TABLE IF EXISTS futures_balances;
DROP TABLE IF EXISTS futures_pnl_history;
-- Drop the main futures_positions table last (since futures_pnl_history references it)
DROP TABLE IF EXISTS futures_positions;