-- Reset all existing futures balances to 0 USDT
UPDATE futures_balances
SET available_balance = 0,
    margin_balance = 0,
    unrealized_pnl = 0,
    last_updated = NOW()
WHERE currency = 'USDT';
-- Ensure any positions are properly closed or liquidated
-- This prevents orphaned positions with balances
UPDATE futures_positions
SET status = 'closed'
WHERE status = 'open'
    AND user_id IN (
        SELECT user_id
        FROM futures_balances
        WHERE currency = 'USDT'
    );