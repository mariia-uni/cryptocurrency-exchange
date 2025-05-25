import React, { useState, useEffect } from 'react';

// Styling for the refresh indicator component
const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.8rem',
        color: '#7d8395',
        marginLeft: '10px',
    },
    dot: {
        height: '8px',
        width: '8px',
        borderRadius: '50%',
        marginRight: '6px',
        animation: 'pulse 2s infinite',
    },
    activeDot: {
        backgroundColor: '#4CAF50',
    },
    inactiveDot: {
        backgroundColor: '#ccc',
    },
    refreshText: {
        fontSize: '0.75rem',
    },
};

/**
 * A component that shows when data was last refreshed and indicates active refreshes
 * @param {Object} props
 * @param {Date} props.lastRefreshTime - Time of the last refresh
 * @param {boolean} props.isRefreshing - Whether a refresh is currently in progress
 * @returns {JSX.Element}
 */
const RefreshIndicator = ({ lastRefreshTime, isRefreshing }) => {
    const [timeAgo, setTimeAgo] = useState('');

    useEffect(() => {
        const updateTimeAgo = () => {
            if (!lastRefreshTime) {
                setTimeAgo('never');
                return;
            }

            const seconds = Math.floor((new Date() - lastRefreshTime) / 1000);

            if (seconds < 5) {
                setTimeAgo('just now');
            } else if (seconds < 60) {
                setTimeAgo(`${seconds}s ago`);
            } else {
                setTimeAgo(`${Math.floor(seconds / 60)}m ${seconds % 60}s ago`);
            }
        };

        // Update immediately
        updateTimeAgo();

        // Then update every second
        const interval = setInterval(updateTimeAgo, 1000);
        return () => clearInterval(interval);
    }, [lastRefreshTime]);

    return (
        <div style={styles.container}>
            <div
                style={{
                    ...styles.dot,
                    ...(isRefreshing ? styles.activeDot : styles.inactiveDot)
                }}
            />
            <span style={styles.refreshText}>
                {isRefreshing ? 'Refreshing...' : `Last updated: ${timeAgo}`}
            </span>

            <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default RefreshIndicator;
