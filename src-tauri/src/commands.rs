//! Commands exposed to the frontend.

use crate::config::{AppState, Config};
use crate::media;
use tauri::{AppHandle, Emitter, State};
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
pub async fn get_game_status() -> crate::game::GameStatus {
    tauri::async_runtime::spawn_blocking(crate::game::detect_blocking)
        .await
        .unwrap_or_else(|_| crate::game::GameStatus::unavailable())
}

/// Reads a local image and returns a data URL (offline persistence).
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
        _ => return Err("unsupported image format".into()),
    };
    let bytes = std::fs::read(&path).map_err(|e| format!("read: {e}"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("image too large (max 8 MB — Discord assets are 512x512 max)".into());
    }
    Ok(format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let path = crate::config::config_path();
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

/// Discord status for the UI: returns the detected pipe or an error.
#[tauri::command]
pub fn get_discord_status() -> Result<String, String> {
    crate::discord::pipe_available()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
