import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AssetsOverview.css';
import { createSynchronizedInterval, clearSynchronizedInterval } from '../utils/refreshUtils';
import RefreshIndicator from './RefreshIndicator';
import SearchBox from './SearchBox/SearchBox';

function AssetsOverview() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [wallets, setWallets] = useState([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [lastRefreshTime, setLastRefreshTime] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [availableCryptocurrencies, setAvailableCryptocurrencies] = useState([]);

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

    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('auth_token');
                if (!token) {
                    navigate('/login');
                    return;
                }

                // Fetch user profile
                try {
                    const userResponse = await fetch('http://localhost:8080/user/profile', {
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
                    } else if (userResponse.status === 401) {
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }

                // Fetch wallets
                try {
                    const walletsResponse = await fetch('http://localhost:8080/wallet/list', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (walletsResponse.ok) {
                        const data = await walletsResponse.json();
                        if (data.wallets && Array.isArray(data.wallets)) {
                            setWallets(data.wallets);

                            // Calculate total balance across all wallets using USD values
                            let totalUsd = 0;
                            data.wallets.forEach(wallet => {
                                wallet.balances.forEach(balance => {
                                    // Use usd_value if available, otherwise fall back to the balance
                                    if (balance.usd_value) {
                                        totalUsd += parseFloat(balance.usd_value);
                                    }
                                });
                            });
                            setTotalBalance(totalUsd);
                        }
                    } else {
                        console.error('Failed to fetch wallets');
                        setApiError('Failed to load wallets. Please try again later.');
                    }
                } catch (error) {
                    console.error('Error fetching wallets:', error);
                    setApiError('Network error when fetching wallets.');
                }

                // Fetch available cryptocurrencies
                try {
                    const cryptoResponse = await fetch('http://localhost:8080/api/cryptocurrencies', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (cryptoResponse.ok) {
                        const data = await cryptoResponse.json();
                        if (data.cryptocurrencies && Array.isArray(data.cryptocurrencies)) {
                            setAvailableCryptocurrencies(data.cryptocurrencies);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching cryptocurrencies:', error);
                }

            } catch (error) {
                console.error('Error in assets overview data fetching:', error);
                setApiError('Could not load asset information. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();

        // Create a refresh function that only updates wallet balances
        const refreshWalletBalances = async () => {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            try {
                setIsRefreshing(true);
                const walletsResponse = await fetch('http://localhost:8080/wallet/list', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (walletsResponse.ok) {
                    const data = await walletsResponse.json();
                    if (data.wallets && Array.isArray(data.wallets)) {
                        setWallets(data.wallets);

                        // Recalculate total balance with updated prices
                        let totalUsd = 0;
                        data.wallets.forEach(wallet => {
                            wallet.balances.forEach(balance => {
                                if (balance.usd_value) {
                                    totalUsd += parseFloat(balance.usd_value);
                                }
                            });
                        });
                        setTotalBalance(totalUsd);
                    }
                }
                setLastRefreshTime(new Date());
            } catch (error) {
                console.error('Error refreshing wallets:', error);
            } finally {
                setIsRefreshing(false);
            }
        };

        // Use synchronized interval for consistent timing across components
        const syncedInterval = createSynchronizedInterval(refreshWalletBalances);

        // Clean up interval on component unmount
        return () => clearSynchronizedInterval(syncedInterval);
    }, [navigate]);

    // Navigate to wallet details when a wallet is clicked
    const handleWalletClick = (walletId) => {
        // Save the selected wallet ID in session storage for the detailed view
        sessionStorage.setItem('selectedWalletId', walletId);
        navigate('/assets');
    };

    // Navigate to admin panel
    const navigateToAdminPanel = () => {
        navigate('/admin');
    };

    // Get crypto icon and name
    const getCryptoInfo = (symbol) => {
        const crypto = availableCryptocurrencies.find(c => c.symbol === symbol);
        return {
            icon: crypto?.icon_url,
            name: crypto?.name || symbol
        };
    };

    // Calculate wallet USD value considering all balances
    const calculateWalletUsdValue = (wallet) => {
        let totalValue = 0;
        if (wallet && wallet.balances && Array.isArray(wallet.balances)) {
            wallet.balances.forEach(balance => {
                if (balance.usd_value) {
                    // Ensure we're handling string values correctly
                    const balanceValue = typeof balance.usd_value === 'string'
                        ? parseFloat(balance.usd_value)
                        : balance.usd_value;

                    if (!isNaN(balanceValue)) {
                        totalValue += balanceValue;
                    }
                }
            });
        }
        return totalValue;
    };

    // Format USD values with appropriate precision based on value magnitude
    const formatUsdValue = (value) => {
        if (!value || isNaN(parseFloat(value))) return "$0.00";

        const numValue = parseFloat(value);

        // For extremely small values (less than $0.000000001), scientific notation
        if (numValue < 0.000000001 && numValue > 0) {
            return `$${numValue.toExponential(6)}`;
        }
        // For very small values (less than $0.000001), use 9 decimal places
        else if (numValue < 0.000001 && numValue > 0) {
            return `$${numValue.toFixed(9)}`;
        }
        // For small values (less than $0.01), use 6 decimal places
        else if (numValue < 0.01 && numValue > 0) {
            return `$${numValue.toFixed(6)}`;
        }
        // For medium values (less than $1000), use 2 decimal places
        else if (numValue < 1000) {
            return `$${numValue.toFixed(2)}`;
        }
        // For large values, use commas for thousands and 2 decimal places
        else {
            return `$${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    };

    if (isLoading) {
        return <div className="loading-container">Loading your assets overview...</div>;
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
                        <li className="nav-item active">
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
                    <div className="assets-overview-container">
                        <div className="assets-overview-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <h2>Assets Overview</h2>
                                <RefreshIndicator
                                    lastRefreshTime={lastRefreshTime}
                                    isRefreshing={isRefreshing}
                                />
                            </div>
                            <div className="total-assets">
                                <div className="total-amount" title={`${totalBalance} USD`}>
                                    {formatUsdValue(totalBalance)} USD
                                </div>
                            </div>
                        </div>

                        <div className="assets-tabs">
                            <div className="tab active">Account</div>
                        </div>

                        <div className="my-assets-section">
                            <h3>My Assets</h3>

                            <div className="wallet-cards-grid">
                                {wallets.length > 0 ? (
                                    wallets.map(wallet => {
                                        // Use the helper function to calculate USD value
                                        const walletUsdValue = calculateWalletUsdValue(wallet);

                                        return (
                                            <div
                                                key={wallet.wallet_id}
                                                className="wallet-overview-card"
                                                onClick={() => handleWalletClick(wallet.wallet_id)}
                                            >
                                                <div className="wallet-overview-name">
                                                    {wallet.name}
                                                    <span className={`wallet-type-badge ${wallet.wallet_type.toLowerCase()}`}>
                                                        {wallet.wallet_type}
                                                    </span>
                                                </div>
                                                <div className="wallet-overview-balance" title={`${walletUsdValue} USD`}>
                                                    {formatUsdValue(walletUsdValue)} USD
                                                </div>
                                                <div className="wallet-overview-info">
                                                    <div className="wallet-addresses-count">
                                                        {wallet.addresses ? wallet.addresses.length : 0} Addresses
                                                    </div>
                                                    <div className="wallet-currencies">
                                                        {wallet.addresses && wallet.addresses.length > 0 ? (
                                                            <div className="currency-icons">
                                                                {wallet.addresses.map(addr => {
                                                                    const cryptoInfo = getCryptoInfo(addr.cryptocurrency);
                                                                    return (
                                                                        <span key={addr.cryptocurrency} className="currency-icon-wrapper" title={cryptoInfo.name}>
                                                                            {cryptoInfo.icon ? (
                                                                                <img src={cryptoInfo.icon} alt={addr.cryptocurrency} className="currency-icon" />
                                                                            ) : (
                                                                                <span className="currency-icon-placeholder">{addr.cryptocurrency.charAt(0)}</span>
                                                                            )}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            'No cryptocurrencies yet'
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="wallet-overview-actions">
                                                    <button className="wallet-action-icon view-details">
                                                        <span>→</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="no-wallets-message">
                                        <p>You haven't created any wallets yet.</p>
                                        <button
                                            className="create-wallet-button"
                                            onClick={() => navigate('/assets')}
                                        >
                                            Create Wallet
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {wallets.length > 0 && (
                            <div className="create-wallet-section">
                                <button
                                    className="create-wallet-button-large"
                                    onClick={() => navigate('/assets')}
                                >
                                    Create New Wallet
                                </button>
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

export default AssetsOverview;