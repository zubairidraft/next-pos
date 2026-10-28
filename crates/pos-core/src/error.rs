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
}

pub type Result<T> = std::result::Result<T, PosError>;
