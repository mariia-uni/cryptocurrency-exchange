-- Create the futures_positions table
CREATE TABLE IF NOT EXISTS futures_positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
    size NUMERIC(20, 8) NOT NULL CHECK (size > 0),
    entry_price NUMERIC(20, 8) NOT NULL CHECK (entry_price > 0),
    current_price NUMERIC(20, 8) NOT NULL CHECK (current_price > 0),
    leverage INTEGER NOT NULL CHECK (
        leverage >= 1
        AND leverage <= 100
    ),
    margin NUMERIC(20, 8) NOT NULL CHECK (margin > 0),
    liquidation_price NUMERIC(20, 8) NOT NULL CHECK (liquidation_price > 0),
    unrealized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
-- Create the futures_pnl_history table
CREATE TABLE IF NOT EXISTS futures_pnl_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    position_id INTEGER NOT NULL REFERENCES futures_positions(id),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
    size NUMERIC(20, 8) NOT NULL CHECK (size > 0),
    entry_price NUMERIC(20, 8) NOT NULL CHECK (entry_price > 0),
    exit_price NUMERIC(20, 8) NOT NULL CHECK (exit_price > 0),
    leverage INTEGER NOT NULL CHECK (
        leverage >= 1
        AND leverage <= 100
    ),
    margin NUMERIC(20, 8) NOT NULL CHECK (margin > 0),
    realized_pnl NUMERIC(20, 8) NOT NULL,
    commission NUMERIC(20, 8) NOT NULL DEFAULT 0,
    funding_fee NUMERIC(20, 8) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Create the futures_balances table
CREATE TABLE IF NOT EXISTS futures_balances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    currency VARCHAR(10) NOT NULL,
    available_balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
    margin_balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
    unrealized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, currency)
);
-- Create the funding_rates table
CREATE TABLE IF NOT EXISTS funding_rates (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    rate NUMERIC(10, 6) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_funding_time TIMESTAMPTZ NOT NULL
);
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_futures_positions_user_id ON futures_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_futures_positions_symbol ON futures_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_futures_positions_status ON futures_positions(status);
CREATE INDEX IF NOT EXISTS idx_futures_positions_created_at ON futures_positions(created_at);
CREATE INDEX IF NOT EXISTS idx_futures_pnl_history_user_id ON futures_pnl_history(user_id);
CREATE INDEX IF NOT EXISTS idx_futures_pnl_history_position_id ON futures_pnl_history(position_id);
CREATE INDEX IF NOT EXISTS idx_futures_pnl_history_created_at ON futures_pnl_history(created_at);
CREATE INDEX IF NOT EXISTS idx_futures_balances_user_id ON futures_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_futures_balances_currency ON futures_balances(currency);
CREATE INDEX IF NOT EXISTS idx_funding_rates_symbol ON funding_rates(symbol);
CREATE INDEX IF NOT EXISTS idx_funding_rates_timestamp ON funding_rates(timestamp);
-- Create triggers to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_futures_positions_updated_at BEFORE
UPDATE ON futures_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();