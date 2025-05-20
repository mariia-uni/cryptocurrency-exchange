// @generated automatically by Diesel CLI.

diesel::table! {
    password_reset_tokens (id) {
        id -> Int4,
        user_id -> Int4,
        token -> Varchar,
        created_at -> Timestamp,
        expires_at -> Timestamp,
        used -> Bool,
    }
}

diesel::table! {
    user_verifications (id) {
        id -> Int4,
        user_id -> Int4,
        #[max_length = 255]
        first_name -> Varchar,
        #[max_length = 255]
        last_name -> Varchar,
        dob_day -> Int4,
        dob_month -> Int4,
        dob_year -> Int4,
        #[max_length = 255]
        street_address -> Varchar,
        #[max_length = 255]
        apartment -> Nullable<Varchar>,
        #[max_length = 255]
        city -> Varchar,
        #[max_length = 50]
        postal_code -> Varchar,
        #[max_length = 10]
        country_code -> Varchar,
        #[max_length = 50]
        phone_number -> Varchar,
        #[max_length = 255]
        occupation -> Varchar,
        #[max_length = 50]
        verification_status -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        #[max_length = 255]
        id_front_path -> Nullable<Varchar>,
        #[max_length = 50]
        id_verification_status -> Varchar,
        id_verified_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    users (id) {
        id -> Int4,
        #[max_length = 255]
        username -> Varchar,
        #[max_length = 255]
        email -> Varchar,
        #[max_length = 255]
        password -> Varchar,
        created_at -> Timestamptz,
        is_admin -> Bool,
    }
}

diesel::table! {
    wallet_addresses (id) {
        id -> Int4,
        wallet_id -> Int8,
        #[max_length = 10]
        cryptocurrency -> Varchar,
        #[max_length = 100]
        address -> Varchar,
        created_at -> Timestamp,
    }
}

diesel::table! {
    wallet_balances (id) {
        id -> Int4,
        wallet_id -> Int8,
        #[max_length = 10]
        cryptocurrency -> Varchar,
        balance -> Numeric,
        last_updated -> Timestamp,
    }
}

diesel::table! {
    wallets (wallet_id) {
        wallet_id -> Int8,
        user_id -> Int4,
        #[max_length = 15]
        wallet_type -> Varchar,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        #[max_length = 10]
        status -> Varchar,
        #[max_length = 100]
        name -> Varchar,
    }
}

diesel::joinable!(password_reset_tokens -> users (user_id));
diesel::joinable!(user_verifications -> users (user_id));
diesel::joinable!(wallet_addresses -> wallets (wallet_id));
diesel::joinable!(wallet_balances -> wallets (wallet_id));
diesel::joinable!(wallets -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    password_reset_tokens,
    user_verifications,
    users,
    wallet_addresses,
    wallet_balances,
    wallets,
);
