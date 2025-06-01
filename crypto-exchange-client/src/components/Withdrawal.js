import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Withdrawal.css';
import SearchBox from './SearchBox/SearchBox';

function Withdrawal() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [selectedCrypto, setSelectedCrypto] = useState('BTC');
    const [withdrawalAmount, setWithdrawalAmount] = useState('');
    const [address, setAddress] = useState('');
    const [chain, setChain] = useState('BTC');
    const [withdrawalType, setWithdrawalType] = useState('on-chain');
    const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
    const [balance, setBalance] = useState(0);
    const [fee, setFee] = useState(0.000113);

    // New state for available cryptocurrencies with withdrawal info
    const [availableCryptocurrencies, setAvailableCryptocurrencies] = useState([]);
    const [availableNetworks, setAvailableNetworks] = useState([]);
    const [cryptoSearchQuery, setCryptoSearchQuery] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Add these state variables near the other useState declarations
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedRecipient, setSelectedRecipient] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);

    // Add this line with your other useState declarations
    const [transactionHistory, setTransactionHistory] = useState([]);

    // Add this to the state variables in Withdrawal.js
    const [addressBook, setAddressBook] = useState([]);
    const [showAddressBook, setShowAddressBook] = useState(false);
    const [addressBookSearchQuery, setAddressBookSearchQuery] = useState('');
    const [editingAddress, setEditingAddress] = useState(null);
    const [showAddAddressModal, setShowAddAddressModal] = useState(false);

    // Add this with your other useState declarations (around line 36)
    const [newAddressData, setNewAddressData] = useState(null);

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
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('auth_token');
                if (!token) {
                    navigate('/login');
                    return;
                }

                // Parse token for basic info
                try {
                    const tokenParts = token.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(atob(tokenParts[1]));
                        const fallbackUserData = {
                            email: payload.email || payload.sub || "User",
                            user_id: payload.user_id || payload.sub,
                        };
                        setUserData(fallbackUserData);
                    }
                } catch (tokenError) {
                    console.warn("Could not parse token for fallback user data:", tokenError);
                }

                // Fetch user profile
                const userResponse = await fetch('http://localhost:8080/user/profile', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (userResponse.ok) {
                    const userDataResponse = await userResponse.json();
                    setUserData(userDataResponse.user || userDataResponse);
                } else {
                    const errorData = await userResponse.json();
                    setApiError(errorData.error || 'Failed to fetch user data');
                    if (userResponse.status === 401) {
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                    }
                }

                // Fetch wallets
                const walletsResponse = await fetch('http://localhost:8080/wallet/list', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (walletsResponse.ok) {
                    const walletsData = await walletsResponse.json();
                    setWallets(walletsData.wallets || []);
                    if (walletsData.wallets && walletsData.wallets.length > 0) {
                        setSelectedWallet(walletsData.wallets[0]);

                        // Find BTC balance if available
                        const btcBalance = walletsData.wallets[0].balances.find(
                            b => b.cryptocurrency === 'BTC'
                        );
                        if (btcBalance) {
                            setBalance(parseFloat(btcBalance.balance));
                        }
                    }
                }

                // NEW: Fetch withdrawable cryptocurrencies with withdrawal-specific info
                const cryptoResponse = await fetch('http://localhost:8080/api/withdrawal/cryptocurrencies', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (cryptoResponse.ok) {
                    const cryptoData = await cryptoResponse.json();
                    if (cryptoData.withdrawable_cryptocurrencies &&
                        Array.isArray(cryptoData.withdrawable_cryptocurrencies)) {
                        setAvailableCryptocurrencies(cryptoData.withdrawable_cryptocurrencies);
                    }
                }

            } catch (error) {
                console.error('Error fetching data:', error);
                setApiError('Server connection error. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
    }, [navigate, selectedCrypto]);

    // Effect to fetch blockchains when crypto is selected
    useEffect(() => {
        if (selectedCrypto) {
            // This is a mock function - in a real app, you'd fetch from your API
            const getBlockchains = (crypto) => {
                switch (crypto) {
                    case 'BTC':
                        return [
                            { id: 'btc-mainnet', name: 'Bitcoin Mainnet', fee: '0.000113 BTC', min_withdrawal: '0.00027 BTC' }
                        ];
                    case 'ETH':
                        return [
                            { id: 'eth-mainnet', name: 'Ethereum Mainnet', fee: '0.003 ETH', min_withdrawal: '0.01 ETH' },
                            { id: 'arbitrum', name: 'Arbitrum One', fee: '0.0001 ETH', min_withdrawal: '0.005 ETH' },
                            { id: 'optimism', name: 'Optimism', fee: '0.0001 ETH', min_withdrawal: '0.005 ETH' }
                        ];
                    case 'USDT':
                        return [
                            { id: 'eth-usdt', name: 'Ethereum (ERC-20)', fee: '2.0 USDT', min_withdrawal: '20 USDT' },
                            { id: 'tron-usdt', name: 'TRON (TRC-20)', fee: '1.0 USDT', min_withdrawal: '10 USDT' },
                            { id: 'bsc-usdt', name: 'BNB Smart Chain (BEP-20)', fee: '0.5 USDT', min_withdrawal: '10 USDT' }
                        ];
                    default:
                        return [
                            { id: `${crypto.toLowerCase()}-mainnet`, name: `${crypto} Mainnet`, fee: `0.001 ${crypto}`, min_withdrawal: `0.01 ${crypto}` }
                        ];
                }
            };

            const blockchains = getBlockchains(selectedCrypto);
            setAvailableNetworks(blockchains.map(blockchain => ({
                network: blockchain.name,
                fee: blockchain.fee.split(' ')[0] // Extract just the number
                , min_withdrawal: blockchain.min_withdrawal.split(' ')[0], // Extract just the number
                is_active: true
            })));

            if (blockchains.length > 0) {
                setChain(blockchains[0].name);
                setFee(parseFloat(blockchains[0].fee.split(' ')[0])); // Set the fee for the first blockchain
            }
        }
    }, [selectedCrypto]);

    const handleWalletChange = (wallet) => {
        setSelectedWallet(wallet);
        const cryptoBalance = wallet.balances.find(b => b.cryptocurrency === selectedCrypto);
        if (cryptoBalance) {
            setBalance(parseFloat(cryptoBalance.balance));
        } else {
            setBalance(0);
        }
    };

    // Update the handleCryptoChange function
    const handleCryptoChange = async (crypto) => {
        setSelectedCrypto(crypto);

        // Update balance for the selected crypto
        if (selectedWallet) {
            const cryptoBalance = selectedWallet.balances.find(
                b => b.cryptocurrency === crypto
            );
            if (cryptoBalance) {
                setBalance(parseFloat(cryptoBalance.balance));
            } else {
                setBalance(0);
            }
        }

        // No need to call fetchNetworksForCrypto as the useEffect will handle it
        // The networks will be updated automatically when selectedCrypto changes
    };

    const handleWithdrawalTypeChange = (type) => {
        setWithdrawalType(type);

        // Clear address field when switching types
        setAddress('');

        // Reset selected network for internal transfers
        if (type === 'internal') {
            // For internal transfers, no blockchain network is needed
            setChain('');
            setFee(0); // No fee for internal transfers
        } else {
            // For on-chain transfers, reset to the first available network
            if (availableNetworks.length > 0) {
                setChain(availableNetworks[0].network);
                setFee(parseFloat(availableNetworks[0].fee));
            }
        }
    };

    const handleMaxAmount = () => {
        // Set maximum amount (balance - fee)
        const maxAmount = Math.max(0, balance - fee);
        setWithdrawalAmount(maxAmount.toString());
    };

    const handleSubmit = async () => {
        setApiError('');
        setAddressError('');

        // Validate amount
        if (!withdrawalAmount || isNaN(parseFloat(withdrawalAmount)) || parseFloat(withdrawalAmount) <= 0) {
            setApiError('Please enter a valid withdrawal amount');
            return;
        }

        // Validate balance
        if (parseFloat(withdrawalAmount) > balance) {
            setApiError('Insufficient balance');
            return;
        }

        // Validate address - now with our new function
        if (withdrawalType === 'on-chain') {
            const validation = validateRecipientAddress(address, selectedCrypto);
            if (!validation.isValid) {
                setAddressError(validation.errorMessage);
                return;
            }

            // Show warning to user if present
            if (validation.warning) {
                // Set as non-blocking warning that user can see
                setAddressError(validation.warning); // This won't block submission now
            }
        } else {
            // For internal transfers, just check that we have a recipient
            if (!address || address.trim() === '') {
                setAddressError('Please enter a recipient');
                return;
            }
        }

        // Check minimum withdrawal amount
        const minWithdrawalAmount = getMinWithdrawalAmount();
        if (parseFloat(withdrawalAmount) < minWithdrawalAmount) {
            setApiError(`Minimum ${withdrawalType === 'internal' ? 'transfer' : 'withdrawal'} amount is ${minWithdrawalAmount} ${selectedCrypto}`);
            return;
        }

        // If we passed all validations, show confirmation modal
        setIsConfirmationVisible(true);
    };

    // Update the confirmWithdrawal function
    const confirmWithdrawal = async () => {
        try {
            // Re-validate the address as a safety measure
            if (withdrawalType === 'on-chain') {
                const validation = validateRecipientAddress(address, selectedCrypto);
                if (!validation.isValid) {
                    setApiError(validation.errorMessage);
                    setIsConfirmationVisible(false);
                    return;
                }
            }

            const token = localStorage.getItem('auth_token');

            if (withdrawalType === 'internal') {
                // Internal transfer endpoint
                const response = await fetch('http://localhost:8080/transfer/internal', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        wallet_id: selectedWallet.wallet_id,
                        cryptocurrency: selectedCrypto,
                        amount: withdrawalAmount,
                        recipient_id: selectedRecipient?.id || null,
                        recipient_username: selectedRecipient?.username || null,
                        recipient_email: selectedRecipient?.email || address
                    }),
                });

                const data = await response.json();

                if (response.ok) {
                    // Reset form and show success
                    setWithdrawalAmount('');
                    setAddress('');
                    setSelectedRecipient(null);
                    setSearchQuery('');
                    setIsConfirmationVisible(false);

                    // Show success message
                    alert("Internal transfer completed successfully!");

                    // Refresh balance and history
                    refreshUserData();
                } else {
                    setApiError(data.error || 'Failed to complete internal transfer');
                    setIsConfirmationVisible(false);
                }
            } else {
                // Original on-chain withdrawal code...
                // Get the network information for the selected chain
                const networkInfo = availableNetworks.find(n => n.network === chain);
                const networkFee = networkInfo ? parseFloat(networkInfo.fee) : fee;

                const response = await fetch('http://localhost:8080/withdrawal/submit', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        wallet_id: selectedWallet.wallet_id,
                        cryptocurrency: selectedCrypto,
                        amount: withdrawalAmount,
                        address: address,
                        blockchain: chain,
                        withdrawal_type: withdrawalType,
                        fee: networkFee.toString()
                    }),
                });

                if (response.ok) {
                    // After successful on-chain withdrawal, offer to save the address
                    if (withdrawalType === 'on-chain') {
                        setTimeout(() => {
                            saveAddressAfterTransaction(address, selectedCrypto);
                        }, 500);
                    }

                    await response.json();
                    setWithdrawalAmount('');
                    setAddress('');
                    setIsConfirmationVisible(false);
                    alert("Withdrawal request submitted successfully!");
                    refreshUserData();
                } else {
                    const errorData = await response.json();
                    setApiError(errorData.error || 'Failed to process withdrawal');
                    setIsConfirmationVisible(false);
                }
            }
        } catch (error) {
            console.error('Error processing transaction:', error);
            setApiError('Server connection error. Please try again later.');
            setIsConfirmationVisible(false);
        }
    };

    // Add this function to refresh user data after a transaction
    const refreshUserData = async () => {
        // Re-fetch wallet data and withdrawal history
        try {
            const token = localStorage.getItem('auth_token');

            // Fetch updated wallet data
            const walletsResponse = await fetch('http://localhost:8080/wallet/list', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (walletsResponse.ok) {
                const walletsData = await walletsResponse.json();
                setWallets(walletsData.wallets || []);

                // Update selected wallet with fresh data
                if (selectedWallet && walletsData.wallets) {
                    const updatedWallet = walletsData.wallets.find(
                        w => w.wallet_id === selectedWallet.wallet_id
                    );
                    if (updatedWallet) {
                        setSelectedWallet(updatedWallet);
                        // Update balance for current cryptocurrency
                        const cryptoBalance = updatedWallet.balances.find(
                            b => b.cryptocurrency === selectedCrypto
                        );
                        if (cryptoBalance) {
                            setBalance(parseFloat(cryptoBalance.balance));
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error refreshing data:', error);
        }
    };

    const cancelWithdrawal = () => {
        setIsConfirmationVisible(false);
    };

    // Render wallet selector if there are multiple wallets
    const renderWalletSelector = () => {
        if (wallets.length <= 1) return null;

        return (
            <div className="form-group">
                <label>Select Wallet</label>
                <select
                    value={selectedWallet?.wallet_id || ''}
                    onChange={(e) => {
                        const wallet = wallets.find(w => w.wallet_id === parseInt(e.target.value));
                        if (wallet) handleWalletChange(wallet);
                    }}
                    className="form-select"
                >
                    {wallets.map(wallet => (
                        <option key={wallet.wallet_id} value={wallet.wallet_id}>
                            {wallet.name || `Wallet #${wallet.wallet_id}`}
                        </option>
                    ))}
                </select>
            </div>
        );
    };

    // Filter cryptocurrencies for search
    const filteredCryptocurrencies = availableCryptocurrencies.filter(crypto =>
        crypto.name.toLowerCase().includes(cryptoSearchQuery.toLowerCase()) ||
        crypto.symbol.toLowerCase().includes(cryptoSearchQuery.toLowerCase())
    );

    // Add this function before the return statement
    const searchUsers = async (query) => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:8080/api/users/search?query=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setSearchResults(data.users || []);
            } else {
                console.error('Failed to search users');
            }
        } catch (error) {
            console.error('Error searching users:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Add debounced search function
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) {
                searchUsers(searchQuery);
            }
        }, 300); // 300ms debounce time

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Add function to handle recipient selection
    const selectRecipient = (user) => {
        setSelectedRecipient(user);
        setAddress(user.username || user.email);
        setShowSearchResults(false);

        // Add to recent searches
        setRecentSearches(prevSearches => {
            // Remove the user if already exists to avoid duplicates
            const filteredSearches = prevSearches.filter(s => s.id !== user.id);
            // Add user to the beginning of the array
            const newSearches = [user, ...filteredSearches].slice(0, 10); // Keep max 10 recent searches

            // Save to localStorage
            localStorage.setItem('recentUserSearches', JSON.stringify(newSearches));

            return newSearches;
        });
    };

    // Load recent searches from localStorage when component mounts
    useEffect(() => {
        const storedSearches = localStorage.getItem('recentUserSearches');
        if (storedSearches) {
            try {
                const parsedSearches = JSON.parse(storedSearches);
                setRecentSearches(parsedSearches);
            } catch (e) {
                console.error('Error parsing recent searches', e);
            }
        }
    }, []);

    // Add this before the return statement in Withdrawal.js
    const getMinWithdrawalAmount = () => {
        if (withdrawalType === 'internal') {
            // For internal transfers, use cryptocurrency-based minimums
            switch (selectedCrypto) {
                case 'BTC': return 0.00027;
                case 'ETH': return 0.01;
                case 'USDT': return 20;
                default: return 0.01;
            }
        } else {
            // For on-chain withdrawals, use network-specific minimums
            return parseFloat(availableNetworks.find(n => n.network === chain)?.min_withdrawal || 0.00027);
        }
    };

    // Add this method to Withdrawal.js
    const fetchCompleteTransactionHistory = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('http://localhost:8080/transactions/history/all', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setTransactionHistory(data.transactions);
            } else {
                console.error('Failed to fetch transaction history');
            }
        } catch (error) {
            console.error('Error fetching transaction history:', error);
        }
    };

    useEffect(() => {
        // Other fetching code...
        fetchCompleteTransactionHistory();
    }, []);

    // Add this useEffect to load addresses from localStorage on component mount
    useEffect(() => {
        const storedAddresses = localStorage.getItem('crypto_address_book');
        if (storedAddresses) {
            try {
                const parsedAddresses = JSON.parse(storedAddresses);
                setAddressBook(parsedAddresses);
            } catch (e) {
                console.error('Error parsing address book data', e);
            }
        }
    }, []);

    // Add this to your state variables
    const [addressError, setAddressError] = useState('');

    if (isLoading) {
        return <div className="loading-container">Loading...</div>;
    }

    const AddressBookModal = () => {
        const [sortBy, setSortBy] = useState('lastUsed');

        const filteredAndSortedAddresses = useMemo(() => {
            const searchQuery = addressBookSearchQuery.toLowerCase();

            // First filter - removed cryptocurrency filtering
            const filtered = addressBook.filter(addr =>
            (addr.label.toLowerCase().includes(searchQuery) ||
                addr.address.toLowerCase().includes(searchQuery))
            );

            // Then sort
            return [...filtered].sort((a, b) => {
                switch (sortBy) {
                    case 'lastUsed':
                        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
                        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
                        return dateB - dateA;

                    case 'label':
                        return a.label.localeCompare(b.label);

                    case 'cryptocurrency':
                        return a.cryptocurrency.localeCompare(b.cryptocurrency);

                    default:
                        return 0;
                }
            });
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [sortBy, addressBookSearchQuery.toLowerCase()]); // Fixed dependency array

        return (
            <div className="modal-overlay">
                <div className="address-book-modal">
                    <div className="address-book-header">
                        <h2>Address Book</h2>
                        <button className="close-modal-btn" onClick={() => setShowAddressBook(false)}>×</button>
                    </div>

                    <div className="address-book-search">
                        <input
                            type="text"
                            placeholder="Search addresses..."
                            value={addressBookSearchQuery}
                            onChange={(e) => setAddressBookSearchQuery(e.target.value)}
                            className="form-input"
                        />
                        <button
                            className="add-address-btn"
                            onClick={() => {
                                setEditingAddress(null);
                                setShowAddAddressModal(true);
                            }}
                        >
                            + Add New Address
                        </button>
                    </div>

                    <div className="address-sort-options">
                        <label>Sort by: </label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="sort-select"
                        >
                            <option value="lastUsed">Recently Used</option>
                            <option value="label">Label (A-Z)</option>
                            <option value="cryptocurrency">Cryptocurrency</option>
                        </select>
                    </div>

                    <div className="address-list">
                        {filteredAndSortedAddresses.length > 0 ? (
                            filteredAndSortedAddresses.map((addr) => (
                                <div key={addr.id} className="address-item">
                                    <div className="address-details" onClick={() => selectAddress(addr)}>
                                        <div className="address-label">{addr.label}</div>
                                        <div className="address-crypto-badge">{addr.cryptocurrency}</div>
                                        <div className="address-value">{formatAddress(addr.address)}</div>
                                        {addr.notes && <div className="address-notes">{addr.notes}</div>}
                                    </div>
                                    <div className="address-actions">
                                        <button
                                            className="edit-address"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingAddress(addr);
                                                setShowAddAddressModal(true);
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="delete-address"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteAddress(addr.id);
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-addresses">
                                {addressBookSearchQuery ?
                                    "No addresses match your search" :
                                    "No saved addresses. Add addresses to your address book for quick access."}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const AddAddressModal = () => {
        const [addressData, setAddressData] = useState({
            label: editingAddress?.label || newAddressData?.label || '',
            address: editingAddress?.address || newAddressData?.address || '',
            cryptocurrency: editingAddress?.cryptocurrency || newAddressData?.cryptocurrency || selectedCrypto,
            notes: editingAddress?.notes || newAddressData?.notes || ''
        });

        const [validationError, setValidationError] = useState('');

        const handleSave = () => {
            // Validate data
            if (!addressData.label.trim()) {
                setValidationError('Please enter a label for this address');
                return;
            }

            if (!addressData.address.trim()) {
                setValidationError('Please enter an address');
                return;
            }

            // Use our enhanced validation function
            const validation = validateRecipientAddress(addressData.address, addressData.cryptocurrency);
            if (!validation.isValid) {
                setValidationError(validation.errorMessage);
                return;
            }

            // Proceed with save if validation passes...
            if (editingAddress) {
                // Update existing address
                const updatedAddressBook = addressBook.map(addr =>
                    addr.id === editingAddress.id ? { ...addressData, id: addr.id } : addr
                );
                setAddressBook(updatedAddressBook);
                localStorage.setItem('crypto_address_book', JSON.stringify(updatedAddressBook));
            } else {
                // Add new address
                const newAddress = {
                    ...addressData,
                    id: Date.now().toString(),
                    createdAt: new Date().toISOString()
                };
                const updatedAddressBook = [...addressBook, newAddress];
                setAddressBook(updatedAddressBook);
                localStorage.setItem('crypto_address_book', JSON.stringify(updatedAddressBook));
            }

            setShowAddAddressModal(false);
            setEditingAddress(null);
        };

        // Add this to clear newAddressData when modal is closed
        const closeModal = () => {
            setShowAddAddressModal(false);
            setEditingAddress(null);
            setNewAddressData(null);
        };

        return (
            <div className="modal-overlay">
                <div className="add-address-modal">
                    <div className="modal-header">
                        <h2>{editingAddress ? 'Edit Address' : 'Add New Address'}</h2>
                        <button
                            className="close-modal-btn"
                            onClick={closeModal}
                        >
                            ×
                        </button>
                    </div>

                    <div className="form-group">
                        <label>Label</label>
                        <input
                            type="text"
                            placeholder="E.g., My Hardware Wallet"
                            value={addressData.label}
                            onChange={(e) => setAddressData({ ...addressData, label: e.target.value })}
                            className="form-input"
                        />
                    </div>

                    <div className="form-group">
                        <label>Cryptocurrency</label>
                        <select
                            value={addressData.cryptocurrency}
                            onChange={(e) => setAddressData({ ...addressData, cryptocurrency: e.target.value })}
                            className="form-select"
                        >
                            {availableCryptocurrencies.map(crypto => (
                                <option key={crypto.symbol} value={crypto.symbol}>
                                    {crypto.symbol} - {crypto.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Address</label>
                        <input
                            type="text"
                            placeholder={`Enter ${addressData.cryptocurrency} address`}
                            value={addressData.address}
                            onChange={(e) => setAddressData({ ...addressData, address: e.target.value })}
                            className="form-input"
                        />
                    </div>

                    <div className="form-group">
                        <label>Notes (Optional)</label>
                        <textarea
                            placeholder="Add any notes about this address"
                            value={addressData.notes}
                            onChange={(e) => setAddressData({ ...addressData, notes: e.target.value })}
                            className="form-textarea"
                        />
                    </div>

                    {validationError && (
                        <div className="error-message">{validationError}</div>
                    )}

                    <div className="modal-actions">
                        <button
                            className="cancel-btn"
                            onClick={closeModal}
                        >
                            Cancel
                        </button>
                        <button className="save-btn" onClick={handleSave}>
                            {editingAddress ? 'Update' : 'Save'} Address
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Corrected formatAddress function
    const formatAddress = (address) => {
        if (!address) return '';
        if (address.length <= 16) return address;
        return `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
    };

    // Delete an address from the address book
    const deleteAddress = (addressId) => {
        if (window.confirm('Are you sure you want to delete this address?')) {
            const updatedAddressBook = addressBook.filter(addr => addr.id !== addressId);
            setAddressBook(updatedAddressBook);
            localStorage.setItem('crypto_address_book', JSON.stringify(updatedAddressBook));
        }
    };

    // Select an address from the address book
    const selectAddress = (addr) => {
        setAddress(addr.address);
        setShowAddressBook(false);

        // Update the address's last used timestamp
        const updatedAddressBook = addressBook.map(item =>
            item.id === addr.id ? { ...item, lastUsed: new Date().toISOString() } : item
        );
        setAddressBook(updatedAddressBook);
        localStorage.setItem('crypto_address_book', JSON.stringify(updatedAddressBook));
    };

    /**
     * Validates cryptocurrency wallet addresses with more accurate patterns
     * 
     * @param {string} address - The wallet address to validate
     * @param {string} cryptocurrency - The cryptocurrency symbol (BTC, ETH, etc.)
     * @return {Object} - { isValid: boolean, errorMessage: string|null, warning: string|null }
     */
    const validateRecipientAddress = (address, cryptocurrency) => {
        // Basic input validation
        if (!address) {
            return {
                isValid: false,
                errorMessage: "Address cannot be empty"
            };
        }

        if (!cryptocurrency) {
            return {
                isValid: false,
                errorMessage: "Cryptocurrency not specified"
            };
        }

        const trimmedAddress = address.trim();

        // Empty check after trimming
        if (trimmedAddress.length === 0) {
            return {
                isValid: false,
                errorMessage: "Address cannot be empty"
            };
        }

        // Check for common invalid characters (spaces, special characters)
        if (/\s/.test(trimmedAddress)) {
            return {
                isValid: false,
                errorMessage: "Address cannot contain spaces"
            };
        }

        // Bitcoin address validation with improved regex patterns
        if (cryptocurrency === 'BTC') {
            // P2PKH addresses (Legacy) - start with '1'
            if (trimmedAddress.startsWith('1')) {
                // More permissive pattern for P2PKH
                if (!/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmedAddress)) {
                    return {
                        isValid: false,
                        errorMessage: "Invalid Bitcoin P2PKH address format"
                    };
                }
            }
            // P2SH addresses - start with '3'
            else if (trimmedAddress.startsWith('3')) {
                // More permissive pattern for P2SH
                if (!/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmedAddress)) {
                    return {
                        isValid: false,
                        errorMessage: "Invalid Bitcoin P2SH address format"
                    };
                }
            }
            // Bech32 addresses (Segwit) - start with 'bc1'
            else if (trimmedAddress.startsWith('bc1')) {
                // More permissive pattern for Bech32
                if (!/^bc1[a-zA-HJ-NP-Z0-9]{8,87}$/.test(trimmedAddress)) {
                    return {
                        isValid: false,
                        errorMessage: "Invalid Bitcoin Bech32 address format"
                    };
                }
            } else {
                return {
                    isValid: false,
                    errorMessage: "Bitcoin address must start with '1', '3', or 'bc1'"
                };
            }

            return {
                isValid: true,
                errorMessage: null
            };
        }
        // Ethereum and all other cryptocurrencies
        else {
            // All non-BTC addresses use Ethereum format (as specified in requirements)
            if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
                return {
                    isValid: false,
                    errorMessage: `${cryptocurrency} address must be a 42-character hexadecimal string starting with '0x'`
                };
            }

            // Additional check for checksum format in Ethereum addresses
            if (/^0x[a-f0-9]{40}$|^0x[A-F0-9]{40}$/.test(trimmedAddress)) {
                // If address is all lowercase or all uppercase, it's not checksummed
                // This is allowed but generates a warning
                return {
                    isValid: true,
                    errorMessage: null,
                    warning: "Address is not checksummed. This is acceptable but not recommended."
                };
            }

            // If we reach here, it's a valid (likely checksummed) Ethereum address
            return {
                isValid: true,
                errorMessage: null
            };
        }
    };

    // Save a new address after a successful transaction
    const saveAddressAfterTransaction = (transactionAddress, crypto) => {
        // Check if address already exists in address book
        const existingAddress = addressBook.find(addr =>
            addr.address === transactionAddress && addr.cryptocurrency === crypto
        );

        if (!existingAddress && transactionAddress) {
            // Show dialog to save the address
            if (window.confirm('Would you like to save this address to your address book?')) {
                setNewAddressData({
                    label: '',
                    address: transactionAddress,
                    cryptocurrency: crypto,
                    notes: ''
                });
                setShowAddAddressModal(true);
            }
        }
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="logo">CryptoX</div>
                <div className="header-actions">
                    <SearchBox />
                    <button className="deposit-button" onClick={() => navigate('/deposit')}>Deposit</button>

                    <div className="user-profile">
                        <span className="username">
                            {userData?.display_name || getDisplayName(userData) || "Guest"}
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
                        <li className="nav-item" onClick={() => navigate('/dashboard')}>
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
                        <li className="nav-item" onClick={() => navigate('/deposit')}>
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Deposit</span>
                        </li>
                        <li className="nav-item active">
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
                    <div className="withdrawal-container">
                        <h2 className="withdrawal-title">Withdraw Funds</h2>

                        <div className="withdrawal-tabs">
                            <button
                                className={`tab-button ${withdrawalType === 'on-chain' ? 'active' : ''}`}
                                onClick={() => handleWithdrawalTypeChange('on-chain')}
                            >
                                On-chain Withdrawal
                            </button>
                            <button
                                className={`tab-button ${withdrawalType === 'internal' ? 'active' : ''}`}
                                onClick={() => handleWithdrawalTypeChange('internal')}
                            >
                                Internal Transfer
                            </button>
                        </div>

                        <div className="form-section">
                            <h3>1. Select Wallet</h3>
                            {renderWalletSelector()}
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
                                                        handleCryptoChange(crypto.symbol);
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
                                                        <div className="crypto-fee">
                                                            Fee: {crypto.withdrawal_fee} {crypto.symbol}
                                                        </div>
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

                        {withdrawalType === 'on-chain' && (
                            <div className="form-section">
                                <h3>3. Select Network</h3>
                                <div className="blockchain-selector">
                                    {availableNetworks.map((network, index) => (
                                        <div
                                            key={index}
                                            className={`blockchain-option ${chain === network.network ? 'selected' : ''}`}
                                            onClick={() => {
                                                setChain(network.network);
                                                if (network.fee) {
                                                    setFee(parseFloat(network.fee));
                                                }
                                            }}
                                        >
                                            <div className="blockchain-info">
                                                <div className="blockchain-name">{network.network}</div>
                                                <div className="blockchain-fee">Network Fee: {network.fee} {selectedCrypto}</div>
                                                <div className="blockchain-fee">Min Withdrawal: {network.min_withdrawal} {selectedCrypto}</div>
                                            </div>
                                            {chain === network.network && (
                                                <div className="blockchain-selected-icon">✓</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="form-section">
                            <h3>4. Wallet Address</h3>
                            {withdrawalType === 'on-chain' ? (
                                <div className="address-input-container">
                                    <input
                                        type="text"
                                        placeholder="Enter recipient address"
                                        value={address}
                                        onChange={(e) => {
                                            const newAddress = e.target.value;
                                            setAddress(newAddress);

                                            // Clear any existing errors when the user types
                                            if (addressError) {
                                                setAddressError('');
                                            }

                                            // Only validate if there's some content and it's on-chain withdrawal
                                            if (newAddress.trim() && withdrawalType === 'on-chain' && newAddress.length > 10) {
                                                const validation = validateRecipientAddress(newAddress, selectedCrypto);
                                                if (!validation.isValid) {
                                                    setAddressError(validation.errorMessage);
                                                } else if (validation.warning) {
                                                    setAddressError(validation.warning);
                                                }
                                            }

                                            // Auto-detect cryptocurrency when an address is pasted
                                            if (newAddress.length > 30) { // Only check longer addresses
                                                if (newAddress.startsWith('1') || newAddress.startsWith('3') || newAddress.startsWith('bc1')) {
                                                    if (selectedCrypto !== 'BTC') {
                                                        if (window.confirm("This appears to be a Bitcoin address. Would you like to switch to BTC?")) {
                                                            handleCryptoChange('BTC');
                                                        }
                                                    }
                                                } else if (newAddress.startsWith('0x')) {
                                                    // If it's an ETH address but we're on BTC, suggest switching
                                                    if (selectedCrypto === 'BTC') {
                                                        if (window.confirm("This appears to be an Ethereum-style address. Would you like to switch to ETH?")) {
                                                            handleCryptoChange('ETH');
                                                        }
                                                    }
                                                }
                                            }
                                        }}
                                        className={`form-input ${addressError && addressError.includes('not recommended') ? 'input-warning' : addressError ? 'input-error' : ''}`}
                                    />
                                    {addressError && (
                                        <div className={addressError.includes('not recommended') ? 'input-warning-message' : 'input-error-message'}>
                                            {addressError}
                                        </div>
                                    )}
                                    <button
                                        className="address-book-btn"
                                        onClick={() => setShowAddressBook(true)}
                                    >
                                        Address Book
                                    </button>
                                </div>
                            ) : (
                                <div className="address-input-container">
                                    {selectedRecipient ? (
                                        // Show selected recipient first when available
                                        <div className="selected-recipient">
                                            <div className="recipient-header">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                                    <circle cx="12" cy="7" r="4"></circle>
                                                </svg>
                                                Selected Recipient
                                            </div>
                                            <button
                                                className="remove-recipient"
                                                onClick={() => {
                                                    setSelectedRecipient(null);
                                                    setAddress('');
                                                }}
                                                aria-label="Remove recipient"
                                            >
                                                ✕
                                            </button>
                                            <div className="recipient-details">
                                                <div className="recipient-avatar">
                                                    {selectedRecipient.username?.[0] || selectedRecipient.email?.[0] || "U"}
                                                </div>
                                                <div className="recipient-info">
                                                    <div className="recipient-name">{selectedRecipient.username}</div>
                                                    <div className="recipient-email">{selectedRecipient.email}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        // Show search container if no recipient is selected
                                        <div className="user-search-container">
                                            <div className="search-input-wrapper">
                                                <span className="search-icon">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="11" cy="11" r="8"></circle>
                                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                                    </svg>
                                                </span>
                                                <input
                                                    type="text"
                                                    placeholder="Search by username or email..."
                                                    value={searchQuery}
                                                    onChange={(e) => {
                                                        setSearchQuery(e.target.value);
                                                        if (e.target.value) {
                                                            setShowSearchResults(true);
                                                        }
                                                        if (e.target.value.length < 2) {
                                                            setSearchResults([]);
                                                        }
                                                    }}
                                                    onClick={() => {
                                                        if (searchQuery) {
                                                            setShowSearchResults(true);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        const results = document.querySelectorAll('.search-result-item');
                                                        let currentFocus = Array.from(results).findIndex(el =>
                                                            el.classList.contains('keyboard-focus')
                                                        );

                                                        // Handle arrow keys for navigation
                                                        if (e.key === 'ArrowDown') {
                                                            e.preventDefault();
                                                            const nextIndex = currentFocus < 0 ? 0 : (currentFocus + 1) % results.length;
                                                            results.forEach((item, i) => {
                                                                item.classList.toggle('keyboard-focus', i === nextIndex);
                                                            });
                                                        } else if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            const prevIndex = currentFocus < 0 ? results.length - 1 :
                                                                (currentFocus - 1 + results.length) % results.length;
                                                            results.forEach((item, i) => {
                                                                item.classList.toggle('keyboard-focus', i === prevIndex);
                                                            });
                                                        } else if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            const focused = document.querySelector('.search-result-item.keyboard-focus');
                                                            if (focused) {
                                                                const userId = focused.getAttribute('data-user-id');
                                                                const user = searchResults.find(u => u.id.toString() === userId);
                                                                if (user) {
                                                                    selectRecipient(user);
                                                                }
                                                            }
                                                        } else if (e.key === 'Escape') {
                                                            setShowSearchResults(false);
                                                        }
                                                    }}
                                                    className="search-input form-input"
                                                />
                                                {searchQuery && (
                                                    <button
                                                        className="clear-search"
                                                        onClick={() => {
                                                            setSearchQuery('');
                                                            setSearchResults([]);
                                                        }}
                                                        aria-label="Clear search"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>

                                            {isSearching && <div className="search-loading">Searching</div>}

                                            {showSearchResults && (
                                                <div className="search-results">
                                                    {searchQuery.length < 2 ? (
                                                        <div className="search-hint">Type at least 2 characters to search</div>
                                                    ) : searchResults.length > 0 ? (
                                                        searchResults.map((user) => (
                                                            <div
                                                                key={user.id}
                                                                data-user-id={user.id}
                                                                className="search-result-item"
                                                                onClick={() => selectRecipient(user)}
                                                            >
                                                                <div className="user-avatar">
                                                                    {user.username?.[0] || user.email?.[0] || "U"}
                                                                </div>
                                                                <div className="user-details">
                                                                    <div className="user-name">{user.username}</div>
                                                                    <div className="user-email">{user.email}</div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : !isSearching && (
                                                        <div className="no-results">
                                                            No users found matching "{searchQuery}"
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {!searchQuery && recentSearches && recentSearches.length > 0 && (
                                                <div className="recent-searches">
                                                    <div className="recent-searches-header">
                                                        <span className="recent-searches-title">Recent searches</span>
                                                        <button
                                                            className="clear-recent"
                                                            onClick={() => {
                                                                setRecentSearches([]);
                                                                localStorage.setItem('recentUserSearches', JSON.stringify([]));
                                                            }}
                                                        >
                                                            Clear all
                                                        </button>
                                                    </div>
                                                    <div className="recent-search-items">
                                                        {recentSearches.slice(0, 5).map((user) => (
                                                            <div
                                                                key={user.id}
                                                                className="recent-search-item"
                                                                onClick={() => {
                                                                    setSearchQuery(user.username || user.email);
                                                                    searchUsers(user.username || user.email);
                                                                }}
                                                            >
                                                                <div className="recent-search-avatar">
                                                                    {user.username?.[0] || user.email?.[0] || "U"}
                                                                </div>
                                                                {user.username || user.email}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="form-section">
                            <h3>5. Withdrawal Amount</h3>
                            <div className="amount-label-container">
                                <label>Withdrawable Amount</label>
                                <span className="balance-display">Balance: {balance} {selectedCrypto}</span>
                            </div>
                            <div className="amount-input-container">
                                <input
                                    type="text"
                                    placeholder={`Minimum: ${availableNetworks.find(n => n.network === chain)?.min_withdrawal || '0.00027'} ${selectedCrypto}`}
                                    value={withdrawalAmount}
                                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                                    className="form-input"
                                />
                                <button className="max-btn" onClick={handleMaxAmount}>MAX</button>
                            </div>
                        </div>

                        {withdrawalAmount && !isNaN(parseFloat(withdrawalAmount)) &&
                            parseFloat(withdrawalAmount) > 0 &&
                            parseFloat(withdrawalAmount) < getMinWithdrawalAmount() && (
                                <div className="input-error">
                                    Amount below minimum ({getMinWithdrawalAmount()} {selectedCrypto})
                                </div>
                            )}

                        <div className="fee-section">
                            <div className="fee-item">
                                <span>Transaction Fee:</span>
                                <span>{withdrawalType === 'internal' ? '0' : fee} {selectedCrypto}</span>
                            </div>
                            <div className="fee-item">
                                <span>Amount Received:</span>
                                <span>
                                    {withdrawalAmount && !isNaN(parseFloat(withdrawalAmount))
                                        ? (withdrawalType === 'internal'
                                            ? parseFloat(withdrawalAmount).toFixed(8)
                                            : Math.max(0, parseFloat(withdrawalAmount) - fee).toFixed(8))
                                        : '--'} {selectedCrypto}
                                </span>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button
                                className="withdraw-button"
                                onClick={handleSubmit}
                                disabled={
                                    !selectedWallet ||
                                    !withdrawalAmount ||
                                    isNaN(parseFloat(withdrawalAmount)) ||
                                    parseFloat(withdrawalAmount) <= 0 ||
                                    parseFloat(withdrawalAmount) < getMinWithdrawalAmount() ||
                                    !address
                                }
                            >
                                {withdrawalType === 'internal' ? 'Transfer' : 'Withdraw'} {withdrawalAmount || '0'} {selectedCrypto}
                            </button>
                        </div>

                        {apiError && (
                            <div className="error-message">{apiError}</div>
                        )}

                        <div className="transaction-history-section">
                            <h2>Transaction History</h2>
                            {transactionHistory && transactionHistory.length > 0 ? (
                                <table className="transaction-history-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th>Cryptocurrency</th>
                                            <th>Amount</th>
                                            <th>Address</th>
                                            <th>Network</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactionHistory.map((tx, index) => (
                                            <tr key={index}>
                                                <td>{new Date(tx.created_at).toLocaleString()}</td>
                                                <td>
                                                    <span className={`transaction-type ${tx.transaction_type}`}>
                                                        {tx.transaction_type === 'withdrawal' ? 'Withdrawal' :
                                                            tx.transaction_type === 'transfer' && tx.is_internal ? 'Internal Transfer' :
                                                                tx.transaction_type === 'transfer' ? 'Transfer' : 'Deposit'}
                                                    </span>
                                                </td>
                                                <td>{tx.cryptocurrency}</td>
                                                <td className="amount-cell">
                                                    {parseFloat(tx.amount).toFixed(8)}
                                                </td>
                                                <td className="address-cell">
                                                    {tx.address ?
                                                        `${tx.address.substring(0, 6)}...${tx.address.substring(tx.address.length - 6)}` :
                                                        'N/A'}
                                                </td>
                                                <td>{tx.blockchain || 'Internal'}</td>
                                                <td>
                                                    <span className={`status-badge ${tx.status.toLowerCase()}`}>
                                                        {tx.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="no-history-message">
                                    No transaction history found
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Confirmation Modal */}
            {isConfirmationVisible && (
                <div className="modal-overlay">
                    <div className="confirmation-modal">
                        <h2>Confirm {withdrawalType === 'internal' ? 'Internal Transfer' : 'Withdrawal'}</h2>
                        <div className="confirmation-details">
                            <div className="confirm-item">
                                <span>Amount:</span>
                                <span>{withdrawalAmount} {selectedCrypto}</span>
                            </div>

                            {withdrawalType === 'internal' ? (
                                <div className="confirm-item">
                                    <span>Recipient:</span>
                                    <span className="recipient-info-display">
                                        {selectedRecipient ? (
                                            <>
                                                <span className="recipient-name">
                                                    {selectedRecipient.username} {/* Use username instead of display_name */}
                                                </span>
                                                <span className="recipient-email">({selectedRecipient.email})</span>
                                            </>
                                        ) : address}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="confirm-item">
                                        <span>Fee:</span>
                                        <span>{fee} {selectedCrypto}</span>
                                    </div>
                                    <div className="confirm-item">
                                        <span>Recipient Address:</span>
                                        <span className="address-display" title={address}>
                                            {address.length > 20 ?
                                                `${address.substring(0, 10)}...${address.substring(address.length - 10)}` :
                                                address}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="confirm-item">
                                <span>{withdrawalType === 'internal' ? 'Recipient receives:' : 'You will receive:'}</span>
                                <span>
                                    {withdrawalAmount && !isNaN(parseFloat(withdrawalAmount))
                                        ? (withdrawalType === 'internal'
                                            ? parseFloat(withdrawalAmount).toFixed(8)
                                            : Math.max(0, parseFloat(withdrawalAmount) - fee).toFixed(8))
                                        : '--'} {selectedCrypto}
                                </span>
                            </div>
                        </div>
                        <div className="confirmation-actions">
                            <button className="cancel-btn" onClick={cancelWithdrawal}>Cancel</button>
                            <button className="confirm-btn" onClick={confirmWithdrawal}>
                                {withdrawalType === 'internal' ? 'Transfer' : 'Withdraw'}
                            </button>
                        </div>
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

            {/* Address Book Modal */}
            {showAddressBook && <AddressBookModal />}

            {/* Add Address Modal */}
            {showAddAddressModal && <AddAddressModal />}
        </div>
    );
}

export default Withdrawal;