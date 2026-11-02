// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    println!(
        "Next POS Desktop Shell - initialized with pos-core v{}",
        pos_core::pos_core_version()
    );

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
