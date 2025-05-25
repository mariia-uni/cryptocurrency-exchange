// refreshUtils.js
// This utility helps synchronize refreshes across components

// Shared constant for refresh interval (15 seconds)
export const REFRESH_INTERVAL = 15000;

// Synchronized refresh timing - this ensures all components refresh at the same time
let lastRefreshTime = Date.now();
let nextScheduledRefresh = lastRefreshTime + REFRESH_INTERVAL;

// A map to store interval IDs associated with timeout IDs
const intervalMap = new Map();

/**
 * Provides a synchronized timestamp for when the next refresh should occur
 * Components can use this to align their refresh timers
 * @returns {number} Time in ms when next refresh should happen
 */
export const getNextRefreshTime = () => {
    const now = Date.now();

    // If we're past the scheduled refresh, set up a new one
    if (now >= nextScheduledRefresh) {
        lastRefreshTime = now;
        nextScheduledRefresh = now + REFRESH_INTERVAL;
    }

    return nextScheduledRefresh;
};

/**
 * Returns how many ms to wait until next refresh
 * @returns {number} Milliseconds until next refresh
 */
export const getTimeUntilNextRefresh = () => {
    return Math.max(0, getNextRefreshTime() - Date.now());
};

/**
 * Creates a synchronized setInterval that aligns with other components using the same util
 * @param {Function} callback Function to execute on interval
 * @returns {Object} An object identifying the synchronized interval
 */
export const createSynchronizedInterval = (callback) => {
    // Execute immediately if needed
    callback();

    // Generate a unique identifier for this refresh cycle
    const refreshId = { id: Date.now() + Math.random() };

    // First timeout to align with the global refresh schedule
    const timeoutId = setTimeout(() => {
        callback();
        // Then set regular interval aligned with the global schedule
        const intervalId = setInterval(callback, REFRESH_INTERVAL);

        // Store the interval ID in our map
        intervalMap.set(refreshId, intervalId);
    }, getTimeUntilNextRefresh());

    // Store the timeout ID in our object for later cleanup
    refreshId.timeoutId = timeoutId;

    // Return the refresh identifier object
    return refreshId;
};

/**
 * Clears a synchronized interval created with createSynchronizedInterval
 * @param {Object} refreshId The object returned by createSynchronizedInterval
 */
export const clearSynchronizedInterval = (refreshId) => {
    if (!refreshId) return;

    // Clear the timeout if it hasn't fired yet
    if (refreshId.timeoutId) {
        clearTimeout(refreshId.timeoutId);
    }

    // Clear the interval if it exists
    const intervalId = intervalMap.get(refreshId);
    if (intervalId) {
        clearInterval(intervalId);
        intervalMap.delete(refreshId);
    }
};
