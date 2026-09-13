//! Commandes exposées au frontend.

use crate::config::{AppState, Config};
use crate::{media, overlay, presets, youtube};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_config(app: AppHandle, state: State<AppState>, config: Config) -> Result<(), String> {
    {
        let mut current = state.config.lock().unwrap();
        *current = config;
    }
    state.save();
    overlay::apply_from_state(&app);
    let cfg = state.config.lock().unwrap().clone();
    let _ = app.emit("card-updated", &cfg);
    Ok(())
}

#[tauri::command]
pub async fn get_media_status() -> media::MediaStatus {
    tauri::async_runtime::spawn_blocking(media::read_smtc_blocking)
        .await
        .unwrap_or_else(|_| media::MediaStatus::unavailable())
}

#[tauri::command]
pub async fn fetch_youtube_info(url: String) -> Result<youtube::YoutubeInfo, String> {
    youtube::fetch_info(&url).await
}

#[tauri::command]
pub async fn youtube_thumbnail_data(url: String) -> Result<String, String> {
    youtube::thumbnail_data(&url).await
}

/// Redémarre le chronomètre ; renvoie le nouvel epoch de départ.
#[tauri::command]
pub fn reset_chrono(app: AppHandle, state: State<AppState>) -> Result<u64, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    {
        let mut c = state.config.lock().unwrap();
        c.card.chrono_started_at = now;
    }
    state.save();
    let cfg = state.config.lock().unwrap().clone();
    let _ = app.emit("card-updated", &cfg);
    Ok(now)
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    overlay::show(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    overlay::hide(&app);
    Ok(())
}

#[tauri::command]
pub fn toggle_overlay(app: AppHandle) -> bool {
    overlay::toggle(&app)
}

#[tauri::command]
pub fn set_overlay_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut c = state.config.lock().unwrap();
        c.overlay.x = x;
        c.overlay.y = y;
    }
    state.save();
    overlay::apply_from_state(&app);
    Ok(())
}

/// Colle la présence dans un coin de l'écran courant : "tl", "tr", "bl", "br".
#[tauri::command]
pub fn snap_overlay(app: AppHandle, corner: String) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "fenêtre overlay introuvable".to_string())?;
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "aucun écran détecté".to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let monitor_w = monitor.size().width as f64 / scale;
    let monitor_h = monitor.size().height as f64 / scale;
    let monitor_x = monitor.position().x as f64 / scale;
    let monitor_y = monitor.position().y as f64 / scale;

    let state = app.state::<AppState>();
    let (w, h) = {
        let c = state.config.lock().unwrap();
        (c.appearance.width, c.appearance.height)
    };
    let margin = 24.0;
    let x = if corner == "tl" || corner == "bl" {
        monitor_x + margin
    } else {
        monitor_x + monitor_w - w - margin
    };
    let y = if corner == "tl" || corner == "tr" {
        monitor_y + margin
    } else {
        monitor_y + monitor_h - h - margin
    };
    {
        let mut c = state.config.lock().unwrap();
        c.overlay.x = x;
        c.overlay.y = y;
    }
    state.save();
    overlay::apply_from_state(&app);
    Ok(())
}

#[tauri::command]
pub fn set_overlay_lock(app: AppHandle, locked: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut c = state.config.lock().unwrap();
        c.overlay.locked = locked;
    }
    state.save();
    Ok(())
}

#[tauri::command]
pub fn apply_preset(app: AppHandle, name: String) -> Result<(), String> {
    presets::apply(&app, &name);
    Ok(())
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let path = crate::config::config_path();
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

/// Lit une image locale et la renvoie en data URL (persistance hors ligne).
#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    use base64::Engine as _;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => return Err("format d'image non pris en charge".into()),
    };
    let bytes = std::fs::read(&path).map_err(|e| format!("lecture : {e}"))?;
    if bytes.len() > 15 * 1024 * 1024 {
        return Err("image trop volumineuse (max 15 Mo)".into());
    }
    Ok(format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

/// Statut Discord pour l'UI : renvoie le pipe détecté ou une erreur.
#[tauri::command]
pub fn get_discord_status() -> Result<String, String> {
    crate::discord::pipe_available()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
