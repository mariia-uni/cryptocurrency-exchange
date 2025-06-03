-- This file should undo anything in `up.sql`
-- Rollback is intentionally minimal since we want to keep the 0 balance approach
-- Just restore the trigger in case it was modified
CREATE OR REPLACE FUNCTION initialize_futures_balance() RETURNS TRIGGER AS $$ BEGIN NEW.available_balance := COALESCE(NEW.available_balance, 0);
NEW.margin_balance := COALESCE(NEW.margin_balance, 0);
NEW.unrealized_pnl := COALESCE(NEW.unrealized_pnl, 0);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;