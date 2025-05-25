import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './SearchBox.css';

const SearchBox = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const [searchResults, setSearchResults] = useState([]);
    const searchInputRef = useRef(null);

    // Site navigation and content data - this could come from a centralized config or context
    const sitePages = [
        { title: 'Dashboard', path: '/dashboard', keywords: ['home', 'main', 'overview'] },
        { title: 'Markets', path: '/markets', keywords: ['prices', 'trading', 'exchange'] },
        { title: 'Assets', path: '/assets-overview', keywords: ['portfolio', 'coins', 'holdings'] },
        { title: 'Deposit', path: '/deposit', keywords: ['fund', 'payment', 'add money'] },
        { title: 'Withdraw', path: '/withdraw', keywords: ['transfer', 'cash out'] },
        { title: 'Account Settings', path: '/settings', keywords: ['profile', 'preferences', 'security'] },
        { title: 'Verification', path: '/verify', keywords: ['identity', 'KYC', 'documents'] },
        { title: 'Support', path: '/support', keywords: ['help', 'contact', 'assistance'] },
    ];

    // Search function to filter results based on query
    const handleSearchInput = (e) => {
        const query = e.target.value;
        setSearchQuery(query);

        if (query.trim() === '') {
            setShowSuggestions(false);
            setSearchResults([]);
            return;
        }

        // Filter pages based on title or keywords match
        const filteredResults = sitePages.filter(page =>
            page.title.toLowerCase().includes(query.toLowerCase()) ||
            page.keywords.some(keyword => keyword.toLowerCase().includes(query.toLowerCase()))
        );

        setSearchResults(filteredResults);
        setShowSuggestions(true);
        setSelectedSuggestionIndex(-1); // Reset selection when input changes
    };

    // Handle keyboard navigation in dropdown
    const handleKeyDown = (e) => {
        if (!showSuggestions || searchResults.length === 0) return;

        // Arrow up
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev =>
                prev <= 0 ? searchResults.length - 1 : prev - 1
            );
        }
        // Arrow down
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev =>
                prev >= searchResults.length - 1 ? 0 : prev + 1
            );
        }
        // Enter key - navigate to selected option
        else if (e.key === 'Enter') {
            if (selectedSuggestionIndex >= 0) {
                e.preventDefault();
                navigateToResult(searchResults[selectedSuggestionIndex]);
            }
        }
        // Escape key - close dropdown
        else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    // Navigate to selected page
    const navigateToResult = (result) => {
        setSearchQuery('');
        setShowSuggestions(false);
        navigate(result.path);
    };

    // Close suggestions when clicking outside the search container
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchInputRef.current && !searchInputRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="search-container" ref={searchInputRef}>
            <span className="search-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </span>
            <input
                type="text"
                placeholder="Search..."
                className="search-input"
                value={searchQuery}
                onChange={handleSearchInput}
                onKeyDown={handleKeyDown}
                onFocus={() => searchQuery && setShowSuggestions(true)}
            />

            {/* Search suggestions dropdown */}
            {showSuggestions && searchResults.length > 0 && (
                <div className="search-suggestions">
                    {searchResults.map((result, index) => (
                        <div
                            key={result.path}
                            className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                            onClick={() => navigateToResult(result)}
                            onMouseEnter={() => setSelectedSuggestionIndex(index)}
                        >
                            <span className="suggestion-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            </span>
                            {result.title}
                        </div>
                    ))}
                </div>
            )}

            {/* No results message */}
            {showSuggestions && searchQuery && searchResults.length === 0 && (
                <div className="search-suggestions">
                    <div className="no-results">No results found</div>
                </div>
            )}
        </div>
    );
};

export default SearchBox;