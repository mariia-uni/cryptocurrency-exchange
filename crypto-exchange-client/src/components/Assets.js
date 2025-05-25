import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Assets.css';
import { createSynchronizedInterval, clearSynchronizedInterval } from '../utils/refreshUtils';
import RefreshIndicator from './RefreshIndicator';

function Assets() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [lastRefreshTime, setLastRefreshTime] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Wallet creation state
    const [showWalletCreation, setShowWalletCreation] = useState(false);
    const [walletName, setWalletName] = useState('My Custodial Wallet');
    const [walletCreated, setWalletCreated] = useState(false);
    const [isCreatingWallet, setIsCreatingWallet] = useState(false);
    const [walletData, setWalletData] = useState(null);
    const [walletCreationError, setWalletCreationError] = useState('');

    // User wallets state
    const [userWallets, setUserWallets] = useState([]);
    const [isLoadingWallets, setIsLoadingWallets] = useState(true);

    // Address generation state
    const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
    const [addressGenerationStatus, setAddressGenerationStatus] = useState(null);
    const [activeWalletId, setActiveWalletId] = useState(null);

    // New state for available cryptocurrencies
    const [availableCryptocurrencies, setAvailableCryptocurrencies] = useState([]);
    const [isLoadingCryptocurrencies, setIsLoadingCryptocurrencies] = useState(true);

    // Add state for search functionality
    const [cryptoSearch, setCryptoSearch] = useState('');

    // Add pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Enhanced function to get proper display name from user data
    const getDisplayName = (user) => {
        if (!user) return "Guest";

        // Check if we have user_verification data with first_name and last_name
        if (user.verification && user.verification.first_name && user.verification.last_name) {
            return `${user.verification.first_name} ${user.verification.last_name}`;
        }

        // Check if first_name and last_name are directly on the user object
        if (user.first_name && user.last_name) {
            return `${user.first_name} ${user.last_name}`;
        }

        // Use display_name if available
        if (user.display_name) {
            return user.display_name;
        }

        // Use username if available
        if (user.username) {
            return user.username;
        }

        // Use email without domain as fallback
        if (user.email) {
            return user.email.split('@')[0];
        }

        // If we have an ID but nothing else, just use a friendly format
        return `User ${user.id ? '#' + user.id : ''}`;
    };

    // Function to handle admin panel navigation
    const navigateToAdminPanel = () => {
        navigate('/admin');
    };

    // Function to handle wallet creation (updated for multi-chain custodial wallets)
    const handleCreateWallet = async () => {
        if (!walletName.trim()) {
            setWalletCreationError('Please enter a wallet name');
            return;
        }

        setWalletCreationError('');
        setIsCreatingWallet(true);

        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch('http://localhost:8080/wallet/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet_type: 'CUSTODIAL',
                    name: walletName
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create wallet');
            }

            // Success - store wallet data and show confirmation
            setWalletData(data.wallet);
            setWalletCreated(true);

            // Add the new wallet to the list
            setUserWallets(prevWallets => [...prevWallets, data.wallet]);

        } catch (error) {
            console.error('Error creating wallet:', error);
            setWalletCreationError(error.message || 'Failed to create wallet. Please try again.');
        } finally {
            setIsCreatingWallet(false);
        }
    };

    // Function to generate cryptocurrency address for a wallet
    const generateAddress = async (walletId, cryptocurrency) => {
        setActiveWalletId(walletId);
        try {
            setIsGeneratingAddress(true);

            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/wallet/address/generate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet_id: walletId,
                    cryptocurrency: cryptocurrency
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate address');
            }

            const data = await response.json();

            // Refresh wallet list with fresh data - most important part
            await fetchUserWallets(token);

            // Update generation status
            setAddressGenerationStatus({
                success: true,
                message: `${cryptocurrency} address generated successfully!`,
                address: data.address.address,
                walletId: walletId
            });
        } catch (error) {
            console.error('Error generating address:', error);
            setAddressGenerationStatus({
                success: false,
                message: error.message || 'Failed to generate address',
                walletId: walletId
            });
        } finally {
            setIsGeneratingAddress(false);
        }
    };

    // Function to fetch user wallets
    const fetchUserWallets = async (token) => {
        try {
            setIsLoadingWallets(true);
            console.log("Fetching wallets with token:", token);

            const response = await fetch('http://localhost:8080/wallet/list', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' // Add explicit Accept header
                },
            });

            console.log("Response status:", response.status);

            if (response.ok) {
                const text = await response.text();
                console.log('Raw wallet response:', text);

                // Only try to parse if it looks like valid JSON
                if (text && text.trim()) {
                    try {
                        const data = JSON.parse(text);
                        console.log('Parsed wallet data:', data);

                        if (data.wallets && Array.isArray(data.wallets)) {
                            setUserWallets(data.wallets);
                        } else {
                            console.warn("Unexpected wallet data format:", data);
                            setUserWallets([]);
                        }
                    } catch (parseError) {
                        console.error('Error parsing wallet data:', parseError);
                        setUserWallets([]);
                        setApiError('Failed to parse wallet data. Please try again later.');
                    }
                } else {
                    console.warn("Empty response from wallet list endpoint");
                    setUserWallets([]);
                }
            } else {
                console.error(`Could not fetch wallets. Status: ${response.status}`);
                setApiError('Failed to load your wallets. Please try again later.');
                setUserWallets([]);
            }
        } catch (error) {
            console.error('Error fetching wallets:', error);
            setApiError('Network error when fetching wallets. Please check your connection.');
            setUserWallets([]);
        } finally {
            setIsLoadingWallets(false);
        }
    };

    // Function to fetch available cryptocurrencies
    const fetchAvailableCryptocurrencies = async (token) => {
        try {
            setIsLoadingCryptocurrencies(true);

            const response = await fetch('http://localhost:8080/api/cryptocurrencies', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.cryptocurrencies && Array.isArray(data.cryptocurrencies)) {
                    console.log('Available cryptocurrencies:', data.cryptocurrencies);
                    setAvailableCryptocurrencies(data.cryptocurrencies);
                } else {
                    console.warn("Unexpected cryptocurrency data format:", data);
                    // Fallback to BTC and ETH
                    setAvailableCryptocurrencies([
                        { symbol: 'BTC', name: 'Bitcoin' },
                        { symbol: 'ETH', name: 'Ethereum' }
                    ]);
                }
            } else {
                console.error(`Could not fetch cryptocurrencies. Status: ${response.status}`);
                // Fallback to BTC and ETH
                setAvailableCryptocurrencies([
                    { symbol: 'BTC', name: 'Bitcoin' },
                    { symbol: 'ETH', name: 'Ethereum' }
                ]);
            }
        } catch (error) {
            console.error('Error fetching cryptocurrencies:', error);
            // Fallback to BTC and ETH
            setAvailableCryptocurrencies([
                { symbol: 'BTC', name: 'Bitcoin' },
                { symbol: 'ETH', name: 'Ethereum' }
            ]);
        } finally {
            setIsLoadingCryptocurrencies(false);
        }
    };

    // Add this filter function
    const filterCryptocurrencies = (balances) => {
        if (!cryptoSearch) return balances;

        return balances.filter(balance => {
            const crypto = availableCryptocurrencies.find(c => c.symbol === balance.cryptocurrency);
            const name = crypto ? crypto.name : balance.cryptocurrency;
            return balance.cryptocurrency.toLowerCase().includes(cryptoSearch.toLowerCase()) ||
                name.toLowerCase().includes(cryptoSearch.toLowerCase());
        });
    };

    // Add pagination logic
    const paginateCryptocurrencies = (items) => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return items.slice(startIndex, startIndex + itemsPerPage);
    };

    // Format USD values with appropriate precision based on value magnitude
    const formatUsdValue = (value) => {
        if (!value || isNaN(parseFloat(value))) return "$0.00";

        const numValue = parseFloat(value);

        // For very small values (less than $0.000001), use 9 decimal places
        if (numValue < 0.000001 && numValue > 0) {
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

    // Add this utility function after your formatUsdValue function

    // Format cryptocurrency values with appropriate precision based on magnitude
    const formatCryptoValue = (value, symbol) => {
        if (!value || isNaN(parseFloat(value))) return "0.00000000";

        const numValue = parseFloat(value);

        // Different formatting based on cryptocurrency type
        if (symbol === 'BTC' || symbol === 'ETH') {
            // For BTC/ETH show 8 decimal places
            return numValue.toFixed(8);
        } else if (numValue < 0.0001 && numValue > 0) {
            // For very small values of alt coins, use 9 decimal places
            return numValue.toFixed(9);
        } else if (numValue < 1 && numValue > 0) {
            // For smaller values show 6 decimal places
            return numValue.toFixed(6);
        } else if (numValue >= 1 && numValue < 1000) {
            // For medium values show 4 decimal places
            return numValue.toFixed(4);
        } else if (numValue >= 1000) {
            // For large values show 2 decimal places
            return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            // Default case
            return numValue.toString();
        }
    };

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                // Redirect to login if no token
                if (!token) {
                    navigate('/login');
                    return;
                }

                // Try to parse the token for basic info (fallback)
                try {
                    const tokenParts = token.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(atob(tokenParts[1]));
                        const fallbackUserData = {
                            email: payload.email || payload.sub || "User",
                            user_id: payload.user_id || payload.sub,
                            first_name: payload.first_name || "",
                            last_name: payload.last_name || "",
                            username: payload.username || "",
                        };
                        setUserData(fallbackUserData);
                    }
                } catch (tokenError) {
                    console.warn("Could not parse token for fallback user data:", tokenError);
                }

                // Fetch user data from API
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
                    } else if (userResponse.status === 401) {
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                        return;
                    }
                } catch (userApiError) {
                    console.warn("API error when fetching user data:", userApiError);
                }

                // Fetch user wallets
                await fetchUserWallets(token);

                // Fetch available cryptocurrencies
                await fetchAvailableCryptocurrencies(token);

            } catch (error) {
                console.error('Error in assets data fetching:', error);
                setApiError('Could not load your asset information. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();

        // Create a refresh function that only updates wallet balances
        const refreshWalletBalances = async () => {
            setIsRefreshing(true);
            const token = localStorage.getItem('auth_token');
            try {
                if (token) {
                    // Only refresh wallet data without refreshing user profile
                    await fetchUserWallets(token);
                    // Update last refresh time
                    setLastRefreshTime(new Date());
                }
            } catch (error) {
                console.error('Error refreshing wallet data:', error);
            } finally {
                setIsRefreshing(false);
            }
        };

        // Use synchronized interval for consistent timing across components
        const syncedInterval = createSynchronizedInterval(refreshWalletBalances);

        // Clean up interval on component unmount
        return () => clearSynchronizedInterval(syncedInterval);
    }, [navigate]);

    // Example of how to update Assets.js later (not part of current task)
    useEffect(() => {
        // Get the selected wallet ID from sessionStorage
        const selectedWalletId = sessionStorage.getItem('selectedWalletId');
        if (selectedWalletId) {
            // Clear it to avoid issues on page refresh
            sessionStorage.removeItem('selectedWalletId');

            // Scroll to the selected wallet after wallets are loaded
            setTimeout(() => {
                const element = document.getElementById(`wallet-${selectedWalletId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                    element.classList.add('highlighted');
                }
            }, 500);
        }
    }, [userWallets]);

    // Render the wallet list
    const renderWalletList = () => {
        if (isLoadingWallets) {
            return <div className="wallet-loading">Loading your wallets...</div>;
        }

        if (userWallets.length === 0) {
            return (
                <div className="no-wallet-message">
                    <h3>No Wallets Found</h3>
                    <p>You don't have any wallets yet. Create one to start managing your cryptocurrency assets.</p>
                    <button
                        className="wallet-button primary"
                        onClick={() => setShowWalletCreation(true)}
                    >
                        Create Wallet
                    </button>
                </div>
            );
        }

        return (
            <div className="wallets-container">
                <div className="wallets-header">
                    <div className="wallets-header-left">
                        <h3>Your Wallets</h3>
                        <button
                            className="back-to-overview-button"
                            onClick={() => navigate('/assets-overview')}
                        >
                            Back to Overview
                        </button>
                    </div>
                    <button
                        className="wallet-button primary"
                        onClick={() => setShowWalletCreation(true)}
                    >
                        Create New Wallet
                    </button>
                </div>

                <div className="wallet-cards">
                    {userWallets.map((wallet) => renderWallet(wallet))}
                </div>
            </div>
        );
    };

    // Render wallet with multi-chain support
    const renderWallet = (wallet) => {
        const isActiveWallet = wallet.wallet_id === activeWalletId;

        // Sort cryptocurrencies by symbol
        const sortedBalances = [...wallet.balances].sort((a, b) =>
            a.cryptocurrency.localeCompare(b.cryptocurrency)
        );

        // Use filteredBalances instead of sortedBalances
        const filteredBalances = filterCryptocurrencies(sortedBalances);
        const paginatedBalances = paginateCryptocurrencies(filteredBalances);
        const totalPages = Math.ceil(filteredBalances.length / itemsPerPage);

        // Calculate total crypto balance and USD value for the wallet
        const totalCryptoBalance = wallet.balances.reduce((total, balance) => {
            return total + (parseFloat(balance.balance) || 0);
        }, 0);

        const totalUsdValue = wallet.balances.reduce((total, balance) => {
            return total + (parseFloat(balance.usd_value) || 0);
        }, 0);

        return (
            <div id={`wallet-${wallet.wallet_id}`} key={wallet.wallet_id} className="wallet-card">
                <div className="wallet-card-header">
                    <div className="wallet-info">
                        <h3>{wallet.name}</h3>
                        <span className="wallet-type custodial">
                            Custodial
                        </span>
                    </div>
                    <div className="wallet-status">
                        <span className={`status-indicator ${wallet.status.toLowerCase()}`}></span>
                        {wallet.status}
                    </div>
                </div>

                {/* Display addresses for different cryptocurrencies */}
                {wallet.addresses && wallet.addresses.length > 0 ? (
                    <div className="wallet-addresses">
                        {wallet.addresses.map(address => (
                            <div key={address.cryptocurrency} className="wallet-address-container">
                                <label>{address.cryptocurrency} Address:</label>
                                <div className="wallet-address">
                                    <code>{address.address}</code>
                                    <button
                                        className="copy-button"
                                        onClick={() => navigator.clipboard.writeText(address.address)}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="no-addresses-message">
                        No cryptocurrency addresses generated yet.
                    </div>
                )}

                {/* Display all cryptocurrency balances (including zero balances) */}
                <div className="wallet-balances">
                    <h4>Balances</h4>

                    {/* Search input */}
                    <div className="balance-search">
                        <input
                            type="text"
                            placeholder="Search cryptocurrencies..."
                            value={cryptoSearch}
                            onChange={(e) => setCryptoSearch(e.target.value)}
                            className="balance-search-input"
                        />
                    </div>

                    {/* Table with horizontal scrolling on small screens */}
                    <div className="crypto-balance-table">
                        <table className="balance-table">
                            <thead>
                                <tr>
                                    <th>Cryptocurrency</th>
                                    <th>Balance</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedBalances.length > 0 ? (
                                    paginatedBalances.map(balance => (
                                        <tr key={balance.cryptocurrency} className="balance-row">
                                            <td className="crypto-name-cell">
                                                <div className="crypto-icon-name">
                                                    {getCryptoIcon(balance.cryptocurrency, availableCryptocurrencies)}
                                                    <span className="crypto-name">
                                                        {getCryptoFullName(balance.cryptocurrency, availableCryptocurrencies)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="balance-amount">
                                                <div>
                                                    <div className="crypto-balance-value">
                                                        {parseFloat(balance.balance) > 0
                                                            ? formatCryptoValue(balance.balance, balance.cryptocurrency)
                                                            : "0.00000000"} {balance.cryptocurrency}
                                                    </div>
                                                    <div className="usd-value">
                                                        ≈ {formatUsdValue(balance.usd_value)} USD
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="balance-actions">
                                                <button className="action-btn deposit-btn">Deposit</button>
                                                <button
                                                    className="action-btn withdraw-btn"
                                                    disabled={parseFloat(balance.balance) <= 0}
                                                >
                                                    Withdraw
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="empty-balance-message">
                                            No cryptocurrencies match your search
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Generate address buttons */}
                <div className="generate-address-section">
                    <h4>Generate New Address</h4>
                    <div className="generate-buttons-container">
                        {isLoadingCryptocurrencies ? (
                            <div className="loading-spinner">Loading cryptocurrencies...</div>
                        ) : (
                            <div className="crypto-button-grid">
                                {availableCryptocurrencies.map(crypto => {
                                    // Check if address already exists for this crypto
                                    const addressExists = wallet.addresses &&
                                        wallet.addresses.some(a => a.cryptocurrency === crypto.symbol);

                                    return (
                                        <button
                                            key={crypto.symbol}
                                            className={`generate-button ${addressExists ? 'disabled' : ''}`}
                                            disabled={addressExists || isGeneratingAddress}
                                            onClick={() => generateAddress(wallet.wallet_id, crypto.symbol)}
                                        >
                                            {crypto.icon_url ? (
                                                <img
                                                    src={crypto.icon_url}
                                                    alt={crypto.symbol}
                                                    className="crypto-icon"
                                                />
                                            ) : (
                                                <span className="crypto-icon-placeholder">{crypto.symbol.charAt(0)}</span>
                                            )}
                                            <span className="crypto-button-text">
                                                {addressExists ? `${crypto.symbol} Exists` : `Generate ${crypto.symbol}`}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Display the address generation status */}
                    {addressGenerationStatus && isActiveWallet && (
                        <div className={`address-generation-status ${addressGenerationStatus.success ? 'success' : 'error'}`}>
                            <p>{addressGenerationStatus.message}</p>
                            {addressGenerationStatus.success && addressGenerationStatus.address && (
                                <div className="generated-address">
                                    {addressGenerationStatus.address}
                                    <button
                                        className="copy-address-btn"
                                        onClick={() => navigator.clipboard.writeText(addressGenerationStatus.address)}
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Pagination controls */}
                <div className="pagination-controls">
                    <button
                        className="pagination-button"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                    >
                        Previous
                    </button>
                    <span className="pagination-info">
                        Page {currentPage} of {totalPages || 1}
                    </span>
                    <button
                        className="pagination-button"
                        onClick={() => setCurrentPage(prev => prev < totalPages ? prev + 1 : prev)}
                        disabled={currentPage >= totalPages}
                    >
                        Next
                    </button>
                </div>

                {/* For the total balance at the top of the page (if applicable) */}
                <div className="total-crypto-balance">
                    <span className="balance-label">Total {crypto.symbol}:</span>
                    <span className="balance-value">
                        {formatCryptoValue(totalCryptoBalance, crypto.symbol)} {crypto.symbol}
                    </span>
                    <span className="usd-equivalent">
                        ≈ {formatUsdValue(totalUsdValue)} USD
                    </span>
                </div>
            </div>
        );
    };

    const getCryptoIcon = (symbol, cryptoList) => {
        const crypto = cryptoList.find(c => c.symbol === symbol);
        if (crypto && crypto.icon_url) {
            return <img src={crypto.icon_url} alt={symbol} className="crypto-icon" />;
        }
        return <span className="crypto-icon-placeholder">{symbol.charAt(0)}</span>;
    };

    const getCryptoFullName = (symbol, cryptoList) => {
        const crypto = cryptoList.find(c => c.symbol === symbol);
        if (crypto) {
            return `${symbol} - ${crypto.name}`;
        }
        return symbol;
    };

    if (isLoading) {
        return <div className="loading-container">Loading your assets...</div>;
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="logo">CryptoX</div>
                <div className="header-actions">
                    <div className="search-container">
                        <input type="text" placeholder="Search..." className="search-input" />
                        <RefreshIndicator
                            lastRefreshTime={lastRefreshTime}
                            isRefreshing={isRefreshing}
                        />
                    </div>

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
                        <li className="nav-item" onClick={() => navigate('/assets-overview')}>
                            <span className="nav-icon">💎</span>
                            <span className="nav-text">Assets</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/deposit')}>
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Deposit</span>
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
                    {showWalletCreation && !walletCreated && (
                        <div className="wallet-selection-container">
                            <h2>Create a Multi-Chain Custodial Wallet</h2>
                            <p className="wallet-intro">
                                Create a secure custodial wallet to manage multiple cryptocurrencies. We'll securely manage your private keys.
                            </p>

                            <div className="custodial-wallet-info">
                                <div className="custodial-icon">🔒</div>
                                <div className="custodial-details">
                                    <h3>Custodial Wallet Features</h3>
                                    <ul className="custodial-features">
                                        <li>One wallet for multiple cryptocurrencies (ETH, BTC)</li>
                                        <li>Generate blockchain-specific addresses as needed</li>
                                        <li>We securely manage your private keys for you</li>
                                        <li>Password recovery available</li>
                                        <li>Perfect for beginners and advanced users</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="wallet-name-input">
                                <label htmlFor="walletName">Wallet Name</label>
                                <input
                                    type="text"
                                    id="walletName"
                                    value={walletName}
                                    onChange={(e) => setWalletName(e.target.value)}
                                    placeholder="Enter a name for your wallet"
                                />
                            </div>

                            {walletCreationError && (
                                <div className="wallet-error-message">
                                    {walletCreationError}
                                </div>
                            )}

                            <div className="wallet-selection-actions">
                                <button
                                    className="wallet-button secondary"
                                    onClick={() => {
                                        setShowWalletCreation(false);
                                        setWalletCreationError('');
                                    }}
                                    disabled={isCreatingWallet}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="wallet-button primary"
                                    disabled={!walletName.trim() || isCreatingWallet}
                                    onClick={handleCreateWallet}
                                >
                                    {isCreatingWallet ? (
                                        <span className="loading-spinner">Creating...</span>
                                    ) : (
                                        "Create Custodial Wallet"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {walletCreated && walletData && (
                        <div className="wallet-confirmation">
                            <div className="success-icon">✓</div>
                            <h2>Multi-Chain Wallet Created Successfully!</h2>
                            <p>
                                Your custodial wallet is now ready to use. We'll securely manage your private keys.
                                You can now generate addresses for different cryptocurrencies.
                            </p>

                            <div className="wallet-details multi-chain">
                                <div className="wallet-detail">
                                    <span>Wallet ID:</span>
                                    <strong>{walletData.wallet_id}</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Name:</span>
                                    <strong>{walletData.name}</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Type:</span>
                                    <strong>Custodial</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Status:</span>
                                    <strong className="status-active">{walletData.status}</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Created:</span>
                                    <strong>{new Date(walletData.created_at).toLocaleString()}</strong>
                                </div>
                                <div className="wallet-detail full-width">
                                    <span>Supported Cryptocurrencies:</span>
                                    <strong>
                                        {isLoadingCryptocurrencies
                                            ? "Loading supported cryptocurrencies..."
                                            : availableCryptocurrencies.length > 0
                                                ? availableCryptocurrencies.map(c => c.symbol).join(", ")
                                                : "ETH, BTC (Default)"}
                                    </strong>
                                </div>
                            </div>

                            <div className="wallet-confirmation-actions">
                                <button
                                    className="wallet-button primary"
                                    onClick={async () => {
                                        try {
                                            // Refresh wallet data first
                                            const token = localStorage.getItem('auth_token');
                                            await fetch('http://localhost:8080/wallet/list', {
                                                method: 'GET',
                                                headers: {
                                                    'Authorization': `Bearer ${token}`,
                                                    'Content-Type': 'application/json',
                                                },
                                            }).then(response => {
                                                if (response.ok) {
                                                    return response.json();
                                                }
                                                throw new Error('Failed to refresh wallet data');
                                            }).then(data => {
                                                // Update user wallets with fresh data
                                                setUserWallets(data.wallets || []);
                                            });

                                            // Then update state to show wallet list
                                            setShowWalletCreation(false);
                                            setWalletCreated(false);
                                            setWalletData(null);

                                            // Scroll to top
                                            window.scrollTo({
                                                top: 0,
                                                behavior: 'smooth'
                                            });
                                        } catch (error) {
                                            console.error('Error refreshing wallet data:', error);
                                            setApiError('Failed to load wallet data. Please try again.');
                                        }
                                    }}
                                >
                                    View My Wallets
                                </button>
                                <button
                                    className="wallet-button secondary"
                                    onClick={() => {
                                        setWalletCreated(false);
                                        setWalletName('My Custodial Wallet');
                                    }}
                                >
                                    Create Another Wallet
                                </button>
                            </div>
                        </div>
                    )}

                    {!showWalletCreation && !walletCreated && renderWalletList()}

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

export default Assets;