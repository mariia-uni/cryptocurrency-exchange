use actix_web::web;
use bigdecimal::{BigDecimal, FromPrimitive};
use log::{error, info};
use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use std::{env, collections::HashMap, sync::Mutex};
use once_cell::sync::Lazy;
use std::time::{Duration, Instant};

// Cache structure to store prices and reduce API calls
struct PriceCache {
    prices: HashMap<String, (f64, Instant)>, // symbol -> (price, timestamp)
    last_update: Instant,
}

// Global cache with 5-minute expiry
static PRICE_CACHE: Lazy<Mutex<PriceCache>> = Lazy::new(|| {
    Mutex::new(PriceCache {
        prices: HashMap::new(),
        last_update: Instant::now(),
    })
});

// Response from CoinMarketCap API
#[derive(Deserialize, Debug)]
struct CoinMarketCapResponse {
    data: HashMap<String, CoinData>,
    status: Status,
}

#[derive(Deserialize, Debug)]
struct CoinData {
    id: u64,
    name: String,
    symbol: String,
    quote: Quote,
}

#[derive(Deserialize, Debug)]
struct Quote {
    #[serde(rename = "USD")]
    usd: UsdQuote,
}

#[derive(Deserialize, Debug)]
struct UsdQuote {
    price: f64,
    percent_change_24h: f64,
    market_cap: f64,
    volume_24h: f64,
}

#[derive(Deserialize, Debug)]
struct Status {
    timestamp: String,
    error_code: u32,
    error_message: Option<String>,
}

// Public function to get current price of a cryptocurrency in USD
pub async fn get_current_price(symbol: &str) -> Result<f64, String> {
    let cache_duration = Duration::from_secs(300); // 5 minutes
    
    // Try to get from cache first
    {
        let cache = PRICE_CACHE.lock().unwrap();
        if let Some((price, timestamp)) = cache.prices.get(symbol) {
            if timestamp.elapsed() < cache_duration {
                return Ok(*price);
            }
        }
    }
    
    // Not in cache or expired, fetch fresh data
    match fetch_prices(&[symbol]).await {
        Ok(prices) => {
            if let Some(price) = prices.get(symbol) {
                Ok(*price)
            } else {
                Err(format!("Price for {} not found in API response", symbol))
            }
        }
        Err(e) => Err(e),
    }
}

// Batch fetch prices for multiple symbols at once
pub async fn get_prices(symbols: &[&str]) -> Result<HashMap<String, f64>, String> {
    let cache_duration = Duration::from_secs(300); // 5 minutes
    let mut symbols_to_fetch = Vec::new();
    
    // Check cache first
    {
        let cache = PRICE_CACHE.lock().unwrap();
        for &symbol in symbols {
            if let Some((_, timestamp)) = cache.prices.get(symbol) {
                if timestamp.elapsed() >= cache_duration {
                    symbols_to_fetch.push(symbol);
                }
            } else {
                symbols_to_fetch.push(symbol);
            }
        }
        
        // If all prices are in cache and fresh
        if symbols_to_fetch.is_empty() {
            let mut result = HashMap::new();
            for &symbol in symbols {
                if let Some((price, _)) = cache.prices.get(symbol) {
                    result.insert(symbol.to_string(), *price);
                }
            }
            return Ok(result);
        }
    }
    
    // Fetch missing or expired prices
    match fetch_prices(&symbols_to_fetch).await {
        Ok(prices) => {
            // Combine with cache
            let mut result = HashMap::new();
            {
                let cache = PRICE_CACHE.lock().unwrap();
                for &symbol in symbols {
                    if let Some((price, _)) = cache.prices.get(symbol) {
                        result.insert(symbol.to_string(), *price);
                    } else if let Some(price) = prices.get(symbol) {
                        result.insert(symbol.to_string(), *price);
                    }
                }
            }
            Ok(result)
        }
        Err(e) => Err(e),
    }
}

// Internal function to make API call to CoinMarketCap
async fn fetch_prices(symbols: &[&str]) -> Result<HashMap<String, f64>, String> {
    let api_key = env::var("COINMARKETCAP_API_KEY")
        .map_err(|_| "COINMARKETCAP_API_KEY not found in environment variables".to_string())?;
    
    let client = Client::new();
    let symbols_str = symbols.join(",");
    
    let url = format!(
        "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol={}",
        symbols_str
    );
    
    let response = client
        .get(&url)
        .header(header::ACCEPT, "application/json")
        .header("X-CMC_PRO_API_KEY", api_key)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;
    
    // Check status code without consuming the response
    let status = response.status();
    if !status.is_success() {
        // Only consume the response body if there was an error
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("API error: {} - {}", status, error_text));
    }
    
    // If status is successful, we can safely consume the response body
    let cmc_response: CoinMarketCapResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;
    
    if cmc_response.status.error_code != 0 {
        return Err(format!("API error: {}", 
            cmc_response.status.error_message.unwrap_or_else(|| "Unknown error".into())));
    }
    
    // Extract prices and update cache
    let mut result = HashMap::new();
    let mut cache = PRICE_CACHE.lock().unwrap();
    
    for &symbol in symbols {
        if let Some(coin_data) = cmc_response.data.get(symbol) {
            let price = coin_data.quote.usd.price;
            result.insert(symbol.to_string(), price);
            cache.prices.insert(symbol.to_string(), (price, Instant::now()));
        }
    }
    
    cache.last_update = Instant::now();
    Ok(result)
}

// Convert cryptocurrency amount to USD
pub async fn convert_to_usd(amount: &BigDecimal, symbol: &str) -> Result<BigDecimal, String> {
    let price = get_current_price(symbol).await?;
    
    // Convert amount (crypto) to USD
    let amount_f64 = amount.to_string().parse::<f64>().map_err(|e| {
        format!("Failed to parse BigDecimal amount: {}", e)
    })?;
    
    let usd_value = amount_f64 * price;
    BigDecimal::from_f64(usd_value)
        .ok_or_else(|| "Failed to convert USD value to BigDecimal".to_string())
}

// Initialize pricing module
pub async fn init() -> Result<(), String> {
    // Fetch initial prices for common cryptocurrencies to populate cache
    let common_cryptos = ["BTC", "ETH", "USDT", "BNB", "XRP", "SOL", "ADA", "DOGE"];
    match fetch_prices(&common_cryptos).await {
        Ok(_) => {
            info!("Initial cryptocurrency prices loaded successfully");
            Ok(())
        },
        Err(e) => {
            error!("Failed to load initial cryptocurrency prices: {}", e);
            Err(e)
        }
    }
}