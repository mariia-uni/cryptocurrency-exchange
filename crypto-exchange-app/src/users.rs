use actix_web::{HttpRequest, HttpResponse, get, web};
use diesel::prelude::*;
use log::error;
use serde::Serialize;

use crate::auth;
use crate::db::DbPool;
use crate::models::User;
use crate::schema::users;

#[derive(Serialize)]
pub struct UserSearchResponse {
    pub id: i32,
    pub username: String,
    pub email: String,
}

// Search for users
#[get("/search")]
pub async fn search_users(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract user_id from JWT token to ensure only authenticated users can search
    let _user_id = auth::extract_user_id(&req)?;

    // Get search query
    let search_query = match query.get("query") {
        Some(q) => q,
        None => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Search query is required"
            })));
        }
    };

    if search_query.len() < 2 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Search query must be at least 2 characters"
        })));
    }

    let mut conn = pool.get().map_err(|_| {
        error!("Failed to get database connection");
        actix_web::error::ErrorInternalServerError("Database connection error")
    })?;

    // Use only username and email for search
    let search_pattern = format!("%{}%", search_query);
    let search_pattern_clone = search_pattern.clone();

    let users_result = web::block(move || {
        users::table
            .filter(
                users::username
                    .like(&search_pattern)
                    .or(users::email.like(&search_pattern_clone)),
            )
            .limit(10) // Limit to 10 results
            .load::<User>(&mut conn)
    })
    .await
    .map_err(|e| {
        error!("Database error: {:?}", e);
        actix_web::error::ErrorInternalServerError("Error searching users")
    })?;

    match users_result {
        Ok(users) => {
            // Transform to response format, excluding sensitive fields
            let user_responses: Vec<UserSearchResponse> = users
                .into_iter()
                .map(|user| UserSearchResponse {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                })
                .collect();

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "users": user_responses
            })))
        }
        Err(e) => {
            error!("Error loading users: {:?}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to search users"
            })))
        }
    }
}

// Configure routes
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/api/users").service(search_users));
}
