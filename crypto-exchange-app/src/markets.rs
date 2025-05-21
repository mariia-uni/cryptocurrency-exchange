use crate::db::DbPool;
use crate::models::{Cryptocurrency, CryptocurrencyResponse, NewCryptocurrency};
use crate::schema::cryptocurrencies;
use actix_web::{HttpResponse, Responder, get, web};
use diesel::prelude::*;
use diesel::upsert::excluded;
// Add this import for ExpressionMethods
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::env;

/// Structure to represent CoinMarketCap API response
#[derive(Deserialize, Debug)]
pub struct CoinMarketCapResponse {
    status: Status,
    data: Vec<CryptoCurrency>,
}

#[derive(Deserialize, Debug)]
pub struct Status {
    timestamp: String,
    error_code: i32,
    error_message: Option<String>,
    elapsed: i32,
    credit_count: i32,
}

#[derive(Deserialize, Debug)]
pub struct CryptoCurrency {
    id: i32,
    name: String,
    symbol: String,
    slug: String,
    cmc_rank: i32,
    quote: Quote,
}

#[derive(Deserialize, Debug)]
pub struct Quote {
    USD: UsdQuote,
}

#[derive(Deserialize, Debug)]
pub struct UsdQuote {
    price: f64,
    volume_24h: f64,
    percent_change_1h: f64,
    percent_change_24h: f64,
    percent_change_7d: f64,
    market_cap: f64,
    last_updated: String,
}

/// Structure for our API response
#[derive(Serialize)]
pub struct MarketsResponse {
    cryptocurrencies: Vec<CryptoCurrencyResponse>,
    last_updated: String,
}

#[derive(Serialize)]
pub struct CryptoCurrencyResponse {
    id: i32,
    name: String,
    symbol: String,
    price: f64,
    market_cap: f64,
    volume_24h: f64,
    percent_change_1h: f64,
    percent_change_24h: f64,
    percent_change_7d: f64,
}

/// Fetches the latest cryptocurrency listings from CoinMarketCap
///
/// This endpoint retrieves cryptocurrency data from CoinMarketCap's API
/// using the API key stored in the environment variables. It formats the
/// data for the frontend to display in the markets table.
///
/// # Returns
/// A JSON response with an array of cryptocurrencies and their market data
#[get("/api/markets")]
pub async fn get_markets() -> impl Responder {
    match fetch_coinmarketcap_data().await {
        Ok(cmc_data) => {
            // Transform the data for frontend
            let cryptocurrencies = cmc_data
                .data
                .iter()
                .map(|crypto| CryptoCurrencyResponse {
                    id: crypto.id,
                    name: crypto.name.clone(),
                    symbol: crypto.symbol.clone(),
                    price: crypto.quote.USD.price,
                    market_cap: crypto.quote.USD.market_cap,
                    volume_24h: crypto.quote.USD.volume_24h,
                    percent_change_1h: crypto.quote.USD.percent_change_1h,
                    percent_change_24h: crypto.quote.USD.percent_change_24h,
                    percent_change_7d: crypto.quote.USD.percent_change_7d,
                })
                .collect();

            // Return successful response
            HttpResponse::Ok().json(MarketsResponse {
                cryptocurrencies,
                last_updated: cmc_data.status.timestamp,
            })
        }
        Err(e) => {
            error!("Failed to fetch cryptocurrency data: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch cryptocurrency data"
            }))
        }
    }
}

/// Synchronizes cryptocurrency data from CoinMarketCap API with our database
pub async fn sync_cryptocurrencies(
    pool: &web::Data<DbPool>,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting cryptocurrency synchronization with CoinMarketCap");

    // Fetch data from CoinMarketCap
    let response = match fetch_coinmarketcap_data().await {
        Ok(resp) => resp,
        Err(e) => {
            error!("Failed to fetch cryptocurrency data: {}", e);
            return Err(e);
        }
    };

    // Process each cryptocurrency
    for crypto in response.data.iter() {
        let symbol = crypto.symbol.clone();
        let name = crypto.name.clone();
        let cmc_id = crypto.id;

        // Get a new connection for each cryptocurrency
        let pool_clone = pool.clone();

        // Insert or update in our database
        web::block(move || -> Result<(), diesel::result::Error> {
            let mut conn = match pool_clone.get() {
                Ok(conn) => conn,
                Err(e) => {
                    // Log the connection error
                    error!("Database connection error: {}", e);
                    // Convert r2d2 error to diesel error using an appropriate variant
                    return Err(diesel::result::Error::DatabaseError(
                        diesel::result::DatabaseErrorKind::UnableToSendCommand,
                        Box::new(format!("Connection error: {}", e)),
                    ));
                }
            };

            diesel::insert_into(cryptocurrencies::table)
                .values(NewCryptocurrency {
                    symbol,
                    name,
                    cmc_id,
                    is_active: true,
                    icon_url: None, // We could fetch icons separately
                })
                .on_conflict(cryptocurrencies::symbol)
                .do_update()
                .set((
                    cryptocurrencies::name.eq(excluded(cryptocurrencies::name)),
                    cryptocurrencies::cmc_id.eq(excluded(cryptocurrencies::cmc_id)),
                    cryptocurrencies::last_updated.eq(diesel::dsl::now),
                ))
                .execute(&mut conn)?;

            Ok(())
        })
        .await?;
    }

    // Update cryptocurrency icons
    if let Err(e) = update_cryptocurrency_icons(pool).await {
        error!("Failed to update cryptocurrency icons: {}", e);
        // Continue execution - icon failure shouldn't stop the whole sync
    }

    info!("Cryptocurrency synchronization completed successfully");
    Ok(())
}

/// Endpoint to retrieve all available cryptocurrencies
#[get("/api/cryptocurrencies")]
pub async fn get_cryptocurrencies(pool: web::Data<DbPool>) -> impl Responder {
    let mut conn = match pool.get() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to get database connection: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database connection error"
            }));
        }
    };

    // Query all active cryptocurrencies
    let cryptos = match web::block(move || {
        use crate::schema::cryptocurrencies::dsl::*;
        cryptocurrencies
            .filter(is_active.eq(true))
            .order_by(symbol.asc()) // Sort by symbol
            .load::<Cryptocurrency>(&mut conn)
    })
    .await
    {
        Ok(Ok(result)) => result,
        _ => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch cryptocurrencies"
            }));
        }
    };

    // Transform to API response format
    let crypto_responses: Vec<CryptocurrencyResponse> = cryptos
        .into_iter()
        .map(|c| CryptocurrencyResponse {
            symbol: c.symbol,
            name: c.name,
            icon_url: c.icon_url,
            is_active: c.is_active,
        })
        .collect();

    HttpResponse::Ok().json(serde_json::json!({
        "cryptocurrencies": crypto_responses,
        "count": crypto_responses.len()
    }))
}

// Update the function to handle batch processing more efficiently
async fn update_cryptocurrency_icons(
    pool: &web::Data<DbPool>,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Updating cryptocurrency icons");

    // Get a database connection
    let mut conn = pool.get()?;

    // Get all active cryptocurrencies
    let cryptos = web::block(move || {
        use crate::schema::cryptocurrencies::dsl::*;
        cryptocurrencies
            .filter(is_active.eq(true))
            .filter(icon_url.is_null()) // Only fetch those without icons
            .load::<Cryptocurrency>(&mut conn)
    })
    .await??;

    if cryptos.is_empty() {
        info!("No cryptocurrencies need icon updates");
        return Ok(());
    }

    // CoinMarketCap API endpoint for metadata (including logos)
    let api_key = env::var("COINMARKETCAP_API_KEY")?;
    let client = reqwest::Client::new();

    // Process cryptocurrencies in batches of 100 (API limit)
    for chunk in cryptos.chunks(100) {
        // Create comma-separated list of CMC IDs
        let cmc_ids: Vec<String> = chunk.iter().map(|c| c.cmc_id.to_string()).collect();
        let id_list = cmc_ids.join(",");

        // Request cryptocurrency metadata
        let response = client
            .get("https://pro-api.coinmarketcap.com/v1/cryptocurrency/info")
            .query(&[("id", &id_list)])
            .header("X-CMC_PRO_API_KEY", &api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            error!("API error: {}", response.status());
            continue;
        }

        // Parse the response
        let metadata: serde_json::Value = response.json().await?;

        // Process each cryptocurrency
        if let Some(data) = metadata.get("data").and_then(|d| d.as_object()) {
            for crypto in chunk {
                if let Some(crypto_data) = data
                    .get(&crypto.cmc_id.to_string())
                    .and_then(|d| d.as_object())
                {
                    if let Some(logo) = crypto_data.get("logo").and_then(|l| l.as_str()) {
                        // Update the icon URL in the database
                        let mut conn = pool.get()?;
                        let cmc_id = crypto.cmc_id;
                        let logo_url = logo.to_string();

                        web::block(move || {
                            use crate::schema::cryptocurrencies::dsl::*;
                            diesel::update(cryptocurrencies.filter(cmc_id.eq(cmc_id)))
                                .set(icon_url.eq(logo_url))
                                .execute(&mut conn)
                        })
                        .await??;
                    }
                }
            }
        }

        // Add a delay to avoid rate limits
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    info!("Cryptocurrency icons update completed");
    Ok(())
}

/// Fetches cryptocurrency data from CoinMarketCap API
///
/// This function handles the common logic for fetching data from CoinMarketCap
/// to be used by different endpoints and background tasks.
///
/// # Returns
/// A Result containing the CoinMarketCap API response or an error
pub async fn fetch_coinmarketcap_data() -> Result<CoinMarketCapResponse, Box<dyn std::error::Error>>
{
    // Get API key from environment variables
    let api_key = env::var("COINMARKETCAP_API_KEY")?;

    // Create client with API key header
    let client = reqwest::Client::new();

    // Make API request to CoinMarketCap - update limit to 100
    let response = client
        .get("https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest")
        .query(&[("limit", "100"), ("convert", "USD")])
        .header("X-CMC_PRO_API_KEY", api_key)
        .send()
        .await?;

    // Check if response is successful
    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("CoinMarketCap API returned error status: {}", status).into());
    }

    // Parse the response
    let cmc_data = response.json::<CoinMarketCapResponse>().await?;

    info!(
        "Successfully fetched data for {} cryptocurrencies",
        cmc_data.data.len()
    );

    Ok(cmc_data)
}
