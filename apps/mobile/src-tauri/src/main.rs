// The phone app is built for Android (`tauri android build`). This desktop
// entry only exists so the same code can be opened on a PC while developing.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nextpos_mobile_lib::run()
}
