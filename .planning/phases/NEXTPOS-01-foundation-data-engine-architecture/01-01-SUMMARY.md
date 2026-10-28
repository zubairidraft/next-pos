---
phase: NEXTPOS-01-foundation-data-engine-architecture
plan: 01
subsystem: architecture
tags: [rust, cargo, workspace, tauri2, react, vite]

requires: []
provides:
  - Root Cargo workspace with pos-core crate and Tauri 2 desktop shell
  - Decoupled pure business core with zero UI dependencies
affects: [all phases]

actuals:
  tokens: 1500
  tasks: 2
  commits: 1

tech-stack:
  added: [cargo, tauri 2.0, react 18, vite 5, typescript, lucide-react]
  patterns: [Decoupled Rust library crate pos-core linked into Tauri desktop shell]

key-files:
  created:
    - Cargo.toml
    - crates/pos-core/Cargo.toml
    - crates/pos-core/src/lib.rs
    - apps/desktop/package.json
    - apps/desktop/vite.config.ts
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/src/main.rs

key-decisions:
  - "Decoupled pos-core as a pure Rust library crate to enable fast headless unit testing and multi-counter LAN reusability"
  - "Configured Tauri 2 for Windows desktop shell with 1024x768 minimum window constraint"

patterns-established:
  - "Pure library pattern: all business models, money logic, and database operations belong strictly in crates/pos-core"

requirements-completed: [ARCH-01]

coverage:
  - id: D1
    description: "Cargo workspace compiles pos-core crate cleanly"
    requirement: "ARCH-01"
    verification:
      - kind: unit
        ref: "cargo test --package pos-core --lib"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-28
---

# Plan 01-01 Summary: Monorepo Workspace & Tauri 2 Shell

Plan 01-01 established the foundational multi-package workspace for Next POS.

## Accomplishments
- Initialized root `Cargo.toml` virtual workspace housing `crates/pos-core` and `apps/desktop/src-tauri`.
- Created pure Rust `pos-core` crate containing core error types and version export (`0.1.0`).
- Configured Tauri 2 desktop configuration in `apps/desktop/src-tauri` with path dependency to `pos-core`.
- Configured React 18, Vite 5, TypeScript, and Lucide icons in `apps/desktop`.
