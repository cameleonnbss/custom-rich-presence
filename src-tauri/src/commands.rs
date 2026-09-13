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

/// Copies the picked image to %APPDATA%\CustomRichPresence\assets\app-icon.png,
/// resized to 512x512 (Discord's asset requirement), ready to upload.
#[tauri::command]
pub async fn prepare_asset(source_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_asset_blocking(&source_path))
        .await
        .unwrap_or_else(|e| Err(format!("task: {e}")))
}

fn prepare_asset_blocking(source_path: &str) -> Result<String, String> {
    use image::GenericImageView;

    let img = image::open(source_path).map_err(|e| format!("open image: {e}"))?;
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("empty image".into());
    }
    // Fit inside 512x512 with transparent padding — preserves aspect ratio.
    let scale = 512.0 / w.max(h) as f64;
    let nw = ((w as f64) * scale).round().max(1.0) as u32;
    let nh = ((h as f64) * scale).round().max(1.0) as u32;
    let resized = img.resize_exact(nw, nh, image::imageops::FilterType::Lanczos3);

    let mut canvas = image::DynamicImage::new_rgba8(512, 512);
    let x = (512 - nw) / 2;
    let y = (512 - nh) / 2;
    image::imageops::overlay(&mut canvas, &resized, x as i64, y as i64);

    let dir = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("CustomRichPresence")
        .join("assets");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    let out = dir.join("app-icon.png");
    canvas
        .save_with_format(&out, image::ImageFormat::Png)
        .map_err(|e| format!("save: {e}"))?;
    Ok(out.display().to_string())
}

/// Opens Discord's Art Assets page for the configured application ID.
#[tauri::command]
pub fn open_asset_upload_page(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let id = state.config.lock().unwrap().discord.client_id.trim().to_string();
    if id.is_empty() {
        return Err("enter your Application ID first".into());
    }
    let url = format!("https://discord.com/developers/applications/{id}/rich-presence");
    app.opener()
        .open_url(&url, None::<String>)
        .map_err(|e| e.to_string())
}

/// Reads a local image and returns a data URL (for preview only).
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
        return Err("image too large (max 8 MB)".into());
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
