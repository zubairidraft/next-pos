# Phase 2: Security, Master Data & Urdu Localization - Research

**Date:** 2026-10-28  
**Phase:** 2 of 12  
**Requirements:** AUTH-01, I18N-01  

---

## 1. Executive Summary

Phase 2 introduces user authentication, role-based access control (RBAC), master data repositories, and the bilingual English/Urdu localization engine with full RTL support. In typical Pakistani retail environments, cashiers frequently change during shifts or step away, necessitating instant PIN-based session switches without typing complex passwords. Furthermore, shop clerks and owners must be able to navigate the entire system in either English or Nastaliq Urdu without network dependencies, and search master records (categories, brands, units) seamlessly in both Latin and Arabic/Urdu scripts.

---

## 2. Technical Decisions & Architecture

### 2.1 Password & PIN Hashing (Argon2id)
- **Crate**: `argon2` (pure Rust implementation).
- **Security Profile**:
  - Passwords: Standard Argon2id profile (m_cost: 19456 KiB, t_cost: 2, p_cost: 1).
  - Cashier PIN: 4-to-6 digit numeric PINs are salted and hashed with Argon2id; auto-lock timer triggers PIN unlock prompt instead of full credential re-entry.
- **Roles & Permissions**:
  - Roles: `Owner`, `Manager`, `Cashier`, `Stock Keeper`.
  - Permissions: `sales:create`, `sales:discount`, `sales:void`, `sales:return`, `pricing:edit`, `inventory:adjust`, `reports:view`, `settings:manage`, `backup:manage`.

### 2.2 Bilingual Master Data & Script Matching
- Every master data table (`categories`, `brands`, `units`, `business_settings`) contains dual columns: `name` (English/Latin) and `name_ur` (Urdu/Nastaliq).
- Search queries execute normalized prefix/substring searches across both `name` and `name_ur` columns (`WHERE name LIKE :q OR name_ur LIKE :q`).

### 2.3 Urdu Localization & Offline Typography
- **Font**: Google Noto Nastaliq Urdu font bundled locally in `apps/desktop/src/assets/fonts/NotoNastaliqUrdu-Regular.ttf` or WOFF2. No external web font requests allowed (survives disconnected shops).
- **Internationalization**: `i18next` + `react-i18next`.
  - Translations stored in `src/i18n/locales/en.json` and `src/i18n/locales/ur.json`.
  - Direction management: When language switches to `ur`, set document root `dir="rtl"` and switch base font family to `Noto Nastaliq Urdu`.

---

## 3. Plan Decomposition

1. **Plan 02-01 (Wave 1)**: Authentication & RBAC engine in `pos-core` (Argon2id hashing, PIN verification, session tokens, permissions checking).
2. **Plan 02-02 (Wave 1)**: Master Data Repositories in `pos-core` (Bilingual categories, brands, units, and business settings CRUD).
3. **Plan 02-03 (Wave 2)**: Bundled Urdu Font, `i18next` localization framework, and RTL layout orchestration in React.
4. **Plan 02-04 (Wave 3)**: First-Run Setup Wizard, Cashier PIN quick-switch modal, and Master Data configuration screens.
