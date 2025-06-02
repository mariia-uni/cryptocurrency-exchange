import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Futures.css';
import SearchBox from './SearchBox/SearchBox';

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

    // Get available USDT balance for selected wallet
    const getAvailableBalance = (walletId) => {
        const wallet = wallets.find(w => w.wallet_id.toString() === walletId);
        if (!wallet) return 0;

        const balance = wallet.balances.find(b => b.cryptocurrency === 'USDT');
        return balance ? parseFloat(balance.balance) : 0;
    };

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
                // Add to destination wallet
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

        return () => { };
    }, [navigate]);

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
                        <div className="futures-header">
                            <h2>Futures Trading</h2>
                            <div className="futures-actions">
                                <button
                                    className="transfer-button"
                                    onClick={() => setShowTransferModal(true)}
                                >
                                    <span className="transfer-icon">💲</span>
                                    Transfer USDT
                                </button>
                            </div>
                        </div>

                        <div className="futures-content">
                            <div className="placeholder-message">
                                <div className="coming-soon-icon">🚧</div>
                                <h3>Coming Soon</h3>
                                <p>Our futures trading platform is currently under development.</p>
                                <p>Check back later for leveraged trading with perpetual contracts.</p>
                                <p>Use the Transfer button above to move USDT between your wallets fee-free.</p>
                            </div>
                        </div>
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