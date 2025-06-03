import React, { useEffect, useState, useRef, useCallback } from 'react';
import './PortfolioChart.css';

// Import Chart.js components and Pie component at the top
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
} from 'chart.js';
import { Pie } from 'react-chartjs-2';

// Register Chart.js components after imports
ChartJS.register(ArcElement, Tooltip, Legend);

const PortfolioChart = ({ token, refresh }) => {
    const [portfolioData, setPortfolioData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const intervalRef = useRef(null);

    // Move helper functions outside of useEffect or useCallback
    const getSampleData = useCallback(() => [
        { cryptocurrency: 'BTC', percentage: 35, usd_value: 18500, balance: 0.35, color: '#F7931A' },
        { cryptocurrency: 'ETH', percentage: 25, usd_value: 13200, balance: 4.2, color: '#627EEA' },
        { cryptocurrency: 'USDT', percentage: 20, usd_value: 10000, balance: 10000, color: '#26A17B' },
        { cryptocurrency: 'XRP', percentage: 10, usd_value: 5300, balance: 10600, color: '#23292F' },
        { cryptocurrency: 'Others', percentage: 10, usd_value: 5000, balance: 0, color: '#8C8C8C' }
    ], []);

    const getRandomColor = useCallback(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`, []);

    const processPortfolioData = useCallback((data) => {
        const sortedAssets = [...data.assets].sort((a, b) => b.usd_value - a.usd_value);
        const topAssets = sortedAssets.slice(0, 4);
        const otherAssets = sortedAssets.slice(4);
        const otherUsdValue = otherAssets.reduce((sum, asset) => sum + asset.usd_value, 0);
        const totalValue = data.total_value || sortedAssets.reduce((sum, asset) => sum + asset.usd_value, 0);

        const colorMap = {
            'BTC': '#F7931A',
            'ETH': '#627EEA',
            'USDT': '#26A17B',
            'XRP': '#23292F',
            'SOL': '#00FFA3',
            'DOGE': '#C3A634',
            'ADA': '#0033AD',
            'DOT': '#E6007A',
        };

        const formattedAssets = topAssets.map(asset => ({
            cryptocurrency: asset.cryptocurrency,
            percentage: totalValue > 0 ? (asset.usd_value / totalValue) * 100 : 0,
            usd_value: asset.usd_value,
            balance: asset.balance,
            color: colorMap[asset.cryptocurrency] || getRandomColor()
        }));

        if (otherAssets.length > 0 && otherUsdValue > 0) {
            formattedAssets.push({
                cryptocurrency: 'Others',
                percentage: totalValue > 0 ? (otherUsdValue / totalValue) * 100 : 0,
                usd_value: otherUsdValue,
                balance: otherAssets.reduce((sum, asset) => sum + asset.balance, 0),
                color: '#8C8C8C'
            });
        }

        setPortfolioData(formattedAssets);
    }, [getRandomColor]);

    const fetchPortfolioData = useCallback(async () => {
        if (!token) {
            // Only show sample data for demo/unauthenticated users
            setPortfolioData(getSampleData());
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('http://localhost:8080/api/portfolio/distribution', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch portfolio data: ${response.statusText}`);
            }

            const data = await response.json();

            if (data && data.assets && Array.isArray(data.assets) && data.assets.length > 0) {
                processPortfolioData(data);
                setLastUpdate(new Date());
            } else {
                // FIXED: Show empty state for authenticated users with no data
                setPortfolioData([]);  // Empty array instead of sample data
            }

        } catch (err) {
            console.error('Error fetching portfolio data:', err);
            // FIXED: Show empty state instead of sample data for authenticated users
            setPortfolioData([]);
        } finally {
            setIsLoading(false);
        }
    }, [token, getSampleData, processPortfolioData]);

    useEffect(() => {
        // Initial fetch
        fetchPortfolioData();

        // Set up auto-refresh every 30 seconds to catch balance updates
        intervalRef.current = setInterval(() => {
            fetchPortfolioData();
        }, 30000);

        // Cleanup interval on unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchPortfolioData]);

    // Re-fetch when refresh prop changes (triggered by parent component)
    useEffect(() => {
        if (refresh > 0) {
            fetchPortfolioData();
        }
    }, [refresh, fetchPortfolioData]);

    // Create chart data
    const chartData = {
        labels: portfolioData.map(item => item.cryptocurrency),
        datasets: [
            {
                data: portfolioData.map(item => item.percentage),
                backgroundColor: portfolioData.map(item => item.color),
                borderColor: '#1a1f2a',
                borderWidth: 2,
            },
        ],
    };

    // Chart options
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#ffffff',
                    font: {
                        size: 12,
                        family: 'Arial, sans-serif'
                    },
                    usePointStyle: true,
                    padding: 20,
                    generateLabels: (chart) => {
                        const datasets = chart.data.datasets;
                        if (datasets.length) {
                            return chart.data.labels.map((label, i) => {
                                const item = portfolioData[i];
                                return {
                                    text: `${label} (${item?.percentage?.toFixed(1)}%)`,
                                    fillStyle: item?.color,
                                    fontColor: '#ffffff',
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                        return [];
                    }
                }
            },
            tooltip: {
                backgroundColor: '#1a1f2a',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: '#2e3444',
                borderWidth: 1,
                callbacks: {
                    label: function (context) {
                        const item = portfolioData[context.dataIndex];
                        const percentage = item?.percentage?.toFixed(2) || '0.00';
                        const value = new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                        }).format(item?.usd_value || 0);

                        const balance = item?.balance ?
                            `${item.balance.toLocaleString()} ${item.cryptocurrency}` :
                            `0 ${item?.cryptocurrency}`;

                        return [
                            `${item?.cryptocurrency}: ${percentage}%`,
                            `Value: ${value}`,
                            `Balance: ${balance}`
                        ];
                    }
                }
            }
        }
    };

    if (isLoading) {
        return (
            <div className="portfolio-chart-container">
                <h3>Portfolio Distribution</h3>
                <div className="portfolio-chart-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading portfolio data...</p>
                </div>
            </div>
        );
    }

    if (!portfolioData || portfolioData.length === 0) {
        return (
            <div className="portfolio-chart-container">
                <h3>Portfolio Distribution</h3>
                <div className="portfolio-chart-empty">
                    <div className="empty-icon">📊</div>
                    <h4>No Portfolio Data</h4>
                    <p>Start investing to see your portfolio distribution</p>
                    <button
                        className="get-started-btn"
                        onClick={() => window.location.href = '/deposit'}
                    >
                        Get Started
                    </button>
                </div>
            </div>
        );
    }

    const totalValue = portfolioData.reduce((sum, item) => sum + (item.usd_value || 0), 0);

    return (
        <div className="portfolio-chart-container">
            <div className="chart-header">
                <h3>Portfolio Distribution</h3>
                <div className="chart-meta">
                    <div className="total-value">
                        Total Value: {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                        }).format(totalValue)}
                    </div>
                    {lastUpdate && (
                        <div className="last-update">
                            Last updated: {lastUpdate.toLocaleTimeString()}
                        </div>
                    )}
                </div>
            </div>
            <div className="chart-wrapper">
                <Pie data={chartData} options={chartOptions} />
            </div>
            <div className="portfolio-summary">
                <h4>Holdings Summary</h4>
                <div className="holdings-list">
                    {portfolioData.map((item, index) => (
                        <div key={index} className="holding-item">
                            <div className="holding-color" style={{ backgroundColor: item.color }}></div>
                            <div className="holding-info">
                                <span className="holding-crypto">{item.cryptocurrency}</span>
                                <span className="holding-percentage">{item.percentage.toFixed(1)}%</span>
                                <span className="holding-value">
                                    {new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: 'USD'
                                    }).format(item.usd_value)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PortfolioChart;