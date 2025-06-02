import React, { useEffect, useRef, useState, useCallback } from 'react';
import './TradingViewChart.css';

const TradingViewChart = ({ symbol = 'BTCUSDT', onPriceUpdate }) => {
    const containerRef = useRef(null);
    const widgetRef = useRef(null);
    const intervalRef = useRef(null);
    const [currentPrice, setCurrentPrice] = useState(0);
    const [priceChange, setPriceChange] = useState(0);
    const [priceChangePercent, setPriceChangePercent] = useState(0);
    const [volume24h, setVolume24h] = useState(0);
    const [high24h, setHigh24h] = useState(0);
    const [low24h, setLow24h] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedTimeframe] = useState('15');

    // Fetch real-time price data from CoinMarketCap via your API
    const fetchPriceData = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/api/markets');
            if (response.ok) {
                const data = await response.json();
                const btcData = data.cryptocurrencies.find(crypto => crypto.symbol === 'BTC');

                if (btcData) {
                    const price = btcData.price;
                    const change24h = btcData.percent_change_24h;
                    const volume = btcData.volume_24h;

                    setCurrentPrice(price);
                    setPriceChangePercent(change24h);
                    setPriceChange((price * change24h) / 100);
                    setVolume24h(volume);

                    // Calculate 24h high/low (approximation based on current price and change)
                    const changeAmount = (price * change24h) / 100;
                    const yesterdayPrice = price - changeAmount;
                    setHigh24h(Math.max(price, yesterdayPrice * 1.05));
                    setLow24h(Math.min(price, yesterdayPrice * 0.95));

                    // Notify parent component of price update
                    if (onPriceUpdate) {
                        onPriceUpdate(price);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching price data:', error);
        }
    }, [onPriceUpdate]);

    // Initialize TradingView widget
    const initTradingViewWidget = useCallback(() => {
        if (!window.TradingView || !containerRef.current) return;

        // Clear existing widget
        if (widgetRef.current) {
            widgetRef.current = null;
        }
        containerRef.current.innerHTML = '';

        try {
            widgetRef.current = new window.TradingView.widget({
                autosize: true,
                symbol: `BINANCE:${symbol}`,
                interval: selectedTimeframe,
                timezone: "Etc/UTC",
                theme: "dark",
                style: "1",
                locale: "en",
                toolbar_bg: "#1a1f2a",
                enable_publishing: false,
                withdateranges: true,
                hide_side_toolbar: false,
                allow_symbol_change: false,
                container_id: containerRef.current.id,
                studies: [
                    "Volume@tv-basicstudies",
                    "RSI@tv-basicstudies",
                    "MACD@tv-basicstudies"
                ],
                overrides: {
                    // ByBit-style color scheme
                    "paneProperties.background": "#1a1f2a",
                    "paneProperties.vertGridProperties.color": "#2e3444",
                    "paneProperties.horzGridProperties.color": "#2e3444",
                    "symbolWatermarkProperties.transparency": 90,
                    "scalesProperties.textColor": "#8e8e8e",
                    "scalesProperties.backgroundColor": "#1a1f2a",

                    // Candle colors (matching ByBit)
                    "mainSeriesProperties.candleStyle.upColor": "#3dd768",
                    "mainSeriesProperties.candleStyle.downColor": "#ff5757",
                    "mainSeriesProperties.candleStyle.borderUpColor": "#3dd768",
                    "mainSeriesProperties.candleStyle.borderDownColor": "#ff5757",
                    "mainSeriesProperties.candleStyle.wickUpColor": "#3dd768",
                    "mainSeriesProperties.candleStyle.wickDownColor": "#ff5757",

                    // Volume colors
                    "volume.volume.color.0": "#ff5757",
                    "volume.volume.color.1": "#3dd768",
                    "volume.volume.transparency": 50,

                    // Grid and background
                    "paneProperties.topMargin": 10,
                    "paneProperties.bottomMargin": 10,
                    "paneProperties.leftAxisProperties.autoScale": true,
                    "paneProperties.rightAxisProperties.autoScale": true
                },
                loading_screen: {
                    backgroundColor: "#1a1f2a",
                    foregroundColor: "#f0b90b"
                },
                custom_css_url: '/tradingview-custom.css'
            });

            setIsLoading(false);
        } catch (error) {
            console.error('Error initializing TradingView widget:', error);
            setIsLoading(false);
        }
    }, [symbol, selectedTimeframe]);

    // Toggle fullscreen mode
    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    // Load TradingView script
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => {
            initTradingViewWidget();
        };

        if (!document.querySelector('script[src="https://s3.tradingview.com/tv.js"]')) {
            document.head.appendChild(script);
        } else {
            initTradingViewWidget();
        }

        return () => {
            if (widgetRef.current) {
                widgetRef.current = null;
            }
        };
    }, [initTradingViewWidget]);

    // Fetch initial price data and set up real-time updates
    useEffect(() => {
        fetchPriceData();

        // Update price every 30 seconds
        intervalRef.current = setInterval(fetchPriceData, 30000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchPriceData]);

    // Format price with proper decimals
    const formatPrice = (price) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(price);
    };

    // Format large numbers
    const formatVolume = (volume) => {
        if (volume >= 1_000_000_000) {
            return `$${(volume / 1_000_000_000).toFixed(2)}B`;
        } else if (volume >= 1_000_000) {
            return `$${(volume / 1_000_000).toFixed(2)}M`;
        } else if (volume >= 1_000) {
            return `$${(volume / 1_000).toFixed(2)}K`;
        }
        return `$${volume.toFixed(2)}`;
    };

    return (
        <div className={`tradingview-chart-container ${isFullscreen ? 'fullscreen' : ''}`}>
            {/* Chart Header with Price Info */}
            <div className="chart-header">
                <div className="price-section">
                    <div className="symbol-info">
                        <h3>BTC/USDT</h3>
                        <span className="symbol-type">Perpetual</span>
                    </div>
                    <div className="price-info">
                        <div className="current-price">
                            {formatPrice(currentPrice)}
                        </div>
                        <div className={`price-change ${priceChangePercent >= 0 ? 'positive' : 'negative'}`}>
                            <span className="change-amount">
                                {priceChangePercent >= 0 ? '+' : ''}{formatPrice(Math.abs(priceChange))}
                            </span>
                            <span className="change-percent">
                                ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                            </span>
                        </div>
                    </div>
                </div>

                <div className="market-stats">
                    <div className="stat-item">
                        <span className="stat-label">24h High</span>
                        <span className="stat-value">{formatPrice(high24h)}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">24h Low</span>
                        <span className="stat-value">{formatPrice(low24h)}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">24h Volume</span>
                        <span className="stat-value">{formatVolume(volume24h)}</span>
                    </div>
                </div>
            </div>

            {/* Simplified Header with only Fullscreen button */}
            <div className="chart-controls">
                <div className="chart-title">
                    <span>BTC/USDT Chart</span>
                </div>
                <div className="chart-tools">
                    <button
                        className="tool-btn fullscreen-btn"
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                        onClick={toggleFullscreen}
                    >
                        <span>{isFullscreen ? '🗗' : '⛶'}</span>
                    </button>
                </div>
            </div>

            {/* TradingView Chart Container */}
            <div className="chart-wrapper">
                {isLoading && (
                    <div className="chart-loading">
                        <div className="loading-spinner"></div>
                        <p>Loading chart...</p>
                    </div>
                )}
                <div
                    ref={containerRef}
                    id={`tradingview-chart-${Date.now()}`}
                    className="tradingview-widget-container"
                />
            </div>

            {/* Real-time Data Indicator */}
            <div className="data-status">
                <div className="live-indicator">
                    <span className="live-dot"></span>
                    <span>Real-time data via CoinMarketCap</span>
                </div>
                <div className="last-update">
                    Last updated: {new Date().toLocaleTimeString()}
                </div>
            </div>
        </div>
    );
};

export default TradingViewChart;