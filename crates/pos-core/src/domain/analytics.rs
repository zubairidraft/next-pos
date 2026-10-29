//! Offline financial analytics, profit & loss, department performance, and inventory valuation.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::PosError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialSummary {
    pub start_date: String,
    pub end_date: String,
    pub gross_sales_paisa: i64,
    pub discounts_paisa: i64,
    pub tax_paisa: i64,
    pub net_sales_paisa: i64,
    pub cogs_paisa: i64,
    pub gross_profit_paisa: i64,
    pub gross_margin_percent: f64,
    pub sales_count: usize,
    pub total_units_sold_milli: i64,
    pub average_ticket_paisa: i64,
    pub tender_breakdown: Vec<(String, i64)>, // (method, amount_paisa)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryPerformance {
    pub category_id: String,
    pub category_name: String,
    pub category_name_ur: Option<String>,
    pub qty_sold_milli: i64,
    pub revenue_paisa: i64,
    pub cogs_paisa: i64,
    pub gross_profit_paisa: i64,
    pub gross_margin_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopProduct {
    pub variant_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub qty_sold_milli: i64,
    pub revenue_paisa: i64,
    pub cogs_paisa: i64,
    pub gross_profit_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryValuation {
    pub total_variants_count: usize,
    pub total_stock_milli: i64,
    pub total_cost_valuation_paisa: i64,
    pub total_retail_valuation_paisa: i64,
    pub potential_profit_paisa: i64,
}

pub struct AnalyticsRepo;

impl AnalyticsRepo {
    /// Compute financial performance (revenue, COGS, gross margin, tickets) for a date range
    pub fn get_financial_summary(
        conn: &Connection,
        start_date: &str,
        end_date: &str,
    ) -> Result<FinancialSummary, PosError> {
        let (gross_sales, discounts, tax, net_sales, sales_count): (i64, i64, i64, i64, usize) = conn
            .query_row(
                "SELECT COALESCE(SUM(subtotal_paisa), 0),
                        COALESCE(SUM(discount_paisa), 0),
                        COALESCE(SUM(tax_paisa), 0),
                        COALESCE(SUM(total_paisa), 0),
                        COUNT(*)
                 FROM sales
                 WHERE status = 'posted' AND created_at >= ?1 AND created_at <= ?2",
                params![start_date, end_date],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap_or((0, 0, 0, 0, 0));

        let (cogs, total_units_sold): (i64, i64) = conn
            .query_row(
                "SELECT COALESCE(SUM(sl.cogs_paisa), 0),
                        COALESCE(SUM(sl.qty_milli), 0)
                 FROM sale_lines sl
                 JOIN sales s ON sl.sale_id = s.id
                 WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2",
                params![start_date, end_date],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((0, 0));

        let gross_profit = net_sales - cogs;
        let gross_margin_percent = if net_sales > 0 {
            (gross_profit as f64 / net_sales as f64) * 100.0
        } else {
            0.0
        };

        let average_ticket = if sales_count > 0 {
            net_sales / sales_count as i64
        } else {
            0
        };

        // Query tender breakdown
        let mut stmt = conn
            .prepare(
                "SELECT method, COALESCE(SUM(amount_paisa), 0)
                 FROM payments
                 WHERE direction = 'inbound' AND occurred_at >= ?1 AND occurred_at <= ?2
                 GROUP BY method
                 ORDER BY SUM(amount_paisa) DESC",
            )
            .map_err(|e| PosError::Db(format!("Failed to query payment breakdown: {}", e)))?;

        let tender_rows = stmt
            .query_map(params![start_date, end_date], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(|e| PosError::Db(e.to_string()))?
            .filter_map(std::result::Result::ok)
            .collect();

        Ok(FinancialSummary {
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
            gross_sales_paisa: gross_sales,
            discounts_paisa: discounts,
            tax_paisa: tax,
            net_sales_paisa: net_sales,
            cogs_paisa: cogs,
            gross_profit_paisa: gross_profit,
            gross_margin_percent,
            sales_count,
            total_units_sold_milli: total_units_sold,
            average_ticket_paisa: average_ticket,
            tender_breakdown: tender_rows,
        })
    }

    /// Query sales and gross profit aggregated by product category
    pub fn get_category_performance(
        conn: &Connection,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<CategoryPerformance>, PosError> {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(c.id, 'uncategorized') as cat_id,
                        COALESCE(c.name, 'General') as cat_name,
                        c.name_ur as cat_name_ur,
                        COALESCE(SUM(sl.qty_milli), 0) as qty_sold,
                        COALESCE(SUM(sl.total_paisa), 0) as revenue,
                        COALESCE(SUM(sl.cogs_paisa), 0) as cogs
                 FROM sale_lines sl
                 JOIN sales s ON sl.sale_id = s.id
                 JOIN product_variants pv ON sl.variant_id = pv.id
                 JOIN products p ON pv.product_id = p.id
                 LEFT JOIN categories c ON p.category_id = c.id
                 WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2
                 GROUP BY c.id
                 ORDER BY revenue DESC",
            )
            .map_err(|e| PosError::Db(format!("Failed to prepare category performance query: {}", e)))?;

        let rows = stmt
            .query_map(params![start_date, end_date], |r| {
                let revenue: i64 = r.get(4)?;
                let cogs: i64 = r.get(5)?;
                let gross_profit = revenue - cogs;
                let margin_pct = if revenue > 0 {
                    (gross_profit as f64 / revenue as f64) * 100.0
                } else {
                    0.0
                };

                Ok(CategoryPerformance {
                    category_id: r.get(0)?,
                    category_name: r.get(1)?,
                    category_name_ur: r.get(2)?,
                    qty_sold_milli: r.get(3)?,
                    revenue_paisa: revenue,
                    cogs_paisa: cogs,
                    gross_profit_paisa: gross_profit,
                    gross_margin_percent: margin_pct,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(result)
    }

    /// Query the top N selling products by revenue
    pub fn get_top_products(
        conn: &Connection,
        start_date: &str,
        end_date: &str,
        limit: usize,
    ) -> Result<Vec<TopProduct>, PosError> {
        let mut stmt = conn
            .prepare(
                "SELECT pv.id, p.sku, p.name, p.name_ur,
                        COALESCE(SUM(sl.qty_milli), 0) as qty_sold,
                        COALESCE(SUM(sl.total_paisa), 0) as revenue,
                        COALESCE(SUM(sl.cogs_paisa), 0) as cogs
                 FROM sale_lines sl
                 JOIN sales s ON sl.sale_id = s.id
                 JOIN product_variants pv ON sl.variant_id = pv.id
                 JOIN products p ON pv.product_id = p.id
                 WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2
                 GROUP BY pv.id
                 ORDER BY revenue DESC
                 LIMIT ?3",
            )
            .map_err(|e| PosError::Db(format!("Failed to prepare top products query: {}", e)))?;

        let rows = stmt
            .query_map(params![start_date, end_date, limit as i64], |r| {
                let revenue: i64 = r.get(5)?;
                let cogs: i64 = r.get(6)?;
                Ok(TopProduct {
                    variant_id: r.get(0)?,
                    sku: r.get(1)?,
                    name: r.get(2)?,
                    name_ur: r.get(3)?,
                    qty_sold_milli: r.get(4)?,
                    revenue_paisa: revenue,
                    cogs_paisa: cogs,
                    gross_profit_paisa: revenue - cogs,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(result)
    }

    /// Calculate total stock valuation at moving-average cost and potential retail value
    pub fn get_inventory_valuation(conn: &Connection) -> Result<InventoryValuation, PosError> {
        let (variants_count, total_stock, total_cost_val): (usize, i64, i64) = conn
            .query_row(
                "SELECT COUNT(*),
                        COALESCE(SUM(on_hand_milli), 0),
                        COALESCE(SUM((on_hand_milli * avg_cost_paisa) / 1000), 0)
                 FROM inventory_balances
                 WHERE on_hand_milli > 0",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap_or((0, 0, 0));

        let total_retail_val: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM((ib.on_hand_milli * pr.price_paisa) / 1000), 0)
                 FROM inventory_balances ib
                 JOIN prices pr ON ib.variant_id = pr.variant_id
                 WHERE ib.on_hand_milli > 0",
                [],
                |r| r.get(0),
            )
            .unwrap_or(total_cost_val);

        Ok(InventoryValuation {
            total_variants_count: variants_count,
            total_stock_milli: total_stock,
            total_cost_valuation_paisa: total_cost_val,
            total_retail_valuation_paisa: total_retail_val,
            potential_profit_paisa: std::cmp::max(0, total_retail_val - total_cost_val),
        })
    }
}
