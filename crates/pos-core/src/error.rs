use thiserror::Error;

#[derive(Error, Debug)]
pub enum PosError {
    #[error("Database error: {0}")]
    Db(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Business rule violation: {0}")]
    BusinessRule(String),

    #[error("Negative stock blocked for variant '{variant_id}': requested deduction {requested_milli} milli-units, but only {available_milli} milli-units available")]
    NegativeStockBlocked {
        variant_id: String,
        requested_milli: i64,
        available_milli: i64,
    },
}

pub type Result<T> = std::result::Result<T, PosError>;
