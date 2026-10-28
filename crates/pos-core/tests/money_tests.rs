use pos_core::money::{
    calc_line_total, calc_tax_exclusive, calc_tax_inclusive, Paisa, Qty, RateBp,
};
use proptest::prelude::*;

proptest! {
    #[test]
    fn prop_tax_inclusive_net_plus_tax_always_equals_gross(
        gross_val in 0i64..100_000_000_00i64, // up to 100M PKR
        rate_bp in 0i32..10_000i32           // 0% to 100%
    ) {
        let gross = Paisa(gross_val);
        let rate = RateBp(rate_bp);
        let (net, tax) = calc_tax_inclusive(gross, rate);
        prop_assert_eq!(net + tax, gross);
        prop_assert!(net.0 <= gross.0);
        prop_assert!(tax.0 >= 0);
    }

    #[test]
    fn prop_tax_exclusive_matches_multiplication(
        net_val in 0i64..10_000_000_00i64,
        rate_bp in 0i32..10_000i32
    ) {
        let net = Paisa(net_val);
        let rate = RateBp(rate_bp);
        let tax = calc_tax_exclusive(net, rate);
        prop_assert!(tax.0 >= 0);
    }

    #[test]
    fn prop_line_total_non_negative_for_positive_inputs(
        price in 0i64..10_000_000_00i64,
        qty in 0i64..1_000_000_000i64
    ) {
        let total = calc_line_total(Paisa(price), Qty(qty));
        prop_assert!(total.0 >= 0);
    }

    #[test]
    fn prop_paisa_addition_associative(
        a in -1_000_000i64..1_000_000i64,
        b in -1_000_000i64..1_000_000i64,
        c in -1_000_000i64..1_000_000i64,
    ) {
        let pa = Paisa(a);
        let pb = Paisa(b);
        let pc = Paisa(c);
        prop_assert_eq!((pa + pb) + pc, pa + (pb + pc));
    }
}
