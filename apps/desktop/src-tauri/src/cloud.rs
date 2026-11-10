//! Next POS Cloud in the desktop shell: linking the shop, sending changes in
//! the background, and the daily encrypted backup upload.
//!
//! Nothing here ever blocks a sale: the shop database is locked only for the
//! few milliseconds it takes to read the next batch or mark it sent. With no
//! internet the changes simply wait on the PC and go later.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use pos_core::app::cloud::{CloudLinkTarget, CloudStatus, BATCH_ROWS};
use pos_core::app::lan::SharedApp;
use pos_core::app::PosApp;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::{with, Core, R};

/// How often the background task looks for new changes.
const SYNC_EVERY: Duration = Duration::from_secs(30);
/// Waits after a failed try (no internet etc.), growing up to this.
const MAX_BACKOFF: Duration = Duration::from_secs(10 * 60);

/// Shared between the background task and the screen.
pub struct CloudRunner {
    /// Ask the background task to send now.
    wake: AtomicBool,
    /// One sender at a time.
    busy: AtomicBool,
}

impl CloudRunner {
    pub fn new() -> Self {
        CloudRunner { wake: AtomicBool::new(true), busy: AtomicBool::new(false) }
    }
}

fn locked<T>(app: &SharedApp, f: impl FnOnce(&PosApp) -> pos_core::error::Result<T>) -> Result<T, String> {
    let guard = app.lock().map_err(|_| "app state is locked".to_string())?;
    match guard.as_ref() {
        Ok(a) => f(a).map_err(|e| e.to_string()),
        Err(e) => Err(e.clone()),
    }
}

fn client() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(90)).build().unwrap_or_else(|_| reqwest::Client::new())
}

/// The readable part of a server error ({"message": "..."}).
async fn server_error(res: reqwest::Response) -> String {
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    let msg = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("message").or_else(|| v.get("error")).and_then(|m| m.as_str()).map(str::to_string))
        .unwrap_or_else(|| text.chars().take(200).collect());
    format!("Cloud server said ({}): {}", status.as_u16(), msg)
}

fn net_error(e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "No internet (or the cloud is not reachable). Changes are kept on this PC and will be sent later.".into()
    } else {
        format!("Could not reach the cloud: {}", e)
    }
}

/// Sends everything that waits. Returns how many rows went.
async fn sync_once(app: &SharedApp) -> Result<usize, String> {
    let http = client();
    let mut sent = 0usize;
    loop {
        let Some(batch) = locked(app, |a| a.cloud_next_batch(BATCH_ROWS))? else { return Ok(sent) };
        let body = serde_json::json!({ "p_shop": batch.shop_id, "p_key": batch.shop_key, "p_rows": batch.rows });
        let res = http
            .post(format!("{}/rest/v1/rpc/ingest", batch.url))
            .header("apikey", &batch.anon_key)
            .header("Authorization", format!("Bearer {}", batch.anon_key))
            .json(&body)
            .send()
            .await
            .map_err(net_error)?;
        if !res.status().is_success() {
            return Err(server_error(res).await);
        }
        locked(app, |a| a.cloud_ack(batch.upto_seq))?;
        sent += batch.rows.len();
        if !batch.more {
            return Ok(sent);
        }
    }
}

/// Uploads today's encrypted backup if one is due (or `force`).
async fn backup_once(app: &SharedApp, data_dir: &std::path::Path, force: bool) -> Result<bool, String> {
    let Some(plan) = locked(app, |a| a.cloud_backup_plan(force))? else { return Ok(false) };
    let file = data_dir.join("cloud-backup.tmp");
    let _ = std::fs::remove_file(&file);
    locked(app, |a| a.cloud_write_backup(&file, &plan.password))?;
    let bytes = std::fs::read(&file).map_err(|e| format!("Could not read the backup file: {}", e))?;
    let _ = std::fs::remove_file(&file);
    let http = client();
    let fn_url = format!("{}/functions/v1/backup", plan.url);
    let call = |body: serde_json::Value| {
        http.post(&fn_url)
            .header("apikey", &plan.anon_key)
            .header("Authorization", format!("Bearer {}", plan.anon_key))
            .json(&body)
            .send()
    };
    let res = call(serde_json::json!({ "action": "start", "shop_id": plan.shop_id, "shop_key": plan.shop_key, "size": bytes.len() })).await.map_err(net_error)?;
    if !res.status().is_success() {
        return Err(server_error(res).await);
    }
    let start: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let upload_url = start.get("upload_url").and_then(|v| v.as_str()).ok_or("The cloud did not give an upload address")?.to_string();
    let path = start.get("path").and_then(|v| v.as_str()).ok_or("The cloud did not give a file name")?.to_string();
    let size = bytes.len();
    let put = http
        .put(&upload_url)
        .header("Content-Type", "application/octet-stream")
        .body(bytes)
        .timeout(Duration::from_secs(15 * 60))
        .send()
        .await
        .map_err(net_error)?;
    if !put.status().is_success() {
        return Err(server_error(put).await);
    }
    let res = call(serde_json::json!({ "action": "done", "shop_id": plan.shop_id, "shop_key": plan.shop_key, "path": path, "size": size })).await.map_err(net_error)?;
    if !res.status().is_success() {
        return Err(server_error(res).await);
    }
    Ok(true)
}

/// The background task: started once when the app opens.
pub fn start(handle: &AppHandle, data_dir: std::path::PathBuf) {
    let app: SharedApp = handle.state::<Core>().0.clone();
    let runner: Arc<CloudRunner> = handle.state::<Arc<CloudRunner>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        let mut next = Instant::now() + Duration::from_secs(5);
        let mut backoff = SYNC_EVERY;
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let woken = runner.wake.swap(false, Ordering::SeqCst);
            if !woken && Instant::now() < next {
                continue;
            }
            if runner.busy.swap(true, Ordering::SeqCst) {
                continue;
            }
            let result = sync_once(&app).await;
            match &result {
                Ok(_) => backoff = SYNC_EVERY,
                Err(e) => {
                    let _ = locked(&app, |a| a.cloud_note_error(e));
                    backoff = (backoff * 2).min(MAX_BACKOFF);
                }
            }
            if result.is_ok() {
                match backup_once(&app, &data_dir, false).await {
                    Ok(true) => {
                        let _ = locked(&app, |a| a.cloud_backup_result(None));
                    }
                    Ok(false) => {}
                    Err(e) => {
                        let _ = locked(&app, |a| a.cloud_backup_result(Some(&e)));
                    }
                }
            }
            runner.busy.store(false, Ordering::SeqCst);
            next = Instant::now() + if result.is_ok() { SYNC_EVERY } else { backoff };
        }
    });
}

// ------------------------------------------------------------ commands (Backup screen)

#[derive(Serialize)]
pub struct CloudActionResult {
    pub status: CloudStatus,
    pub message: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn cloud_status(core: State<Core>) -> R<CloudStatus> {
    with(&core, |a| a.cloud_status())
}

/// Links this PC to the shop on Next POS Cloud with the code from the admin website.
#[tauri::command(rename_all = "snake_case")]
pub async fn cloud_link(core: State<'_, Core>, runner: State<'_, Arc<CloudRunner>>, code: String) -> R<CloudStatus> {
    let target: CloudLinkTarget = with(&core, |a| a.cloud_read_link_code(&code))?;
    let pc_name = with(&core, |a| a.status()).ok().and_then(|s| s.store_name).unwrap_or_default();
    let res = client()
        .post(format!("{}/rest/v1/rpc/link_shop", target.url))
        .header("apikey", &target.anon_key)
        .header("Authorization", format!("Bearer {}", target.anon_key))
        .json(&serde_json::json!({ "p_code": target.code, "p_pc_name": pc_name }))
        .send()
        .await
        .map_err(net_error)?;
    if !res.status().is_success() {
        return Err(server_error(res).await);
    }
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let shop_id = v.get("shop_id").and_then(|x| x.as_str()).unwrap_or_default().to_string();
    let shop_key = v.get("shop_key").and_then(|x| x.as_str()).unwrap_or_default().to_string();
    let st = with(&core, |a| a.cloud_finish_link(&target, &shop_id, &shop_key))?;
    runner.wake.store(true, Ordering::SeqCst);
    Ok(st)
}

#[tauri::command(rename_all = "snake_case")]
pub fn cloud_unlink(core: State<Core>) -> R<CloudStatus> {
    with(&core, |a| a.cloud_unlink())
}

#[tauri::command(rename_all = "snake_case")]
pub fn cloud_resend_all(core: State<Core>, runner: State<Arc<CloudRunner>>) -> R<CloudStatus> {
    let st = with(&core, |a| a.cloud_resend_all())?;
    runner.wake.store(true, Ordering::SeqCst);
    Ok(st)
}

#[tauri::command(rename_all = "snake_case")]
pub fn cloud_set_backup_password(core: State<Core>, password: String) -> R<CloudStatus> {
    with(&core, |a| a.cloud_set_backup_password(&password))
}

/// "Send now" on the Backup screen.
#[tauri::command(rename_all = "snake_case")]
pub async fn cloud_sync_now(core: State<'_, Core>, runner: State<'_, Arc<CloudRunner>>) -> R<CloudActionResult> {
    with(&core, |a| a.cloud_status())?; // Owner only
    if runner.busy.swap(true, Ordering::SeqCst) {
        return Err("Already sending. Try again in a moment.".into());
    }
    let app = core.0.clone();
    let r = sync_once(&app).await;
    runner.busy.store(false, Ordering::SeqCst);
    match r {
        Ok(n) => Ok(CloudActionResult { status: with(&core, |a| a.cloud_status())?, message: if n == 0 { "Everything is already on the cloud.".into() } else { format!("Sent {} changes.", n) } }),
        Err(e) => {
            let _ = locked(&app, |a| a.cloud_note_error(&e));
            Err(e)
        }
    }
}

/// "Back up to cloud now" on the Backup screen.
#[tauri::command(rename_all = "snake_case")]
pub async fn cloud_backup_now(app_handle: AppHandle, core: State<'_, Core>, runner: State<'_, Arc<CloudRunner>>) -> R<CloudActionResult> {
    with(&core, |a| a.cloud_status())?; // Owner only
    if runner.busy.swap(true, Ordering::SeqCst) {
        return Err("Already sending. Try again in a moment.".into());
    }
    let app = core.0.clone();
    let data_dir = app_handle.state::<crate::DataDir>().0.clone();
    let r = backup_once(&app, &data_dir, true).await;
    runner.busy.store(false, Ordering::SeqCst);
    match r {
        Ok(true) => {
            let _ = locked(&app, |a| a.cloud_backup_result(None));
            Ok(CloudActionResult { status: with(&core, |a| a.cloud_status())?, message: "Backup uploaded to the cloud.".into() })
        }
        Ok(false) => Err("Set a backup password first (and link the shop).".into()),
        Err(e) => {
            let _ = locked(&app, |a| a.cloud_backup_result(Some(&e)));
            Err(e)
        }
    }
}
