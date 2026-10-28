pub mod db;
pub mod domain;
pub mod error;
pub mod money;

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
