pub mod app;
pub mod auth;
pub mod backup;
pub mod branches;
pub mod db;
pub mod domain;
pub mod error;
pub mod hardware;
pub mod licensing;
pub mod money;
pub use app::history;

pub fn pos_core_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pos_core_version() {
        assert_eq!(pos_core_version(), "0.1.0");
    }
}
