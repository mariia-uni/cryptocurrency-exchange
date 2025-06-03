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

    // Futures-specific balances
    const [futuresAvailableBalance, setFuturesAvailableBalance] = useState('0');
    const [futuresMarginBalance, setFuturesMarginBalance] = useState('0');

    // Refresh state for positions
    const [isRefreshingPositions, setIsRefreshingPositions] = useState(false);

    // Enhanced transfer functionality states
    const [selectedMainWallet, setSelectedMainWallet] = useState('');
    const [transferToFuturesAmount, setTransferToFuturesAmount] = useState('');
    const [showFuturesTransferConfirmation, setShowFuturesTransferConfirmation] = useState(false);
    const [isFuturesTransfer, setIsFuturesTransfer] = useState(false);

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

    // Add a new function specifically for Futures Account balance
    const getFuturesAccountBalance = () => {
        return parseFloat(futuresAvailableBalance) || 0;
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

        // Enhanced validation for futures balance
        const availableFuturesBalance = parseFloat(futuresAvailableBalance);
        const requiredMargin = calculateMargin();

        if (availableFuturesBalance === 0) {
            setTradingError('No funds available for trading. Please transfer USDT to your futures account first.');
            return;
        }

        if (requiredMargin > availableFuturesBalance) {
            setTradingError(`Insufficient futures balance. Required: ${requiredMargin.toFixed(2)} USDT, Available: ${availableFuturesBalance.toFixed(2)} USDT`);
            return;
        }

        if (!orderSize || parseFloat(orderSize) <= 0) {
            setTradingError('Please enter a valid order size');
            return;
        }

        if (!btcPrice || btcPrice <= 0) {
            setTradingError('Unable to get current market price');
            return;
        }

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
                const result = await response.json();
                console.log("Position created:", result);

                // Clear form and show success
                setOrderSize('');
                setActiveTab('positions');
                await fetchPositions();
                await fetchFuturesBalances(); // Refresh balances after position creation
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

    // Replace the updatePositionsPnl function:

    const updatePositionsPnl = useCallback(() => {
        setPositions(prev => prev.map(position => {
            const entryPrice = parseFloat(position.entryPrice || 0);
            const size = parseFloat(position.size || 0);
            const liquidationPrice = parseFloat(position.liquidationPrice || 0);
            const margin = parseFloat(position.margin || 0);

            const priceDiff = btcPrice - entryPrice;

            // Calculate unrealized P&L based on leverage
            let unrealizedPnl;
            if (position.side === 'long') {
                unrealizedPnl = priceDiff * size;
            } else {
                unrealizedPnl = -priceDiff * size;
            }

            // Check for liquidation
            let isLiquidated = false;
            if (position.side === 'long' && btcPrice <= liquidationPrice) {
                isLiquidated = true;
                unrealizedPnl = -margin; // Total loss of margin
            } else if (position.side === 'short' && btcPrice >= liquidationPrice) {
                isLiquidated = true;
                unrealizedPnl = -margin; // Total loss of margin
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
                    // Replace alert with enhanced success notification
                    showSuccessNotification(transferAmount);
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

    // New function to validate Futures-specific transfer
    const validateFuturesTransfer = () => {
        if (!selectedMainWallet || !transferToFuturesAmount) {
            setTransferError('Please select a wallet and enter an amount');
            return false;
        }

        const amount = parseFloat(transferToFuturesAmount);
        if (isNaN(amount) || amount <= 0) {
            setTransferError('Please enter a valid amount greater than 0');
            return false;
        }

        const availableBalance = getAvailableBalance(selectedMainWallet);
        if (amount > availableBalance) {
            setTransferError(`Insufficient USDT balance. Available: ${availableBalance.toFixed(2)} USDT`);
            return false;
        }

        // Check minimum transfer amount
        if (amount < 0.01) {
            setTransferError('Minimum transfer amount is 0.01 USDT');
            return false;
        }

        return true;
    };

    // Add this new function to handle Futures-specific transfers
    const handleFuturesTransfer = async () => {
        setTransferError('');
        setIsTransferring(true);

        try {
            const token = localStorage.getItem('auth_token');

            // Validate that we have a selected source wallet
            if (!selectedMainWallet || !transferToFuturesAmount) {
                setTransferError('Please select a source wallet and enter an amount');
                setIsTransferring(false);
                return;
            }

            // Validate the source wallet exists and has sufficient balance
            const sourceWallet = wallets.find(w => w.wallet_id.toString() === selectedMainWallet);
            if (!sourceWallet) {
                setTransferError('Selected wallet not found');
                setIsTransferring(false);
                return;
            }

            const usdtBalance = sourceWallet.balances.find(b => b.cryptocurrency === 'USDT');
            const availableBalance = usdtBalance ? parseFloat(usdtBalance.balance) : 0;
            const transferAmount = parseFloat(transferToFuturesAmount);

            if (availableBalance < transferAmount) {
                setTransferError(`Insufficient balance. Available: ${availableBalance.toFixed(2)} USDT`);
                setIsTransferring(false);
                return;
            }

            // FIXED: Use the corrected futures fund endpoint that handles both operations atomically
            const fundResponse = await fetch('http://localhost:8080/futures/fund-account', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet_id: parseInt(selectedMainWallet),
                    amount: transferToFuturesAmount
                }),
            });

            if (!fundResponse.ok) {
                const errorData = await fundResponse.json();
                throw new Error(errorData.error || 'Failed to transfer to Futures account');
            }

            // Refresh all data
            await Promise.all([
                fetchWallets(),
                fetchFuturesBalances()
            ]);

            // Close modal and reset state
            setShowTransferModal(false);
            setShowFuturesTransferConfirmation(false);
            setTransferToFuturesAmount('');
            setSelectedMainWallet('');
            setTransferError('');
            setIsFuturesTransfer(false);

            // Show success notification
            showSuccessToast(`Successfully transferred ${transferToFuturesAmount} USDT to Futures Account`);

        } catch (error) {
            console.error('Futures transfer error:', error);
            setTransferError(error.message || 'Network error. Please try again.');
        } finally {
            setIsTransferring(false);
        }
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
                // Show success notification
                showSuccessToast('Position closed successfully');
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

    // Get futures-specific balance
    const fetchFuturesBalances = useCallback(async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/futures/balance', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Futures balance data:', data);
                // Ensure we display 0.00 if no balance exists
                setFuturesAvailableBalance(data.available_balance || '0.00');
                setFuturesMarginBalance(data.margin_balance || '0.00');
            } else {
                console.error('Failed to fetch futures balance:', response.status);
                // Set default 0 values if fetch fails
                setFuturesAvailableBalance('0.00');
                setFuturesMarginBalance('0.00');
            }
        } catch (error) {
            console.error('Error fetching futures balances:', error);
            // Set default 0 values on error
            setFuturesAvailableBalance('0.00');
            setFuturesMarginBalance('0.00');
        }
    }, []);

    // Fetch positions from the server
    const fetchPositions = useCallback(async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/futures/positions', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                // Normalize numeric fields to prevent toFixed errors
                const normalizedPositions = (data.positions || []).map(position => ({
                    ...position,
                    size: parseFloat(position.size || 0),
                    entryPrice: parseFloat(position.entryPrice || position.entry_price || 0),
                    markPrice: parseFloat(position.markPrice || position.mark_price || position.current_price || 0),
                    liquidationPrice: parseFloat(position.liquidationPrice || position.liquidation_price || 0),
                    margin: parseFloat(position.margin || 0),
                    unrealizedPnl: parseFloat(position.unrealizedPnl || position.unrealized_pnl || 0)
                }));
                setPositions(normalizedPositions);
            }

            await fetchFuturesBalances();
        } catch (error) {
            console.error('Error fetching positions:', error);
        }
    }, [fetchFuturesBalances]);

    // Fetch P&L history from the server
    const fetchPnlHistory = useCallback(async () => {
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
                console.log('Raw P&L data from backend:', data); // Debug log

                // Process and normalize the P&L history data based on your backend structure
                const normalizedHistory = (data.pnl_history || []).map(record => {
                    console.log('Processing record:', record); // Debug individual records

                    return {
                        id: record.id,
                        symbol: record.symbol || 'BTCUSDT',
                        side: record.side || 'long',
                        size: parseFloat(record.size || 0),
                        entryPrice: parseFloat(record.entry_price || 0),
                        exitPrice: parseFloat(record.exit_price || 0),
                        leverage: parseInt(record.leverage || 1),
                        margin: parseFloat(record.margin || 0),
                        realizedPnl: parseFloat(record.realized_pnl || 0),
                        commission: parseFloat(record.commission || 0),
                        fundingFee: parseFloat(record.funding_fee || 0),
                        fees: parseFloat(record.fees || record.commission || 0),
                        date: record.date || record.created_at,
                        createdAt: record.created_at || record.date
                    };
                });

                console.log('Normalized P&L history:', normalizedHistory); // Debug final result
                setPnlHistory(normalizedHistory);
            } else {
                console.error('Failed to fetch PnL history:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Error fetching P&L history:', error);
        }
    }, []);

    // Add refresh positions function
    const refreshPositions = async () => {
        setIsRefreshingPositions(true);
        try {
            await fetchPositions();
            updatePositionsPnl();
            // Show brief success feedback
            const btn = document.querySelector('.refresh-positions-btn');
            if (btn) {
                const originalContent = btn.innerHTML;
                btn.innerHTML = '✓ Refreshed!';
                setTimeout(() => {
                    btn.innerHTML = originalContent;
                }, 1500);
            }
        } catch (error) {
            console.error('Error refreshing positions:', error);
        } finally {
            setIsRefreshingPositions(false);
        }
    };

    // Function to show enhanced success notification
    const showSuccessNotification = (amount) => {
        // Remove any existing notifications
        const existing = document.querySelector('.success-notification-overlay, .success-toast');
        if (existing) {
            existing.remove();
        }

        // Create the enhanced success modal
        const overlay = document.createElement('div');
        overlay.className = 'success-notification-overlay';

        overlay.innerHTML = `
            <div class="success-notification-modal">
                <div class="success-notification-header">
                    <div class="success-icon-container">
                        <div class="success-icon">✓</div>
                    </div>
                    <h3 class="success-title">Funding Successful!</h3>
                </div>
                
                <div class="success-notification-content">
                    <p class="success-message">
                        Your futures account has been successfully funded and is ready for trading.
                    </p>
                    
                    <div class="success-details">
                        <div class="success-amount">
                            <span class="success-amount-value">${amount}</span>
                            <span class="success-currency">USDT</span>
                        </div>
                        <p class="success-description">
                            Funds have been transferred to your trading account
                        </p>
                    </div>
                    
                    <div class="success-stats">
                        <div class="success-stat">
                            <div class="success-stat-label">Status</div>
                            <div class="success-stat-value">Active</div>
                        </div>
                        <div class="success-stat">
                            <div class="success-stat-label">Available</div>
                            <div class="success-stat-value">${amount} USDT</div>
                        </div>
                    </div>
                    
                    <div class="success-actions">
                        <button class="success-view-balance-btn" onclick="closeSuccessNotification()">
                            View Balance
                        </button>
                        <button class="success-close-btn" onclick="closeSuccessNotification()">
                            Continue Trading
                        </button>
                    </div>
                </div>
                
                <div class="success-progress-bar"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Auto-close after 5 seconds
        setTimeout(() => {
            closeSuccessNotification();
        }, 5000);

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeSuccessNotification();
            }
        });
    };

    // Function to close the success notification
    const closeSuccessNotification = () => {
        const overlay = document.querySelector('.success-notification-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeInOverlay 0.3s ease-out reverse';
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
    };

    // Alternative: Toast notification for less intrusive feedback
    const showSuccessToast = (message) => {
        // Remove any existing toasts
        const existing = document.querySelector('.success-toast');
        if (existing) {
            existing.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'success-toast';

        toast.innerHTML = `
            <div class="success-toast-content">
                <div class="success-toast-icon">✓</div>
                <div class="success-toast-text">
                    <div class="success-toast-title">Success!</div>
                    <div class="success-toast-message">${message}</div>
                </div>
                <button class="success-toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        document.body.appendChild(toast);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideInToast 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) reverse';
                setTimeout(() => toast.remove(), 400);
            }
        }, 4000);
    };

    // Make closeSuccessNotification available globally for onclick handlers
    window.closeSuccessNotification = closeSuccessNotification;

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
        fetchPositions();
        fetchPnlHistory();
        fetchFuturesBalances();

        // Set up interval refreshs
        const priceInterval = setInterval(fetchBtcPrice, 30000);
        const positionsInterval = setInterval(fetchPositions, 60000);

        return () => {
            clearInterval(priceInterval);
            clearInterval(positionsInterval);
        };
    }, [navigate, fetchBtcPrice, fetchPositions, fetchPnlHistory, fetchFuturesBalances]);

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
                                                <span>{getFuturesAccountBalance().toFixed(2)} USDT</span>
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
                                                onClick={() => {
                                                    setShowTransferModal(true);
                                                    setIsFuturesTransfer(true);
                                                    setTransferError('');
                                                }}
                                            >
                                                <span className="transfer-icon">💲</span>
                                                Transfer to Futures Account
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
                                    <div className="positions-header-actions">
                                        <button
                                            className="refresh-positions-btn"
                                            onClick={refreshPositions}
                                            disabled={isRefreshingPositions}
                                            title="Refresh position data and unrealized P&L"
                                        >
                                            {isRefreshingPositions ? (
                                                <>
                                                    <span className="refresh-spinner">⟳</span>
                                                    Refreshing...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="refresh-icon">🔄</span>
                                                    Refresh Positions
                                                </>
                                            )}
                                        </button>
                                    </div>
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
                                                <div className="col">{parseFloat(position.size || 0).toFixed(3)} BTC</div>
                                                <div className="col">
                                                    <span className={`leverage-display ${position.leverage === 1 ? 'leverage-safe' : ''}`}>
                                                        {position.leverage}x
                                                    </span>
                                                </div>
                                                <div className="col">
                                                    ${isNaN(parseFloat(position.entryPrice)) ? '0.00' : parseFloat(position.entryPrice).toFixed(2)}
                                                </div>
                                                <div className="col">
                                                    ${isNaN(parseFloat(position.markPrice)) ? '0.00' : parseFloat(position.markPrice).toFixed(2)}
                                                </div>
                                                <div className="col">
                                                    ${isNaN(parseFloat(position.liquidationPrice)) ? '0.00' : parseFloat(position.liquidationPrice).toFixed(2)}
                                                </div>
                                                <div className="col">{parseFloat(position.margin || 0).toFixed(2)} USDT</div>
                                                <div className="col">
                                                    <span className={`pnl ${parseFloat(position.unrealizedPnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                        {parseFloat(position.unrealizedPnl || 0) >= 0 ? '+' : ''}{parseFloat(position.unrealizedPnl || 0).toFixed(5)} USDT
                                                    </span>
                                                    {position.isLiquidated && (
                                                        <span className="liquidated-tag">LIQUIDATED</span>
                                                    )}
                                                </div>
                                                <div className="col">
                                                    <button
                                                        className="close-btn"
                                                        disabled={position.isLiquidated}
                                                        onClick={() => closePosition(position.id, parseFloat(position.size || 0))}
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
                                    <button
                                        className="refresh-btn"
                                        onClick={() => fetchPnlHistory()}
                                        disabled={isLoading}
                                    >
                                        Refresh
                                    </button>
                                </div>
                                <div className="pnl-table">
                                    <div className="table-header">
                                        <div className="col">Date</div>
                                        <div className="col">Symbol</div>
                                        <div className="col">Side</div>
                                        <div className="col">Size</div>
                                        <div className="col">Entry Price</div>
                                        <div className="col">Exit Price</div>
                                        <div className="col">Realized P&L</div>
                                        <div className="col">Funding Fee</div>
                                        <div className="col">Fees</div>
                                    </div>
                                    {pnlHistory.length === 0 ? (
                                        <div className="no-pnl">
                                            <p>No P&L history available</p>
                                            <p>Complete some trades to see your history here.</p>
                                        </div>
                                    ) : (
                                        pnlHistory.map((record, index) => {
                                            const displayDate = new Date(record.date || record.createdAt).toLocaleString();
                                            const size = Number(record.size || 0);
                                            const entryPrice = Number(record.entryPrice || 0);
                                            const exitPrice = Number(record.exitPrice || 0);
                                            const realizedPnl = Number(record.realizedPnl || 0);
                                            const fees = Number(record.fees || 0);
                                            const fundingFee = Number(record.fundingFee || 0); // Get the funding fee value

                                            return (
                                                <div key={record.id || index} className="table-row">
                                                    <div className="col" title={record.date || record.createdAt}>
                                                        {displayDate}
                                                    </div>
                                                    <div className="col">{record.symbol || 'BTCUSDT'}</div>
                                                    <div className="col">
                                                        <span className={`side-indicator ${(record.side || 'long').toLowerCase()}`}>
                                                            {(record.side || 'LONG').toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="col">{size.toFixed(4)} BTC</div>
                                                    <div className="col">${entryPrice.toFixed(2)}</div>
                                                    <div className="col">${exitPrice.toFixed(2)}</div>
                                                    <div className="col">
                                                        <span className={`pnl ${realizedPnl >= 0 ? 'positive' : 'negative'}`}>
                                                            {realizedPnl >= 0 ? '+' : ''}{realizedPnl.toFixed(5)} USDT
                                                        </span>
                                                    </div>
                                                    <div className="col">
                                                        <span className={`${fundingFee !== 0 ? (fundingFee > 0 ? 'negative' : 'positive') : ''}`}>
                                                            {fundingFee !== 0 ? (fundingFee > 0 ? '+' : '') + fundingFee.toFixed(2) : '0.00'} USDT
                                                        </span>
                                                    </div>
                                                    <div className="col">{fees.toFixed(2)} USDT</div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                                {pnlHistory.length > 0 && (
                                    <div className="pnl-summary">
                                        <div className="summary-item">
                                            <span>Total Trades: {pnlHistory.length}</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>Total P&L: </span>
                                            <span className={`pnl ${pnlHistory.reduce((sum, record) => sum + (Number(record.realizedPnl || 0)), 0) >= 0 ? 'positive' : 'negative'}`}>
                                                {pnlHistory.reduce((sum, record) => sum + (Number(record.realizedPnl || 0)), 0).toFixed(5)} USDT
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Modified Futures Balance Panel - Removed Fund button completely */}
                        <div className="futures-balance-panel">
                            <h4>Futures Account Balance</h4>
                            <div className="balance-item">
                                <span>Trading Balance:</span>
                                <span className={parseFloat(futuresAvailableBalance) === 0 && parseFloat(futuresMarginBalance) === 0 ? 'zero-balance' : ''}>
                                    {(parseFloat(futuresAvailableBalance) + parseFloat(futuresMarginBalance)).toFixed(2)} USDT
                                </span>
                            </div>
                            <div className="balance-item">
                                <span>Available for Trading:</span>
                                <span className={parseFloat(futuresAvailableBalance) === 0 ? 'zero-balance' : ''}>
                                    {parseFloat(futuresAvailableBalance).toFixed(2)} USDT
                                </span>
                            </div>
                            <div className="balance-item">
                                <span>In Positions:</span>
                                <span>{parseFloat(futuresMarginBalance).toFixed(2)} USDT</span>
                            </div>

                            {/* Modified notice - no reference to fund button */}
                            {parseFloat(futuresAvailableBalance) === 0 && parseFloat(futuresMarginBalance) === 0 && (
                                <div className="zero-balance-notice">
                                    <span className="notice-icon">💡</span>
                                    <span>Use the transfer button above to fund your futures account</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {apiError && (
                        <div className="error-alert">
                            {apiError}
                        </div>
                    )}
                </main>
            </div>

            {/* Enhanced Transfer Modal with Futures Support */}
            {showTransferModal && (
                <div className="modal-overlay">
                    <div className="transfer-modal">
                        <div className="modal-header">
                            <h3>
                                {isFuturesTransfer
                                    ? 'Transfer USDT to Futures Account'
                                    : 'Transfer USDT Between Wallets'
                                }
                            </h3>
                            <button
                                className="close-button"
                                onClick={() => {
                                    setShowTransferModal(false);
                                    setShowConfirmation(false);
                                    setShowFuturesTransferConfirmation(false);
                                    setTransferError('');
                                    setIsFuturesTransfer(false);
                                    setSelectedMainWallet('');
                                    setTransferToFuturesAmount('');
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {isFuturesTransfer ? (
                            // Futures Transfer Flow
                            !showFuturesTransferConfirmation ? (
                                <div className="modal-content">
                                    <div className="futures-transfer-info">
                                        <div className="transfer-notice futures">
                                            <span className="futures-icon">📈</span>
                                            <span>Transfer to Futures Trading Account</span>
                                        </div>
                                        <p>Move USDT from your main wallet to your Futures account for trading</p>
                                    </div>

                                    <div className="form-group">
                                        <label>From Main Wallet</label>
                                        <select
                                            value={selectedMainWallet}
                                            onChange={(e) => setSelectedMainWallet(e.target.value)}
                                            className="wallet-select"
                                        >
                                            <option value="">Select source wallet</option>
                                            {wallets.filter(wallet => {
                                                // Debug logging to help identify the issue
                                                console.log(`Checking wallet: ${wallet.name}`, {
                                                    wallet_id: wallet.wallet_id,
                                                    balances: wallet.balances
                                                });

                                                // Find USDT balance
                                                const usdtBalance = wallet.balances.find(b => b.cryptocurrency === 'USDT');

                                                if (!usdtBalance) {
                                                    console.log(`${wallet.name}: No USDT balance found`);
                                                    return false;
                                                }

                                                // Parse balance more carefully
                                                const balanceStr = usdtBalance.balance;
                                                const balanceNum = parseFloat(balanceStr);

                                                console.log(`${wallet.name}: Balance string = "${balanceStr}", Parsed = ${balanceNum}`);

                                                // Check if balance is greater than 0
                                                const hasPositiveBalance = !isNaN(balanceNum) && balanceNum > 0;

                                                // More specific exclusion - only exclude actual futures trading accounts
                                                const isFuturesTrading = (
                                                    // Check wallet type
                                                    (wallet.wallet_type && wallet.wallet_type.toLowerCase() === 'futures_trading') ||
                                                    // Very specific name patterns only
                                                    (wallet.name && wallet.name.toLowerCase() === 'futures trading account')
                                                );

                                                const shouldShow = hasPositiveBalance && !isFuturesTrading;

                                                console.log(`${wallet.name}: hasPositiveBalance=${hasPositiveBalance}, isFuturesTrading=${isFuturesTrading}, shouldShow=${shouldShow}`);

                                                return shouldShow;
                                            }).map(wallet => (
                                                <option key={wallet.wallet_id} value={wallet.wallet_id}>
                                                    {wallet.name} - {getAvailableBalance(wallet.wallet_id.toString()).toFixed(2)} USDT
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>To Account</label>
                                        <div className="destination-account">
                                            <div className="account-info">
                                                <span className="account-icon">📈</span>
                                                <span className="account-name">Futures Trading Account</span>
                                                <span className="account-balance">
                                                    Current: {(parseFloat(futuresAvailableBalance) + parseFloat(futuresMarginBalance)).toFixed(2)} USDT
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Amount (USDT)</label>
                                        <div className="amount-input-group enhanced">
                                            <input
                                                type="number"
                                                value={transferToFuturesAmount}
                                                onChange={(e) => setTransferToFuturesAmount(e.target.value)}
                                                placeholder="0.00"
                                                step="0.01"
                                                min="0.01"
                                                className="amount-input"
                                            />
                                            <span className="currency-label">USDT</span>
                                            {selectedMainWallet && (
                                                <button
                                                    className="max-button"
                                                    onClick={() => setTransferToFuturesAmount(getAvailableBalance(selectedMainWallet).toString())}
                                                >
                                                    MAX
                                                </button>
                                            )}
                                        </div>
                                        {selectedMainWallet && (
                                            <div className="available-balance">
                                                Available: {getAvailableBalance(selectedMainWallet).toFixed(2)} USDT
                                            </div>
                                        )}
                                    </div>

                                    <div className="transfer-benefits">
                                        <h4>Transfer Benefits</h4>
                                        <ul>
                                            <li>✅ Instant transfer to trading account</li>
                                            <li>✅ No fees for internal transfers</li>
                                            <li>✅ Immediate availability for futures trading</li>
                                            <li>✅ Real-time balance updates</li>
                                        </ul>
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
                                                setIsFuturesTransfer(false);
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="continue-button futures"
                                            onClick={() => {
                                                if (validateFuturesTransfer()) {
                                                    setShowFuturesTransferConfirmation(true);
                                                }
                                            }}
                                            disabled={!selectedMainWallet || !transferToFuturesAmount}
                                        >
                                            Continue to Futures
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Futures Transfer Confirmation
                                <div className="confirmation-content">
                                    <div className="confirmation-details">
                                        <h4>Confirm Futures Transfer</h4>
                                        <div className="transfer-summary futures">
                                            <div className="summary-header">
                                                <span className="transfer-icon">📈</span>
                                                <span>Futures Account Transfer</span>
                                            </div>
                                            <div className="summary-item">
                                                <span>From:</span>
                                                <span>{wallets.find(w => w.wallet_id.toString() === selectedMainWallet)?.name}</span>
                                            </div>
                                            <div className="summary-item">
                                                <span>To:</span>
                                                <span className="futures-destination">Futures Trading Account</span>
                                            </div>
                                            <div className="summary-item highlight">
                                                <span>Amount:</span>
                                                <span className="amount-highlight">{transferToFuturesAmount} USDT</span>
                                            </div>
                                            <div className="summary-item">
                                                <span>Transfer Fee:</span>
                                                <span className="fee-free">FREE</span>
                                            </div>
                                            <div className="summary-item">
                                                <span>Processing Time:</span>
                                                <span>Instant</span>
                                            </div>
                                        </div>

                                        <div className="balance-preview">
                                            <h5>After Transfer:</h5>
                                            <div className="balance-change">
                                                <span>Main Wallet:</span>
                                                <span>
                                                    {(getAvailableBalance(selectedMainWallet) - parseFloat(transferToFuturesAmount || 0)).toFixed(2)} USDT
                                                    <small className="change-indicator">
                                                        (-{parseFloat(transferToFuturesAmount || 0).toFixed(2)})
                                                    </small>
                                                </span>
                                            </div>
                                            <div className="balance-change">
                                                <span>Futures Account:</span>
                                                <span>
                                                    {(parseFloat(futuresAvailableBalance) + parseFloat(futuresMarginBalance) + parseFloat(transferToFuturesAmount || 0)).toFixed(2)} USDT
                                                    <small className="change-indicator positive">
                                                        (+{parseFloat(transferToFuturesAmount || 0).toFixed(2)})
                                                    </small>
                                                </span>
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
                                            onClick={() => setShowFuturesTransferConfirmation(false)}
                                            disabled={isTransferring}
                                        >
                                            Back
                                        </button>
                                        <button
                                            className="confirm-button futures"
                                            onClick={handleFuturesTransfer}
                                            disabled={isTransferring}
                                        >
                                            {isTransferring ? (
                                                <>
                                                    <span className="loading-spinner">⟳</span>
                                                    Processing Transfer...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="confirm-icon">✅</span>
                                                    Confirm Transfer
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            // Original wallet-to-wallet transfer flow remains unchanged
                            !showConfirmation ? (
                                <div className="modal-content">
                                    {/* Existing wallet-to-wallet transfer content */}
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
                                                // Apply the same improved filtering logic for regular transfers
                                                const usdtBalance = wallet.balances.find(b => b.cryptocurrency === 'USDT');

                                                if (!usdtBalance) return false;

                                                const balanceNum = parseFloat(usdtBalance.balance);
                                                const hasPositiveBalance = !isNaN(balanceNum) && balanceNum > 0;

                                                // Only exclude actual futures trading accounts
                                                const isFuturesTrading = (
                                                    (wallet.wallet_type && wallet.wallet_type.toLowerCase() === 'futures_trading') ||
                                                    (wallet.name && wallet.name.toLowerCase() === 'futures trading account')
                                                );

                                                return hasPositiveBalance && !isFuturesTrading;
                                            }).map(wallet => (
                                                <option key={wallet.wallet_id} value={wallet.wallet_id}>
                                                    {wallet.name} - {getAvailableBalance(wallet.wallet_id.toString()).toFixed(2)} USDT
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
                                /* Existing confirmation content for wallet-to-wallet transfers */
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
                            )
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