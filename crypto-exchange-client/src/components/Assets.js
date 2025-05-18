import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Assets.css';

function Assets() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Add state for wallet creation
    const [showWalletCreation, setShowWalletCreation] = useState(true);
    const [selectedWalletType, setSelectedWalletType] = useState(null);
    const [walletCreated, setWalletCreated] = useState(false);

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

    // Add this function for the admin button
    const navigateToAdminPanel = () => {
        navigate('/admin');
    };

    // Function to handle wallet creation
    const handleCreateWallet = () => {
        if (selectedWalletType) {
            setWalletCreated(true);
            setShowWalletCreation(false);
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

                // First try to parse the token to get basic user info (fallback method)
                try {
                    // JWT tokens are in format: header.payload.signature
                    const tokenParts = token.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(atob(tokenParts[1])); // Decode base64
                        // Extract user info from token if available
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

                        // Check and set admin status
                        if (apiUserData && apiUserData.is_admin) {
                            setIsAdmin(true);
                        }
                    } else {
                        // Handle 401 specifically
                        if (userResponse.status === 401) {
                            localStorage.removeItem('auth_token');
                            navigate('/login');
                            return;
                        }
                    }
                } catch (userApiError) {
                    console.warn("API error when fetching user data:", userApiError);
                }

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
                            <p className="wallet-intro">Choose the type of wallet that best suits your needs.</p>

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
                                    className={`wallet-option ${selectedWalletType === 'non-custodial' ? 'selected' : ''}`}
                                    onClick={() => setSelectedWalletType('non-custodial')}
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

                            <div className="wallet-selection-actions">
                                <button
                                    className="wallet-button secondary"
                                    onClick={() => setShowWalletCreation(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="wallet-button primary"
                                    disabled={!selectedWalletType}
                                    onClick={handleCreateWallet}
                                >
                                    Create {selectedWalletType ? selectedWalletType.charAt(0).toUpperCase() + selectedWalletType.slice(1) : ''} Wallet
                                </button>
                            </div>
                        </div>
                    )}

                    {walletCreated && (
                        <div className="wallet-confirmation">
                            <div className="success-icon">✓</div>
                            <h2>Your {selectedWalletType.charAt(0).toUpperCase() + selectedWalletType.slice(1)} Wallet Has Been Created!</h2>
                            <p>
                                {selectedWalletType === 'custodial'
                                    ? 'Your wallet is now ready to use. We\'ll manage the security for you.'
                                    : 'Your wallet is now ready to use. Remember to securely store your private keys and seed phrase.'}
                            </p>
                            <div className="wallet-address">
                                <p className="wallet-address-label">Your wallet address:</p>
                                <code className="wallet-address-value">0x71C7656EC7ab88b098defB751B7401B5f6d8976F</code>
                            </div>
                            <button
                                className="wallet-button primary"
                                onClick={() => {
                                    setShowWalletCreation(false);
                                }}
                            >
                                Continue to Dashboard
                            </button>
                        </div>
                    )}

                    {!showWalletCreation && !walletCreated && (
                        <div className="no-wallet-message">
                            <h3>No Wallet Found</h3>
                            <p>You don't have a wallet yet. Create one to start managing your cryptocurrency assets.</p>
                            <button
                                className="wallet-button primary"
                                onClick={() => setShowWalletCreation(true)}
                            >
                                Create Wallet
                            </button>
                        </div>
                    )}

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