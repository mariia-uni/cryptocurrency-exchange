import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Deposit.css';
import SearchBox from './SearchBox/SearchBox';

function Deposit() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [apiError, setApiError] = useState('');

    // Deposit state
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [availableCryptocurrencies, setAvailableCryptocurrencies] = useState([]);
    const [selectedCrypto, setSelectedCrypto] = useState('');
    const [blockchains, setBlockchains] = useState([]);
    const [selectedBlockchain, setSelectedBlockchain] = useState('');
    const [walletAddresses, setWalletAddresses] = useState([]);
    const [selectedAddress, setSelectedAddress] = useState('');
    const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
    const [depositAmount, setDepositAmount] = useState('100');
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const [depositStatus, setDepositStatus] = useState(null);
    const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);
    const [cryptoSearchQuery, setCryptoSearchQuery] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);

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

    // Function to handle admin panel navigation
    const navigateToAdminPanel = () => {
        navigate('/admin');
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

                // Fetch wallets
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
                        if (data.wallets.length > 0) {
                            setSelectedWallet(data.wallets[0]);
                        } else {
                            // IMMEDIATE REDIRECTION: No delay, direct navigation
                            console.log('No wallets found - redirecting immediately to wallet creation');
                            navigate('/assets');
                            return; // Exit early to prevent further rendering
                        }
                    }
                } else {
                    console.error('Failed to fetch wallets');
                    setApiError('Failed to load wallets. Please try again later.');
                }

                // Fetch available cryptocurrencies
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
                        if (data.cryptocurrencies.length > 0) {
                            setSelectedCrypto(data.cryptocurrencies[0].symbol);
                        }
                    }
                }

                setIsLoading(false);
            } catch (error) {
                console.error('Error in deposit data fetching:', error);
                setApiError('Could not load deposit information. Please try again later.');
                setIsLoading(false);
            }
        };

        fetchData();
    }, [navigate]);

    // Effect to fetch blockchains when crypto is selected
    useEffect(() => {
        if (selectedCrypto) {
            // This is a mock function - in a real app, you'd fetch from your API
            const getBlockchains = (crypto) => {
                switch (crypto) {
                    case 'BTC':
                        return [
                            { id: 'btc-mainnet', name: 'Bitcoin Mainnet', fee: '0.0005 BTC' }
                        ];
                    case 'ETH':
                        return [
                            { id: 'eth-mainnet', name: 'Ethereum Mainnet', fee: '0.005 ETH' },
                            { id: 'arbitrum', name: 'Arbitrum One', fee: '0.0001 ETH' },
                            { id: 'optimism', name: 'Optimism', fee: '0.0001 ETH' }
                        ];
                    case 'USDT':
                        return [
                            { id: 'eth-usdt', name: 'Ethereum (ERC-20)', fee: '15 USDT' },
                            { id: 'tron-usdt', name: 'TRON (TRC-20)', fee: '1 USDT' },
                            { id: 'bsc-usdt', name: 'BNB Smart Chain (BEP-20)', fee: '0.5 USDT' }
                        ];
                    default:
                        return [
                            { id: `${crypto.toLowerCase()}-mainnet`, name: `${crypto} Mainnet`, fee: '0.001 ' + crypto }
                        ];
                }
            };

            const blockchainOptions = getBlockchains(selectedCrypto);
            setBlockchains(blockchainOptions);
            if (blockchainOptions.length > 0) {
                setSelectedBlockchain(blockchainOptions[0].id);
            }
        }
    }, [selectedCrypto]);

    // Effect to fetch addresses when wallet and crypto are selected
    useEffect(() => {
        if (selectedWallet && selectedCrypto) {
            // Find addresses for the selected cryptocurrency
            const addresses = selectedWallet.addresses
                ? selectedWallet.addresses.filter(addr => addr.cryptocurrency === selectedCrypto)
                : [];

            setWalletAddresses(addresses);
            if (addresses.length > 0) {
                setSelectedAddress(addresses[0].address);
            } else {
                setSelectedAddress('');
            }
        }
    }, [selectedWallet, selectedCrypto]);

    // Move this useEffect inside the component, before filteredCryptocurrencies
    useEffect(() => {
        const handleClickOutside = (event) => {
            const dropdownContainer = document.querySelector('.crypto-dropdown-container');
            if (dropdownContainer && !dropdownContainer.contains(event.target)) {
                setDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Function to generate a cryptocurrency address
    const generateAddress = async () => {
        if (!selectedWallet || !selectedCrypto) return;

        setIsGeneratingAddress(true);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/wallet/address/generate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet_id: selectedWallet.wallet_id,
                    cryptocurrency: selectedCrypto
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.address) {
                    // Refresh wallet to get updated addresses
                    const walletsResponse = await fetch('http://localhost:8080/wallet/list', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (walletsResponse.ok) {
                        const walletsData = await walletsResponse.json();
                        if (walletsData.wallets && Array.isArray(walletsData.wallets)) {
                            setWallets(walletsData.wallets);
                            // Find and update the selected wallet
                            const updatedWallet = walletsData.wallets.find(
                                w => w.wallet_id === selectedWallet.wallet_id
                            );
                            if (updatedWallet) {
                                setSelectedWallet(updatedWallet);
                                // Find addresses for the selected cryptocurrency
                                const addresses = updatedWallet.addresses
                                    ? updatedWallet.addresses.filter(addr => addr.cryptocurrency === selectedCrypto)
                                    : [];

                                setWalletAddresses(addresses);
                                if (addresses.length > 0) {
                                    setSelectedAddress(addresses[0].address);
                                }
                            }
                        }
                    }
                }
            } else {
                const errorData = await response.json();
                setApiError(errorData.error || 'Failed to generate address');
            }
        } catch (error) {
            console.error('Error generating address:', error);
            setApiError('Network error. Please try again.');
        } finally {
            setIsGeneratingAddress(false);
        }
    };

    // Function to process a deposit
    const processDeposit = async () => {
        if (!selectedWallet || !selectedCrypto || !selectedAddress || !hasConfirmed) {
            return;
        }

        setIsProcessingDeposit(true);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/deposit/process', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet_id: selectedWallet.wallet_id,
                    cryptocurrency: selectedCrypto,
                    blockchain: selectedBlockchain,
                    address: selectedAddress,
                    amount: depositAmount,
                    confirmation_token: "confirmed_by_user" // This would be more secure in a real app
                })
            });

            const data = await response.json();

            if (response.ok) {
                setDepositStatus({
                    success: true,
                    message: data.message,
                    transaction_id: data.transaction_id,
                    new_balance: data.new_balance
                });

                // Refresh wallet data after successful deposit
                const walletsResponse = await fetch('http://localhost:8080/wallet/list', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (walletsResponse.ok) {
                    const walletsData = await walletsResponse.json();
                    if (walletsData.wallets && Array.isArray(walletsData.wallets)) {
                        setWallets(walletsData.wallets);
                    }
                }
            } else {
                setDepositStatus({
                    success: false,
                    message: data.error || 'Failed to process deposit'
                });
            }
        } catch (error) {
            console.error('Error processing deposit:', error);
            setDepositStatus({
                success: false,
                message: 'Network error. Please try again.'
            });
        } finally {
            setIsProcessingDeposit(false);
        }
    };

    // Reset deposit form
    const resetDepositForm = () => {
        setDepositStatus(null);
        setHasConfirmed(false);
    };

    const filteredCryptocurrencies = availableCryptocurrencies.filter(crypto =>
        crypto.name.toLowerCase().includes(cryptoSearchQuery.toLowerCase()) ||
        crypto.symbol.toLowerCase().includes(cryptoSearchQuery.toLowerCase())
    );

    if (isLoading) {
        return <div className="loading-container">Loading deposit options...</div>;
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
                        <li className="nav-item" onClick={() => navigate('/futures')}>
                            <span className="nav-icon">📈</span>
                            <span className="nav-text">Futures</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/assets-overview')}>
                            <span className="nav-icon">💎</span>
                            <span className="nav-text">Assets</span>
                        </li>
                        <li className="nav-item active">
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
                    <div className="deposit-container">
                        <h2>Deposit Funds</h2>

                        {depositStatus ? (
                            <div className={`deposit-result ${depositStatus.success ? 'success' : 'error'}`}>
                                <div className="deposit-result-icon">
                                    {depositStatus.success ? '✓' : '✗'}
                                </div>
                                <h3>{depositStatus.success ? 'Deposit Successful!' : 'Deposit Failed'}</h3>
                                <p>{depositStatus.message}</p>

                                {depositStatus.success && (
                                    <div className="deposit-details">
                                        <div className="deposit-detail">
                                            <span>Transaction ID:</span>
                                            <strong>{depositStatus.transaction_id}</strong>
                                        </div>
                                        <div className="deposit-detail">
                                            <span>New Balance:</span>
                                            <strong>{depositStatus.new_balance} {selectedCrypto}</strong>
                                        </div>
                                    </div>
                                )}

                                <div className="deposit-actions">
                                    <button
                                        className="deposit-button primary"
                                        onClick={() => navigate('/assets-overview')}
                                    >
                                        View My Wallets
                                    </button>
                                    <button
                                        className="deposit-button secondary"
                                        onClick={resetDepositForm}
                                    >
                                        Make Another Deposit
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="deposit-form">
                                {wallets.length === 0 ? (
                                    <div className="no-wallets-message">
                                        <p>You don't have any wallets yet. Create a wallet first to make a deposit.</p>
                                        <button
                                            className="deposit-button primary"
                                            onClick={() => navigate('/assets')}
                                        >
                                            Create Wallet
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="form-section">
                                            <h3>1. Select Wallet</h3>
                                            <div className="wallet-selector">
                                                <select
                                                    value={selectedWallet?.wallet_id || ''}
                                                    onChange={(e) => {
                                                        const wallet = wallets.find(w => w.wallet_id.toString() === e.target.value);
                                                        setSelectedWallet(wallet);
                                                    }}
                                                >
                                                    {wallets.map(wallet => (
                                                        <option key={wallet.wallet_id} value={wallet.wallet_id}>
                                                            {wallet.name} (ID: {wallet.wallet_id})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-section">
                                            <h3>2. Select Cryptocurrency</h3>
                                            <div className="crypto-dropdown-container">
                                                <div className="crypto-search">
                                                    <input
                                                        type="text"
                                                        placeholder="Search cryptocurrency..."
                                                        value={cryptoSearchQuery}
                                                        onChange={(e) => setCryptoSearchQuery(e.target.value)}
                                                        onClick={() => setDropdownOpen(true)}
                                                        className="crypto-search-input"
                                                    />
                                                </div>

                                                <div className="crypto-dropdown-selected" onClick={() => setDropdownOpen(!dropdownOpen)}>
                                                    {selectedCrypto ? (
                                                        <>
                                                            <div className="selected-crypto-info">
                                                                <div className="crypto-icon">
                                                                    {availableCryptocurrencies.find(c => c.symbol === selectedCrypto)?.icon_url ? (
                                                                        <img
                                                                            src={availableCryptocurrencies.find(c => c.symbol === selectedCrypto)?.icon_url}
                                                                            alt={selectedCrypto}
                                                                        />
                                                                    ) : (
                                                                        <span>{selectedCrypto.charAt(0)}</span>
                                                                    )}
                                                                </div>
                                                                <div className="crypto-details">
                                                                    <div className="crypto-symbol">{selectedCrypto}</div>
                                                                    <div className="crypto-name">
                                                                        {availableCryptocurrencies.find(c => c.symbol === selectedCrypto)?.name || ''}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="dropdown-arrow">▼</div>
                                                        </>
                                                    ) : (
                                                        <div className="no-selection">Select a cryptocurrency</div>
                                                    )}
                                                </div>

                                                {dropdownOpen && (
                                                    <div className="crypto-dropdown-options">
                                                        {filteredCryptocurrencies.length > 0 ? (
                                                            filteredCryptocurrencies.map(crypto => (
                                                                <div
                                                                    key={crypto.symbol}
                                                                    className={`crypto-option ${selectedCrypto === crypto.symbol ? 'selected' : ''}`}
                                                                    onClick={() => {
                                                                        setSelectedCrypto(crypto.symbol);
                                                                        setDropdownOpen(false);
                                                                        setCryptoSearchQuery('');
                                                                    }}
                                                                >
                                                                    <div className="crypto-icon">
                                                                        {crypto.icon_url ? (
                                                                            <img src={crypto.icon_url} alt={crypto.name} />
                                                                        ) : (
                                                                            <span>{crypto.symbol.charAt(0)}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="crypto-info">
                                                                        <div className="crypto-symbol">{crypto.symbol}</div>
                                                                        <div className="crypto-name">{crypto.name}</div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="no-results">No cryptocurrencies found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="form-section">
                                            <h3>3. Select Network</h3>
                                            <div className="blockchain-selector">
                                                {blockchains.map(blockchain => (
                                                    <div
                                                        key={blockchain.id}
                                                        className={`blockchain-option ${selectedBlockchain === blockchain.id ? 'selected' : ''}`}
                                                        onClick={() => setSelectedBlockchain(blockchain.id)}
                                                    >
                                                        <div className="blockchain-info">
                                                            <div className="blockchain-name">{blockchain.name}</div>
                                                            <div className="blockchain-fee">Network Fee: {blockchain.fee}</div>
                                                        </div>
                                                        {selectedBlockchain === blockchain.id && (
                                                            <div className="blockchain-selected-icon">✓</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-section">
                                            <h3>4. Deposit Address</h3>
                                            {walletAddresses.length > 0 ? (
                                                <div className="address-selector">
                                                    <select
                                                        value={selectedAddress}
                                                        onChange={(e) => setSelectedAddress(e.target.value)}
                                                    >
                                                        {walletAddresses.map(addr => (
                                                            <option key={addr.address} value={addr.address}>
                                                                {addr.address}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <div className="address-display">
                                                        <div className="address-label">Deposit Address:</div>
                                                        <div className="address-value">
                                                            <span className="address-text">{selectedAddress}</span>
                                                            <button
                                                                className="copy-button"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(selectedAddress);
                                                                    alert('Address copied to clipboard!');
                                                                }}
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="no-address-message">
                                                    <p>No address found for {selectedCrypto}. Generate one to continue.</p>
                                                    <button
                                                        className="generate-address-button"
                                                        onClick={generateAddress}
                                                        disabled={isGeneratingAddress}
                                                    >
                                                        {isGeneratingAddress ? 'Generating...' : `Generate ${selectedCrypto} Address`}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {selectedAddress && (
                                            <>
                                                <div className="form-section">
                                                    <h3>5. Deposit Amount</h3>
                                                    <div className="deposit-amount-input">
                                                        <input
                                                            type="text"
                                                            value={depositAmount}
                                                            onChange={(e) => setDepositAmount(e.target.value)}
                                                            placeholder={`Enter amount in ${selectedCrypto}`}
                                                        />
                                                        <span className="currency-suffix">{selectedCrypto}</span>
                                                    </div>
                                                </div>

                                                <div className="deposit-notice">
                                                    <div className="notice-icon">ℹ️</div>
                                                    <div className="notice-content">
                                                        <p className="notice-title">Important Information</p>
                                                        <p>In a real cryptocurrency exchange, you would use this address to transfer funds from your external wallet (e.g., Trust Wallet, Metamask) to your account.</p>
                                                        <p>For this demo, we'll simulate a deposit of {depositAmount} {selectedCrypto} to your account.</p>
                                                    </div>
                                                </div>

                                                <div className="deposit-confirmation">
                                                    <label className="confirmation-checkbox">
                                                        <input
                                                            type="checkbox"
                                                            checked={hasConfirmed}
                                                            onChange={(e) => setHasConfirmed(e.target.checked)}
                                                        />
                                                        <span>I understand that this is a simulated deposit and confirm I want to add {depositAmount} {selectedCrypto} to my account</span>
                                                    </label>
                                                </div>

                                                <div className="deposit-form-actions">
                                                    <button
                                                        className="deposit-button primary"
                                                        disabled={!hasConfirmed || isProcessingDeposit}
                                                        onClick={processDeposit}
                                                    >
                                                        {isProcessingDeposit ? 'Processing...' : `Deposit ${depositAmount} ${selectedCrypto}`}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
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

export default Deposit;