use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::{PosError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Party {
    pub id: String,
    pub party_type: String, // 'customer', 'vendor', 'both'
    pub name: String,
    pub name_ur: Option<String>,
    pub phone: Option<String>,
    pub cnic: Option<String>,
    pub ntn: Option<String>,
    pub credit_limit_paisa: i64,
    pub opening_balance_paisa: i64,
    pub price_list_id: Option<String>,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePartyParams {
    pub party_type: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub phone: Option<String>,
    pub cnic: Option<String>,
    pub ntn: Option<String>,
    pub credit_limit_paisa: i64,
    pub opening_balance_paisa: i64,
    pub price_list_id: Option<String>,
}

pub struct PartyRepo;

impl PartyRepo {
    /// Creates a new party (vendor, customer, or both).
    pub fn create_party(conn: &Connection, params: CreatePartyParams) -> Result<Party> {
        let name = params.name.trim();
        if name.is_empty() {
            return Err(PosError::Validation("Party name cannot be empty".to_string()));
        }

        let now = Utc::now().to_rfc3339();
        let party_id = Ulid::new().to_string();

        conn.execute(
            "INSERT INTO parties (
                id, party_type, name, name_ur, phone, cnic, ntn,
                credit_limit_paisa, opening_balance_paisa, price_list_id, active, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12)",
            params![
                party_id,
                params.party_type,
                name,
                params.name_ur,
                params.phone,
                params.cnic,
                params.ntn,
                params.credit_limit_paisa,
                params.opening_balance_paisa,
                params.price_list_id,
                now,
                now,
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert party: {}", e)))?;

        Ok(Party {
            id: party_id,
            party_type: params.party_type,
            name: name.to_string(),
            name_ur: params.name_ur,
            phone: params.phone,
            cnic: params.cnic,
            ntn: params.ntn,
            credit_limit_paisa: params.credit_limit_paisa,
            opening_balance_paisa: params.opening_balance_paisa,
            price_list_id: params.price_list_id,
            active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Fetches all active vendors.
    pub fn list_vendors(conn: &Connection) -> Result<Vec<Party>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, party_type, name, name_ur, phone, cnic, ntn,
                        credit_limit_paisa, opening_balance_paisa, price_list_id, active,
                        created_at, updated_at
                 FROM parties
                 WHERE active = 1 AND party_type IN ('vendor', 'both')
                 ORDER BY name ASC",
            )
            .map_err(|e| PosError::Db(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let active_int: i32 = row.get(10)?;
                Ok(Party {
                    id: row.get(0)?,
                    party_type: row.get(1)?,
                    name: row.get(2)?,
                    name_ur: row.get(3)?,
                    phone: row.get(4)?,
                    cnic: row.get(5)?,
                    ntn: row.get(6)?,
                    credit_limit_paisa: row.get(7)?,
                    opening_balance_paisa: row.get(8)?,
                    price_list_id: row.get(9)?,
                    active: active_int == 1,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(list)
    }

    /// Fetches a party by ID.
    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Party> {
        conn.query_row(
            "SELECT id, party_type, name, name_ur, phone, cnic, ntn,
                    credit_limit_paisa, opening_balance_paisa, price_list_id, active,
                    created_at, updated_at
             FROM parties
             WHERE id = ?1",
            params![id],
            |row| {
                let active_int: i32 = row.get(10)?;
                Ok(Party {
                    id: row.get(0)?,
                    party_type: row.get(1)?,
                    name: row.get(2)?,
                    name_ur: row.get(3)?,
                    phone: row.get(4)?,
                    cnic: row.get(5)?,
                    ntn: row.get(6)?,
                    credit_limit_paisa: row.get(7)?,
                    opening_balance_paisa: row.get(8)?,
                    price_list_id: row.get(9)?,
                    active: active_int == 1,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => PosError::NotFound(format!("Party {} not found", id)),
            other => PosError::Db(other.to_string()),
        })
    }
}
