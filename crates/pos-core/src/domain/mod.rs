use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessSettings {
    pub name: String,
    pub name_ur: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub ntn: Option<String>,
    pub strn: Option<String>,
    pub currency: String,
    pub time_zone: String,
    pub tax_mode: String,
    pub negative_stock_policy: String,
    pub enabled_packs: Vec<String>,
    pub fbr_enabled: bool,
}
