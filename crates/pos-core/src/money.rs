use serde::{Deserialize, Serialize};
use std::fmt;
use std::iter::Sum;
use std::ops::{Add, AddAssign, Neg, Sub, SubAssign};

/// Money represented as an integer number of Paisa (1 PKR = 100 Paisa).
/// Strictly avoids any floating point representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub struct Paisa(pub i64);

impl Paisa {
    pub const ZERO: Self = Self(0);

    pub fn from_rupees(rupees: i64) -> Self {
        Self(rupees.saturating_mul(100))
    }

    pub fn as_paisa(&self) -> i64 {
        self.0
    }

    pub fn format_pkr(&self) -> String {
        let is_negative = self.0 < 0;
        let abs_paisa = self.0.abs();
        let rupees = abs_paisa / 100;
        let paisa = abs_paisa % 100;
        if is_negative {
            format!("-PKR {}.{:02}", rupees, paisa)
        } else {
            format!("PKR {}.{:02}", rupees, paisa)
        }
    }
}

impl fmt::Display for Paisa {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.format_pkr())
    }
}

impl Add for Paisa {
    type Output = Self;
    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0.saturating_add(rhs.0))
    }
}

impl AddAssign for Paisa {
    fn add_assign(&mut self, rhs: Self) {
        self.0 = self.0.saturating_add(rhs.0);
    }
}

impl Sub for Paisa {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self::Output {
        Self(self.0.saturating_sub(rhs.0))
    }
}

impl SubAssign for Paisa {
    fn sub_assign(&mut self, rhs: Self) {
        self.0 = self.0.saturating_sub(rhs.0);
    }
}

impl Neg for Paisa {
    type Output = Self;
    fn neg(self) -> Self::Output {
        Self(-self.0)
    }
}

impl Sum for Paisa {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ZERO, |acc, x| acc + x)
    }
}

/// Quantity represented in milli-units (1.000 = 1,000 milli-units).
/// Allows exact representation of decimal quantities up to 3 decimal places
/// (e.g., 1.250 kg of sugar = Qty(1250)).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub struct Qty(pub i64);

impl Qty {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(1000);

    pub fn from_units(units: i64) -> Self {
        Self(units.saturating_mul(1000))
    }

    pub fn from_milli(milli: i64) -> Self {
        Self(milli)
    }

    pub fn as_milli(&self) -> i64 {
        self.0
    }

    pub fn format_qty(&self, unit_name: &str) -> String {
        let whole = self.0 / 1000;
        let frac = (self.0 % 1000).abs();
        if frac == 0 {
            format!("{} {}", whole, unit_name)
        } else {
            format!("{}.{:03} {}", whole, frac, unit_name)
        }
    }
}

impl Add for Qty {
    type Output = Self;
    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0.saturating_add(rhs.0))
    }
}

impl Sub for Qty {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self::Output {
        Self(self.0.saturating_sub(rhs.0))
    }
}

impl Neg for Qty {
    type Output = Self;
    fn neg(self) -> Self::Output {
        Self(-self.0)
    }
}

/// Tax or discount rate represented in Basis Points (1 bp = 0.01% = 0.0001).
/// 18% standard Pakistan sales tax = 1800 bp.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
pub struct RateBp(pub i32);

impl RateBp {
    pub const ZERO: Self = Self(0);
    pub const PK_STANDARD_SALES_TAX: Self = Self(1800); // 18%

    pub fn from_percent(percent: i32) -> Self {
        Self(percent.saturating_mul(100))
    }

    pub fn from_bp(bp: i32) -> Self {
        Self(bp)
    }

    pub fn as_bp(&self) -> i32 {
        self.0
    }
}

/// Calculate line total = unit_price * qty with half-up rounding to the nearest Paisa.
/// unit_price is in Paisa. qty is in milli-units (1000 = 1.000).
pub fn calc_line_total(unit_price: Paisa, qty: Qty) -> Paisa {
    if unit_price.0 == 0 || qty.0 == 0 {
        return Paisa::ZERO;
    }
    let product = (unit_price.0 as i128) * (qty.0 as i128);
    // Half-up rounding: add 500 for positive, subtract 500 for negative
    let rounded = if product >= 0 {
        (product + 500) / 1000
    } else {
        (product - 500) / 1000
    };
    Paisa(rounded as i64)
}

/// Computes `a * b / d` in 128-bit arithmetic with half-up rounding (away from zero).
/// Used for every money/quantity scaling in posting code so all modules round the same way.
/// `d` must be positive.
pub fn mul_div_half_up(a: i64, b: i64, d: i64) -> i64 {
    debug_assert!(d > 0, "divisor must be positive");
    let product = (a as i128) * (b as i128);
    let d = d as i128;
    let half = d / 2;
    let r = if product >= 0 {
        (product + half) / d
    } else {
        (product - half) / d
    };
    r as i64
}

/// Calculate tax-exclusive amount:
/// tax = round_half_up(net * rate_bp / 10,000)
pub fn calc_tax_exclusive(net: Paisa, rate_bp: RateBp) -> Paisa {
    if net.0 == 0 || rate_bp.0 == 0 {
        return Paisa::ZERO;
    }
    let product = (net.0 as i128) * (rate_bp.0 as i128);
    let rounded = if product >= 0 {
        (product + 5000) / 10000
    } else {
        (product - 5000) / 10000
    };
    Paisa(rounded as i64)
}

/// Calculate tax-inclusive breakdown:
/// Returns (net, tax) such that net + tax == gross.
/// net = round_half_up(gross * 10,000 / (10,000 + rate_bp))
pub fn calc_tax_inclusive(gross: Paisa, rate_bp: RateBp) -> (Paisa, Paisa) {
    if gross.0 == 0 || rate_bp.0 == 0 {
        return (gross, Paisa::ZERO);
    }
    let denominator = (10000 + rate_bp.0) as i128;
    let numerator = (gross.0 as i128) * 10000;
    let half = denominator / 2;
    let net = if numerator >= 0 {
        (numerator + half) / denominator
    } else {
        (numerator - half) / denominator
    };
    let net_paisa = Paisa(net as i64);
    let tax_paisa = gross - net_paisa;
    (net_paisa, tax_paisa)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_paisa_formatting() {
        assert_eq!(Paisa(0).format_pkr(), "PKR 0.00");
        assert_eq!(Paisa(12550).format_pkr(), "PKR 125.50");
        assert_eq!(Paisa(100).format_pkr(), "PKR 1.00");
        assert_eq!(Paisa(-500).format_pkr(), "-PKR 5.00");
    }

    #[test]
    fn test_line_total_calculation() {
        // 1.500 kg at PKR 100.00 (10000 Paisa) = PKR 150.00 (15000 Paisa)
        let total = calc_line_total(Paisa(10000), Qty(1500));
        assert_eq!(total, Paisa(15000));

        // 0.333 kg at PKR 100.00 = 33.30 PKR -> 3330 Paisa
        let total2 = calc_line_total(Paisa(10000), Qty(333));
        assert_eq!(total2, Paisa(3330));
    }

    #[test]
    fn test_tax_exclusive() {
        // PKR 100.00 at 18% (1800 bp) = PKR 18.00 (1800 Paisa)
        let tax = calc_tax_exclusive(Paisa(10000), RateBp(1800));
        assert_eq!(tax, Paisa(1800));
    }

    #[test]
    fn test_tax_inclusive() {
        // PKR 118.00 at 18% = PKR 100.00 net + PKR 18.00 tax
        let (net, tax) = calc_tax_inclusive(Paisa(11800), RateBp(1800));
        assert_eq!(net, Paisa(10000));
        assert_eq!(tax, Paisa(1800));
        assert_eq!(net + tax, Paisa(11800));
    }
}
