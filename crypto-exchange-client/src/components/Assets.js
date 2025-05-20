import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Assets.css';

function Assets() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Wallet creation state
    const [showWalletCreation, setShowWalletCreation] = useState(false);
    const [selectedWalletType, setSelectedWalletType] = useState(null);
    const [selectedNetwork, setSelectedNetwork] = useState(null);
    const [walletCreated, setWalletCreated] = useState(false);
    const [isCreatingWallet, setIsCreatingWallet] = useState(false);
    const [walletData, setWalletData] = useState(null);
    const [walletCreationError, setWalletCreationError] = useState('');
    
    // User wallets state
    const [userWallets, setUserWallets] = useState([]);
    const [isLoadingWallets, setIsLoadingWallets] = useState(true);

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

    // Function to handle wallet creation
    const handleCreateWallet = async () => {
        if (!selectedWalletType || !selectedNetwork) {
            setWalletCreationError('Please select both wallet type and network');
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
                    wallet_type: selectedWalletType.toUpperCase(),
                    network: selectedNetwork.toUpperCase(),
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
    
    // Function to fetch user wallets
    const fetchUserWallets = async (token) => {
        try {
            setIsLoadingWallets(true);
            
            const response = await fetch('http://localhost:8080/wallet/list', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            
            if (response.ok) {
                const data = await response.json();
                setUserWallets(data.wallets || []);
            } else {
                console.warn("Could not fetch wallets");
                setUserWallets([]);
            }
        } catch (error) {
            console.error('Error fetching wallets:', error);
            setUserWallets([]);
        } finally {
            setIsLoadingWallets(false);
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

            } catch (error) {
                console.error('Error in assets data fetching:', error);
                setApiError('Could not load your asset information. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
        return () => { };
    }, [navigate]);

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
                    <h3>Your Wallets</h3>
                    <button 
                        className="wallet-button primary" 
                        onClick={() => setShowWalletCreation(true)}
                    >
                        Create New Wallet
                    </button>
                </div>
                
                <div className="wallet-cards">
                    {userWallets.map((wallet) => (
                        <div key={wallet.wallet_id} className="wallet-card">
                            <div className="wallet-card-header">
                                <div className="wallet-info">
                                    <span className={`wallet-type ${wallet.wallet_type.toLowerCase()}`}>
                                        {wallet.wallet_type === "CUSTODIAL" ? "Custodial" : "Non-Custodial"}
                                    </span>
                                    <span className="wallet-network">{wallet.network}</span>
                                </div>
                                <div className="wallet-status">
                                    <span className={`status-indicator ${wallet.status.toLowerCase()}`}></span>
                                    {wallet.status}
                                </div>
                            </div>
                            
                            <div className="wallet-address-container">
                                <label>Wallet Address:</label>
                                <div className="wallet-address">
                                    <code>{wallet.address}</code>
                                    <button 
                                        className="copy-button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(wallet.address);
                                            // You could add a copied notification here
                                        }}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            
                            <div className="wallet-actions">
                                <button className="wallet-action-button">Deposit</button>
                                <button className="wallet-action-button">Withdraw</button>
                                <button className="wallet-action-button">View Transactions</button>
                            </div>
                            
                            <div className="wallet-created">
                                Created: {new Date(wallet.created_at).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
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
                        <li className="nav-item active">
                            <span className="nav-icon">💎</span>
                            <span className="nav-text">Assets</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Trade</span>
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
                            <h2>Create a New Wallet</h2>
                            <p className="wallet-intro">Configure your new cryptocurrency wallet below.</p>

                            <div className="wallet-options">
                                <div
                                    className={`wallet-option ${selectedWalletType === 'custodial' ? 'selected' : ''}`}
                                    onClick={() => setSelectedWalletType('custodial')}
                                >
                                    <div className="wallet-icon custodial-icon">🔒</div>
                                    <h3>Custodial Wallet</h3>
                                    <p>We securely manage your private keys for you.</p>
                                    <ul>
                                        <li>Password recovery available</li>
                                        <li>No need to worry about lost keys</li>
                                        <li>Perfect for beginners</li>
                                        <li>CryptoX manages security</li>
                                    </ul>
                                </div>

                                <div
                                    className={`wallet-option ${selectedWalletType === 'non_custodial' ? 'selected' : ''}`}
                                    onClick={() => setSelectedWalletType('non_custodial')}
                                >
                                    <div className="wallet-icon non-custodial-icon">🔐</div>
                                    <h3>Non-Custodial Wallet</h3>
                                    <p>You maintain full control of your private keys.</p>
                                    <ul>
                                        <li>Complete ownership of your assets</li>
                                        <li>Enhanced security against third parties</li>
                                        <li>Ideal for experienced users</li>
                                        <li>You are responsible for key security</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div className="network-selection">
                                <h3>Select Network</h3>
                                <div className="network-options">
                                    <div 
                                        className={`network-option ${selectedNetwork === 'ethereum' ? 'selected' : ''}`}
                                        onClick={() => setSelectedNetwork('ethereum')}
                                    >
                                        <div className="network-icon">Ξ</div>
                                        <div className="network-details">
                                            <h4>Ethereum Mainnet</h4>
                                            <p>The primary Ethereum blockchain network</p>
                                        </div>
                                    </div>
                                    
                                    <div 
                                        className={`network-option ${selectedNetwork === 'ethereum_testnet' ? 'selected' : ''}`}
                                        onClick={() => setSelectedNetwork('ethereum_testnet')}
                                    >
                                        <div className="network-icon">Ξ-T</div>
                                        <div className="network-details">
                                            <h4>Ethereum Testnet</h4>
                                            <p>For testing with no real value transactions</p>
                                        </div>
                                    </div>
                                </div>
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
                                    disabled={!selectedWalletType || !selectedNetwork || isCreatingWallet}
                                    onClick={handleCreateWallet}
                                >
                                    {isCreatingWallet ? (
                                        <span className="loading-spinner">Creating...</span>
                                    ) : (
                                        `Create ${selectedWalletType ? 
                                            (selectedWalletType === 'custodial' ? 'Custodial' : 'Non-Custodial') : ''} Wallet`
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {walletCreated && walletData && (
                        <div className="wallet-confirmation">
                            <div className="success-icon">✓</div>
                            <h2>Your Wallet Has Been Created!</h2>
                            <p>
                                {selectedWalletType === 'custodial'
                                    ? 'Your wallet is now ready to use. We\'ll manage the security for you.'
                                    : 'Your wallet is now ready to use. Remember to securely store your private keys and seed phrase.'}
                            </p>
                            <div className="wallet-address-box">
                                <p className="wallet-address-label">Your wallet address:</p>
                                <div className="wallet-address-value-container">
                                    <code className="wallet-address-value">{walletData.address}</code>
                                    <button 
                                        className="copy-address-button"
                                        onClick={() => navigator.clipboard.writeText(walletData.address)}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <div className="wallet-details">
                                <div className="wallet-detail">
                                    <span>Type:</span>
                                    <strong>{walletData.wallet_type}</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Network:</span>
                                    <strong>{walletData.network}</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Status:</span>
                                    <strong className="status-active">{walletData.status}</strong>
                                </div>
                                <div className="wallet-detail">
                                    <span>Created:</span>
                                    <strong>{new Date(walletData.created_at).toLocaleString()}</strong>
                                </div>
                            </div>
                            
                            <div className="wallet-confirmation-actions">
                                <button
                                    className="wallet-button primary"
                                    onClick={() => {
                                        setShowWalletCreation(false);
                                        setWalletCreated(false);
                                    }}
                                >
                                    View My Wallets
                                </button>
                                <button
                                    className="wallet-button secondary"
                                    onClick={() => {
                                        setWalletCreated(false);
                                        setSelectedWalletType(null);
                                        setSelectedNetwork(null);
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