//! Next POS Mobile (Android).
//!
//! The phone keeps no shop data. It keeps only its pairing with the shop PC
//! (PC address, the PC certificate's fingerprint, and this phone's secret) in
//! the app's private storage, and sends every action to the PC over the shop
//! WiFi with pinned TLS. See `pos_lan`.

use std::path::PathBuf;
use std::sync::Mutex;

use pos_lan::client::{self, LinkError, Pairing};
use serde::Serialize;
use serde_json::Value;
use tauri::{Manager, State};

struct Link {
    file: PathBuf,
    pairing: Mutex<Option<Pairing>>,
}

impl Link {
    fn load(file: PathBuf) -> Self {
        let pairing = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice::<Pairing>(&b).ok());
        Link { file, pairing: Mutex::new(pairing) }
    }

    fn save(&self, p: Option<&Pairing>) -> Result<(), String> {
        match p {
            Some(p) => {
                if let Some(dir) = self.file.parent() {
                    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                }
                let tmp = self.file.with_extension("tmp");
                std::fs::write(&tmp, serde_json::to_vec(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
                std::fs::rename(&tmp, &self.file).map_err(|e| e.to_string())
            }
            None => {
                let _ = std::fs::remove_file(&self.file);
                Ok(())
            }
        }
    }

    fn current(&self) -> Result<Pairing, String> {
        self.pairing
            .lock()
            .map_err(|_| "Internal error".to_string())?
            .clone()
            .ok_or_else(|| LinkError::NotPaired("This phone is not connected to a shop PC yet.".into()).to_string())
    }

    /// Run a call on a copy of the pairing (network calls must not hold the lock),
    /// then keep a new PC address if the call found one.
    async fn run<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Pairing) -> Result<(T, bool), LinkError> + Send + 'static,
    ) -> Result<T, String> {
        let mut p = self.current()?;
        let device = p.device_id.clone();
        let (res, p) = tauri::async_runtime::spawn_blocking(move || {
            let r = f(&mut p);
            (r, p)
        })
        .await
        .map_err(|e| e.to_string())?;
        match res {
            Ok((v, moved)) => {
                if moved {
                    let mut guard = self.pairing.lock().map_err(|_| "Internal error".to_string())?;
                    if guard.as_ref().map(|g| g.device_id == device).unwrap_or(false) {
                        *guard = Some(p.clone());
                        drop(guard);
                        self.save(Some(&p))?;
                    }
                }
                Ok(v)
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

#[derive(Serialize)]
struct LinkInfo {
    store_name: String,
    hosts: Vec<String>,
    device_id: String,
}

fn info(p: &Pairing) -> LinkInfo {
    LinkInfo { store_name: p.store_name.clone(), hosts: p.hosts.clone(), device_id: p.device_id.clone() }
}

/// The shop this phone is paired with, if any.
#[tauri::command(rename_all = "snake_case")]
fn link_info(link: State<Link>) -> Result<Option<LinkInfo>, String> {
    Ok(link.pairing.lock().map_err(|_| "Internal error".to_string())?.as_ref().map(info))
}

/// Pair with the PC using the text from its QR code.
#[tauri::command(rename_all = "snake_case")]
async fn link_pair(link: State<'_, Link>, qr: String, device_name: String) -> Result<LinkInfo, String> {
    let p = tauri::async_runtime::spawn_blocking(move || client::pair(&qr, &device_name))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    link.save(Some(&p))?;
    let out = info(&p);
    *link.pairing.lock().map_err(|_| "Internal error".to_string())? = Some(p);
    Ok(out)
}

/// Forget the pairing on this phone.
#[tauri::command(rename_all = "snake_case")]
fn link_forget(link: State<Link>) -> Result<(), String> {
    *link.pairing.lock().map_err(|_| "Internal error".to_string())? = None;
    link.save(None)
}

/// Run one Next POS command on the PC.
#[tauri::command(rename_all = "snake_case")]
async fn link_rpc(link: State<'_, Link>, cmd: String, args: Value) -> Result<Value, String> {
    link.run(move |p| p.rpc(&cmd, args)).await
}

/// Send a scanned barcode to the screen open on the PC.
#[tauri::command(rename_all = "snake_case")]
async fn link_scan(link: State<'_, Link>, code: String) -> Result<Value, String> {
    link.run(move |p| p.scan(&code)).await
}

/// Is the PC reachable? Returns its short status.
#[tauri::command(rename_all = "snake_case")]
async fn link_ping(link: State<'_, Link>) -> Result<Value, String> {
    link.run(|p| p.ping()).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    builder
        .setup(|app| {
            let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
            app.manage(Link::load(dir.join("shop-pairing.json")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![link_info, link_pair, link_forget, link_rpc, link_scan, link_ping])
        .run(tauri::generate_context!())
        .expect("error while running Next POS Mobile");
}
