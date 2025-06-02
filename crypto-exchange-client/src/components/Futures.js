import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Futures.css';
import SearchBox from './SearchBox/SearchBox';
import TradingViewChart from './TradingViewChart';

function Futures() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Transfer modal states
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [wallets, setWallets] = useState([]);
    const [fromWallet, setFromWallet] = useState('');
    const [toWallet, setToWallet] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [transferError, setTransferError] = useState('');

    // Trading states
    const [btcPrice, setBtcPrice] = useState(0);
    const [priceLoading, setPriceLoading] = useState(true);
    const [orderSide, setOrderSide] = useState('long'); // 'long' or 'short'
    const [orderSize, setOrderSize] = useState('');
    const [leverage, setLeverage] = useState(1); // Changed default to 1x
    const [margin, setMargin] = useState('');
    const [tradingError, setTradingError] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);

    // Positions and P&L states
    const [positions, setPositions] = useState([]);
    const [pnlHistory, setPnlHistory] = useState([]);
    const [activeTab, setActiveTab] = useState('trading'); // 'trading', 'positions', 'pnl'

    // Enhanced function to get proper display name from user data
    const getDisplayName = (user) => {
        if (!user) return "Guest";
        if (user.verification && user.verification.first_name && user.verification.last_name) {
            return `${user.verification.first_name} ${user.verification.last_name}`;
        }
        if (user.first_name && user.last_name) {
            return `${user.first_name} ${user.last_name}`;
        }
        if (user.display_name) {
            return user.display_name;
        }
        if (user.username) {
            return user.username;
        }
        if (user.email) {
            return user.email.split('@')[0];
        }
        return `User ${user.id ? '#' + user.id : ''}`;
    };

    // Navigate to admin panel if user is admin
    const navigateToAdminPanel = () => {
        navigate('/admin');
    };

    // Enhanced fetchBtcPrice to work with TradingView
    const fetchBtcPrice = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/api/markets');
            if (response.ok) {
                const data = await response.json();
                const btcData = data.cryptocurrencies.find(crypto => crypto.symbol === 'BTC');
                if (btcData) {
                    setBtcPrice(btcData.price);
                }
            }
        } catch (error) {
            console.error('Error fetching BTC price:', error);
        } finally {
            setPriceLoading(false);
        }
    }, []);

    // Handle price updates from TradingView chart
    const handlePriceUpdate = useCallback((price) => {
        setBtcPrice(price);
        setPriceLoading(false);
    }, []);

    // Fetch wallets for transfer functionality
    const fetchWallets = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch('http://localhost:8080/wallet/list', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const walletsData = await response.json();
                if (walletsData.wallets && Array.isArray(walletsData.wallets)) {
                    setWallets(walletsData.wallets);
                }
            }
        } catch (error) {
            console.error('Error fetching wallets:', error);
        }
    };

    // Get available USDT balance for trading
    const getAvailableUsdtBalance = () => {
        const totalUsdt = wallets.reduce((total, wallet) => {
            const usdtBalance = wallet.balances.find(b => b.cryptocurrency === 'USDT');
            return total + (usdtBalance ? parseFloat(usdtBalance.balance) : 0);
        }, 0);
        return totalUsdt;
    };

    // Get available USDT balance for selected wallet (for transfers)
    const getAvailableBalance = (walletId) => {
        const wallet = wallets.find(w => w.wallet_id.toString() === walletId);
        if (!wallet) return 0;

        const balance = wallet.balances.find(b => b.cryptocurrency === 'USDT');
        return balance ? parseFloat(balance.balance) : 0;
    };

    // Calculate margin requirement
    const calculateMargin = useCallback(() => {
        if (!orderSize || !btcPrice || !leverage) return 0;
        const size = parseFloat(orderSize);
        const notional = size * btcPrice;
        return notional / leverage;
    }, [orderSize, btcPrice, leverage]);

    // Calculate liquidation price with improved safety for 1x leverage
    const calculateLiquidationPrice = () => {
        if (!orderSize || !btcPrice || !leverage) return 0;

        // For 1x leverage, liquidation is much more conservative
        if (leverage === 1) {
            if (orderSide === 'long') {
                return btcPrice * 0.05; // 95% loss for 1x long
            } else {
                return btcPrice * 20; // 1900% increase for 1x short (very high threshold)
            }
        }

        // For higher leverages, use existing calculation
        const marginRatio = 1 / leverage;
        if (orderSide === 'long') {
            return btcPrice * (1 - marginRatio * 0.9); // 90% of margin ratio for safety
        } else {
            return btcPrice * (1 + marginRatio * 0.9);
        }
    };

    // Enhanced place futures order with 1x leverage support
    const handlePlaceOrder = async () => {
        setTradingError('');
        setIsPlacingOrder(true);

        try {
            const token = localStorage.getItem('auth_token');
            const payload = {
                symbol: "BTCUSDT",
                side: orderSide,
                size: orderSize,
                leverage: leverage
            };

            const response = await fetch('http://localhost:8080/futures/positions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // Parse the JSON response ONCE
                const result = await response.json();
                console.log("Position created:", result);

                // Clear form and show success
                setOrderSize('');
                setActiveTab('positions');
                fetchPositions();
            } else {
                const errorData = await response.json();
                setTradingError(errorData.error || 'Failed to create position');
            }
        } catch (error) {
            console.error('Error creating position:', error);
            setTradingError('Network error when placing order');
        } finally {
            setIsPlacingOrder(false);
        }
    };

    // Enhanced P&L calculation for different leverage levels
    const updatePositionsPnl = useCallback(() => {
        setPositions(prev => prev.map(position => {
            const priceDiff = btcPrice - position.entryPrice;

            // Calculate unrealized P&L based on leverage
            let unrealizedPnl;
            if (position.side === 'long') {
                unrealizedPnl = priceDiff * position.size;
            } else {
                unrealizedPnl = -priceDiff * position.size;
            }

            // Check for liquidation
            let isLiquidated = false;
            if (position.side === 'long' && btcPrice <= position.liquidationPrice) {
                isLiquidated = true;
                unrealizedPnl = -position.margin; // Total loss of margin
            } else if (position.side === 'short' && btcPrice >= position.liquidationPrice) {
                isLiquidated = true;
                unrealizedPnl = -position.margin; // Total loss of margin
            }

            return {
                ...position,
                markPrice: btcPrice,
                unrealizedPnl,
                isLiquidated
            };
        }));
    }, [btcPrice]);

    // Handle transfer submission - USDT only
    const handleTransfer = async () => {
        setTransferError('');
        setIsTransferring(true);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/wallet/balance/update', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet_id: parseInt(fromWallet),
                    cryptocurrency: 'USDT',
                    amount: transferAmount,
                    operation: 'SUBTRACT'
                }),
            });

            if (response.ok) {
                const addResponse = await fetch('http://localhost:8080/wallet/balance/update', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        wallet_id: parseInt(toWallet),
                        cryptocurrency: 'USDT',
                        amount: transferAmount,
                        operation: 'ADD'
                    }),
                });

                if (addResponse.ok) {
                    // Refresh wallets and close modal
                    await fetchWallets();
                    setShowTransferModal(false);
                    setShowConfirmation(false);
                    setTransferAmount('');
                    setFromWallet('');
                    setToWallet('');
                    alert('USDT transfer completed successfully!');
                } else {
                    const errorData = await addResponse.json();
                    setTransferError(errorData.error || 'Failed to complete USDT transfer');
                }
            } else {
                const errorData = await response.json();
                setTransferError(errorData.error || 'Failed to process USDT transfer');
            }
        } catch (error) {
            console.error('Transfer error:', error);
            setTransferError('Network error. Please try again.');
        } finally {
            setIsTransferring(false);
        }
    };

    // Validate transfer form - USDT only
    const validateTransfer = () => {
        if (!fromWallet || !toWallet || !transferAmount) {
            setTransferError('Please fill in all fields');
            return false;
        }

        if (fromWallet === toWallet) {
            setTransferError('Cannot transfer to the same wallet');
            return false;
        }

        const amount = parseFloat(transferAmount);
        if (isNaN(amount) || amount <= 0) {
            setTransferError('Please enter a valid amount');
            return false;
        }

        const availableBalance = getAvailableBalance(fromWallet);
        if (amount > availableBalance) {
            setTransferError(`Insufficient USDT balance. Available: ${availableBalance} USDT`);
            return false;
        }

        return true;
    };

    // Close position function
    const closePosition = async (positionId, size = null) => {
        try {
            setApiError('');
            const token = localStorage.getItem('auth_token');

            const payload = {
                position_id: positionId // Add explicit position_id field
            };
            if (size) {
                payload.size = size.toString();
            }

            const response = await fetch(`http://localhost:8080/futures/positions/${positionId}/close`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            // Check status first before trying to parse response
            if (response.ok) {
                // For successful responses, just consider it successful without requiring parsing
                fetchPositions();
                alert('Position closed successfully');
                return;
            }

            // Only try to parse error responses
            let errorMessage = 'Failed to close position';
            try {
                // Simple approach - don't try to parse the success response
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (jsonError) {
                console.error("Failed to parse error response:", jsonError);
                // Use default error message
            }

            setApiError(errorMessage);
        } catch (error) {
            console.error('Error closing position:', error);
            setApiError('Network error when closing position');
        }
    };

    // Fetch positions from the server
    const fetchPositions = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/futures/positions', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log("Raw positions data:", data); // Add this to debug the actual response structure

                // Parse string values to numbers with field name mapping
                const parsedPositions = (data.positions || []).map(position => ({
                    ...position,
                    // Map snake_case backend field names to camelCase frontend names
                    size: parseFloat(position.size),
                    entryPrice: parseFloat(position.entry_price || position.entryPrice || 0),
                    markPrice: parseFloat(position.current_price || position.markPrice || 0),
                    liquidationPrice: parseFloat(position.liquidation_price || position.liquidationPrice || 0),
                    margin: parseFloat(position.margin || 0),
                    unrealizedPnl: parseFloat(position.unrealized_pnl || position.unrealizedPnl || 0),
                    // Add other fields as needed
                }));

                setPositions(parsedPositions);
            } else {
                console.error('Failed to fetch positions');
            }
        } catch (error) {
            console.error('Error fetching positions:', error);
        }
    };

    // Fetch P&L history from the server
    const fetchPnlHistory = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/futures/pnl-history', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPnlHistory(data.pnl_history || []);
            } else {
                console.error('Failed to fetch PnL history');
            }
        } catch (error) {
            console.error('Error fetching PnL history:', error);
        }
    };

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('auth_token');
                if (!token) {
                    navigate('/login');
                    return;
                }

                // Try fetching user data from API
                try {
                    const userResponse = await fetch('http://localhost:8080/user/profile', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (userResponse.ok) {
                        const userDataResponse = await userResponse.json();
                        const apiUserData = userDataResponse.user || userDataResponse;
                        setUserData(apiUserData);

                        if (apiUserData && apiUserData.is_admin) {
                            setIsAdmin(true);
                        }

                        // Fetch wallets after user data is loaded
                        await fetchWallets();
                    } else if (userResponse.status === 401) {
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                        return;
                    }
                } catch (userApiError) {
                    console.warn("API error when fetching user data:", userApiError);
                }

            } catch (error) {
                console.error('Error in futures data fetching:', error);
                setApiError('Could not load user data. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
        fetchBtcPrice();
        fetchPositions(); // Add this
        fetchPnlHistory(); // Add this

        // Set up interval refreshes
        const priceInterval = setInterval(fetchBtcPrice, 30000);
        const positionsInterval = setInterval(fetchPositions, 60000);

        return () => {
            clearInterval(priceInterval);
            clearInterval(positionsInterval);
        };
    }, [navigate, fetchBtcPrice]);

    // Update positions P&L when price changes
    useEffect(() => {
        if (btcPrice > 0) {
            updatePositionsPnl();
        }
    }, [btcPrice, updatePositionsPnl]);

    // Update margin when order size or leverage changes
    useEffect(() => {
        const calculatedMargin = calculateMargin();
        setMargin(calculatedMargin.toFixed(2));
    }, [orderSize, leverage, btcPrice, calculateMargin]);

    if (isLoading) {
        return <div className="loading-container">Loading futures trading...</div>;
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="logo">CryptoX</div>
                <div className="header-actions">
                    <SearchBox />
                    <button className="deposit-button">Deposit</button>

                    {isAdmin && (
                        <button
                            className="admin-button"
                            onClick={navigateToAdminPanel}
                        >
                            Admin
                        </button>
                    )}

                    <div className="user-profile">
                        <span className="username">
                            {userData?.display_name || getDisplayName(userData) || userData?.email?.split('@')[0]}
                        </span>
                        <div className="profile-icon">
                            {(userData?.first_name?.[0] || userData?.email?.[0] || "U").toUpperCase()}
                        </div>
                    </div>

                    <button
                        className="logout-button"
                        onClick={() => {
                            localStorage.removeItem('auth_token');
                            navigate('/login');
                        }}
                    >
                        <span className="logout-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                        </span>
                        <span className="logout-text">Logout</span>
                    </button>
                </div>
            </header>

            <div className="dashboard-content">
                <nav className="side-navigation">
                    <ul>
                        <li className="nav-item" onClick={() => navigate('/')}>
                            <span className="nav-icon">📊</span>
                            <span className="nav-text">Dashboard</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/markets')}>
                            <span className="nav-icon">💱</span>
                            <span className="nav-text">Markets</span>
                        </li>
                        <li className="nav-item active" onClick={() => navigate('/futures')}>
                            <span className="nav-icon">📈</span>
                            <span className="nav-text">Futures</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/assets-overview')}>
                            <span className="nav-icon">💎</span>
                            <span className="nav-text">Assets</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/deposit')}>
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Deposit</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/withdrawal')}>
                            <span className="nav-icon">💸</span>
                            <span className="nav-text">Withdrawal</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/settings')}>
                            <span className="nav-icon">👤</span>
                            <span className="nav-text">Account Settings</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">⚙️</span>
                            <span className="nav-text">System Settings</span>
                        </li>
                    </ul>
                </nav>

                <main className="main-content">
                    <div className="futures-container">
                        {/* Remove the futures-header section completely */}

                        {/* Trading Tabs */}
                        <div className="trading-tabs">
                            <button
                                className={`tab ${activeTab === 'trading' ? 'active' : ''}`}
                                onClick={() => setActiveTab('trading')}
                            >
                                Trading
                            </button>
                            <button
                                className={`tab ${activeTab === 'positions' ? 'active' : ''}`}
                                onClick={() => setActiveTab('positions')}
                            >
                                Positions ({positions.length})
                            </button>
                            <button
                                className={`tab ${activeTab === 'pnl' ? 'active' : ''}`}
                                onClick={() => setActiveTab('pnl')}
                            >
                                P&L History
                            </button>
                        </div>

                        {/* Trading Panel */}
                        {activeTab === 'trading' && (
                            <div className="trading-layout">
                                {/* Enhanced Chart/Market Data Section - Left Side */}
                                <div className="market-data-section">
                                    {/* TradingView Chart Integration - Enlarged */}
                                    <div className="chart-container expanded-large">
                                        {priceLoading ? (
                                            <div className="loading-indicator">Loading price data...</div>
                                        ) : (
                                            <TradingViewChart
                                                symbol="BTCUSDT"
                                                onPriceUpdate={handlePriceUpdate}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Trading Panel - Right Side */}
                                <div className="trading-panel-right">
                                    <div className="order-form">
                                        <div className="order-side-selector">
                                            <button
                                                className={`side-btn long ${orderSide === 'long' ? 'active' : ''}`}
                                                onClick={() => setOrderSide('long')}
                                            >
                                                Long
                                            </button>
                                            <button
                                                className={`side-btn short ${orderSide === 'short' ? 'active' : ''}`}
                                                onClick={() => setOrderSide('short')}
                                            >
                                                Short
                                            </button>
                                        </div>

                                        <div className="form-group">
                                            <label>Order Size (BTC)</label>
                                            <div className="input-group">
                                                <input
                                                    type="number"
                                                    value={orderSize}
                                                    onChange={(e) => setOrderSize(e.target.value)}
                                                    placeholder="0.001"
                                                    step="0.001"
                                                    min="0.001"
                                                />
                                                <span className="input-suffix">BTC</span>
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Leverage</label>
                                            <div className="leverage-selector">
                                                {[1, 5, 10, 20, 50, 100].map(lev => (
                                                    <button
                                                        key={lev}
                                                        className={`leverage-btn ${leverage === lev ? 'active' : ''} ${lev === 1 ? 'leverage-1x' : ''}`}
                                                        onClick={() => setLeverage(lev)}
                                                        title={lev === 1 ? 'No Leverage - Safest Option' : `${lev}x Leverage`}
                                                    >
                                                        {lev}x
                                                    </button>
                                                ))}
                                            </div>
                                            {leverage === 1 && (
                                                <div className="leverage-warning">
                                                    <span className="safe-icon">🛡️</span>
                                                    <span>1x leverage - No amplification, lowest risk</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="form-group">
                                            <label>Margin Required (USDT)</label>
                                            <div className="input-group">
                                                <input
                                                    type="text"
                                                    value={margin}
                                                    readOnly
                                                    placeholder="0.00"
                                                />
                                                <span className="input-suffix">USDT</span>
                                            </div>
                                        </div>

                                        <div className="order-summary">
                                            <div className="summary-item">
                                                <span>Available Balance:</span>
                                                <span>{getAvailableUsdtBalance().toFixed(2)} USDT</span>
                                            </div>
                                            <div className="summary-item">
                                                <span>Leverage:</span>
                                                <span className={leverage === 1 ? 'leverage-safe' : ''}>{leverage}x</span>
                                            </div>
                                            <div className="summary-item">
                                                <span>Est. Liq. Price:</span>
                                                <span>${calculateLiquidationPrice().toFixed(2)}</span>
                                            </div>
                                            {leverage === 1 && (
                                                <div className="summary-item">
                                                    <span>Risk Level:</span>
                                                    <span className="risk-low">Very Low</span>
                                                </div>
                                            )}
                                        </div>

                                        {tradingError && (
                                            <div className="error-message">
                                                {tradingError}
                                            </div>
                                        )}

                                        <button
                                            className={`place-order-btn ${orderSide} ${leverage === 1 ? 'safe-trade' : ''}`}
                                            onClick={handlePlaceOrder}
                                            disabled={isPlacingOrder || !orderSize || !btcPrice}
                                        >
                                            {isPlacingOrder ? 'Placing Order...' : `${orderSide === 'long' ? 'Buy/Long' : 'Sell/Short'} BTC/USDT (${leverage}x)`}
                                        </button>

                                        {/* Relocated Transfer Button - Under Create Market Contract Panel */}
                                        <div className="create-market-contract-panel">
                                            <h4>Create Market Contract</h4>
                                            <p>Execute trades with advanced order types and risk management</p>

                                            {/* Transfer Button relocated here */}
                                            <button
                                                className="transfer-button relocated"
                                                onClick={() => setShowTransferModal(true)}
                                            >
                                                <span className="transfer-icon">💲</span>
                                                Transfer USDT
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Enhanced Positions Panel with leverage display */}
                        {activeTab === 'positions' && (
                            <div className="positions-panel">
                                <div className="positions-header">
                                    <h3>Open Positions</h3>
                                </div>
                                <div className="positions-table">
                                    <div className="table-header">
                                        <div className="col">Symbol</div>
                                        <div className="col">Size</div>
                                        <div className="col">Leverage</div>
                                        <div className="col">Entry Price</div>
                                        <div className="col">Mark Price</div>
                                        <div className="col">Liq. Price</div>
                                        <div className="col">Margin</div>
                                        <div className="col">Unrealized P&L</div>
                                        <div className="col">Actions</div>
                                    </div>
                                    {positions.length === 0 ? (
                                        <div className="no-positions">
                                            <p>No open positions</p>
                                        </div>
                                    ) : (
                                        positions.map(position => (
                                            <div key={position.id} className={`table-row ${position.isLiquidated ? 'liquidated' : ''}`}>
                                                <div className="col">
                                                    <span className={`side-indicator ${position.side}`}>
                                                        {position.side.toUpperCase()}
                                                    </span>
                                                    {position.symbol}
                                                </div>
                                                <div className="col">{position.size.toFixed(3)} BTC</div>
                                                <div className="col">
                                                    <span className={`leverage-display ${position.leverage === 1 ? 'leverage-safe' : ''}`}>
                                                        {position.leverage}x
                                                    </span>
                                                </div>
                                                <div className="col">
                                                    ${isNaN(position.entryPrice) ? '0.00' : position.entryPrice.toFixed(2)}
                                                </div>
                                                <div className="col">
                                                    ${isNaN(position.markPrice) ? '0.00' : position.markPrice.toFixed(2)}
                                                </div>
                                                <div className="col">
                                                    ${isNaN(position.liquidationPrice) ? '0.00' : position.liquidationPrice.toFixed(2)}
                                                </div>
                                                <div className="col">{position.margin.toFixed(2)} USDT</div>
                                                <div className="col">
                                                    <span className={`pnl ${position.unrealizedPnl >= 0 ? 'positive' : 'negative'}`}>
                                                        {position.unrealizedPnl >= 0 ? '+' : ''}{position.unrealizedPnl.toFixed(2)} USDT
                                                    </span>
                                                    {position.isLiquidated && (
                                                        <span className="liquidated-tag">LIQUIDATED</span>
                                                    )}
                                                </div>
                                                <div className="col">
                                                    <button
                                                        className="close-btn"
                                                        disabled={position.isLiquidated}
                                                        onClick={() => closePosition(position.id, position.size)}
                                                    >
                                                        {position.isLiquidated ? 'Liquidated' : 'Close'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* P&L Panel */}
                        {activeTab === 'pnl' && (
                            <div className="pnl-panel">
                                <div className="pnl-header">
                                    <h3>Profit & Loss History</h3>
                                </div>
                                <div className="pnl-table">
                                    <div className="table-header">
                                        <div className="col">Date</div>
                                        <div className="col">Symbol</div>
                                        <div className="col">Side</div>
                                        <div className="col">Size</div>
                                        <div className="col">Realized P&L</div>
                                        <div className="col">Fees</div>
                                    </div>
                                    {pnlHistory.length === 0 ? (
                                        <div className="no-pnl">
                                            <p>No P&L history available</p>
                                        </div>
                                    ) : (
                                        pnlHistory.map((record, index) => (
                                            <div key={index} className="table-row">
                                                <div className="col">{new Date(record.date).toLocaleDateString()}</div>
                                                <div className="col">{record.symbol}</div>
                                                <div className="col">
                                                    <span className={`side-indicator ${record.side}`}>
                                                        {record.side.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="col">{record.size.toFixed(3)} BTC</div>
                                                <div className="col">
                                                    <span className={`pnl ${record.realizedPnl >= 0 ? 'positive' : 'negative'}`}>
                                                        {record.realizedPnl >= 0 ? '+' : ''}{record.realizedPnl.toFixed(2)} USDT
                                                    </span>
                                                </div>
                                                <div className="col">{record.fees.toFixed(2)} USDT</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {apiError && (
                        <div className="error-alert">
                            {apiError}
                        </div>
                    )}
                </main>
            </div>

            {/* Transfer Modal */}
            {showTransferModal && (
                <div className="modal-overlay">
                    <div className="transfer-modal">
                        <div className="modal-header">
                            <h3>Transfer USDT Between Wallets</h3>
                            <button
                                className="close-button"
                                onClick={() => {
                                    setShowTransferModal(false);
                                    setShowConfirmation(false);
                                    setTransferError('');
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {!showConfirmation ? (
                            <div className="modal-content">
                                <div className="usdt-info">
                                    <div className="usdt-notice">
                                        <span className="usdt-icon">💲</span>
                                        <span>USDT Fee-Free Transfers Only</span>
                                    </div>
                                    <p>Transfer USDT between your wallets with zero fees</p>
                                </div>

                                <div className="form-group">
                                    <label>From Wallet</label>
                                    <select
                                        value={fromWallet}
                                        onChange={(e) => setFromWallet(e.target.value)}
                                        className="wallet-select"
                                    >
                                        <option value="">Select source wallet</option>
                                        {wallets.filter(wallet => {
                                            const usdtBalance = wallet.balances.find(b => b.cryptocurrency === 'USDT');
                                            return usdtBalance && parseFloat(usdtBalance.balance) > 0;
                                        }).map(wallet => (
                                            <option key={wallet.wallet_id} value={wallet.wallet_id}>
                                                {wallet.name} - {getAvailableBalance(wallet.wallet_id.toString())} USDT
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>To Wallet</label>
                                    <select
                                        value={toWallet}
                                        onChange={(e) => setToWallet(e.target.value)}
                                        className="wallet-select"
                                    >
                                        <option value="">Select destination wallet</option>
                                        {wallets.filter(w => w.wallet_id.toString() !== fromWallet).map(wallet => (
                                            <option key={wallet.wallet_id} value={wallet.wallet_id}>
                                                {wallet.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Amount (USDT)</label>
                                    <div className="amount-input-group">
                                        <input
                                            type="number"
                                            value={transferAmount}
                                            onChange={(e) => setTransferAmount(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            className="amount-input"
                                        />
                                        <span className="currency-label">USDT</span>
                                        {fromWallet && (
                                            <button
                                                className="max-button"
                                                onClick={() => setTransferAmount(getAvailableBalance(fromWallet).toString())}
                                            >
                                                MAX
                                            </button>
                                        )}
                                    </div>
                                    {fromWallet && (
                                        <div className="available-balance">
                                            Available: {getAvailableBalance(fromWallet)} USDT
                                        </div>
                                    )}
                                </div>

                                <div className="fee-info">
                                    <div className="fee-item">
                                        <span>Transfer Fee:</span>
                                        <span className="fee-free">FREE</span>
                                    </div>
                                    <div className="fee-item">
                                        <span>Network:</span>
                                        <span>Internal Transfer</span>
                                    </div>
                                </div>

                                {transferError && (
                                    <div className="error-message">
                                        {transferError}
                                    </div>
                                )}

                                <div className="modal-actions">
                                    <button
                                        className="cancel-button"
                                        onClick={() => {
                                            setShowTransferModal(false);
                                            setTransferError('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="continue-button"
                                        onClick={() => {
                                            if (validateTransfer()) {
                                                setShowConfirmation(true);
                                            }
                                        }}
                                    >
                                        Continue
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="confirmation-content">
                                <div className="confirmation-details">
                                    <h4>Confirm USDT Transfer</h4>
                                    <div className="transfer-summary">
                                        <div className="summary-item">
                                            <span>From:</span>
                                            <span>{wallets.find(w => w.wallet_id.toString() === fromWallet)?.name}</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>To:</span>
                                            <span>{wallets.find(w => w.wallet_id.toString() === toWallet)?.name}</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>Amount:</span>
                                            <span>{transferAmount} USDT</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>Fee:</span>
                                            <span className="fee-free">FREE</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>You'll Receive:</span>
                                            <span className="receive-amount">{transferAmount} USDT</span>
                                        </div>
                                    </div>
                                </div>

                                {transferError && (
                                    <div className="error-message">
                                        {transferError}
                                    </div>
                                )}

                                <div className="modal-actions">
                                    <button
                                        className="back-button"
                                        onClick={() => setShowConfirmation(false)}
                                        disabled={isTransferring}
                                    >
                                        Back
                                    </button>
                                    <button
                                        className="confirm-button"
                                        onClick={handleTransfer}
                                        disabled={isTransferring}
                                    >
                                        {isTransferring ? 'Processing...' : 'Confirm USDT Transfer'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <footer className="dashboard-footer">
                <div className="footer-links">
                    <Link to="/about">About Us</Link>
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                    <Link to="/support">Contact Support</Link>
                </div>
                <div className="copyright">
                    © 2025 CryptoX Exchange. All rights reserved.
                </div>
            </footer>
        </div>
    );
}

export default Futures;