use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Role {
    Owner,
    Manager,
    Cashier,
    StockKeeper,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Manager => "manager",
            Self::Cashier => "cashier",
            Self::StockKeeper => "stock_keeper",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "owner" => Some(Self::Owner),
            "manager" => Some(Self::Manager),
            "cashier" => Some(Self::Cashier),
            "stock_keeper" | "stockkeeper" => Some(Self::StockKeeper),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Permission {
    SalesCreate,
    SalesDiscount,
    SalesVoid,
    SalesReturn,
    PriceEdit,
    InventoryAdjust,
    PurchaseEntry,
    ReportsView,
    SettingsManage,
    BackupManage,
}

impl Role {
    pub fn permissions(&self) -> Vec<Permission> {
        match self {
            Role::Owner => vec![
                Permission::SalesCreate,
                Permission::SalesDiscount,
                Permission::SalesVoid,
                Permission::SalesReturn,
                Permission::PriceEdit,
                Permission::InventoryAdjust,
                Permission::PurchaseEntry,
                Permission::ReportsView,
                Permission::SettingsManage,
                Permission::BackupManage,
            ],
            Role::Manager => vec![
                Permission::SalesCreate,
                Permission::SalesDiscount,
                Permission::SalesVoid,
                Permission::SalesReturn,
                Permission::PriceEdit,
                Permission::InventoryAdjust,
                Permission::PurchaseEntry,
                Permission::ReportsView,
            ],
            Role::Cashier => vec![
                Permission::SalesCreate,
                Permission::SalesReturn,
            ],
            Role::StockKeeper => vec![
                Permission::InventoryAdjust,
                Permission::PurchaseEntry,
            ],
        }
    }

    pub fn can(&self, perm: Permission) -> bool {
        self.permissions().contains(&perm)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub user_id: String,
    pub username: String,
    pub role: Role,
    pub session_token: String,
    pub opened_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl UserSession {
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }

    pub fn has_permission(&self, perm: Permission) -> bool {
        !self.is_expired() && self.role.can(perm)
    }
}
