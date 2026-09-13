//! Configuration models + local persistence (atomic JSON).
//! Storage: %APPDATA%\CustomRichPresence\config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CardConfig {
    pub preset: String,
    pub image_enabled: bool,
    pub image_data: String,
    pub title_enabled: bool,
    pub title: String,
    pub subtitle_enabled: bool,
    pub subtitle: String,
    pub body_enabled: bool,
    pub body: String,
    pub button_enabled: bool,
    pub button_text: String,
    pub button_url: String,
    pub chrono_enabled: bool,
    /// Chronometer start in epoch ms (0 = not started)
    pub chrono_started_at: u64,
    pub progress_enabled: bool,
    pub progress_value: f64,
    pub progress_max: f64,
    pub datetime_enabled: bool,
    /// Follow Windows media playback (SMTC)
    pub media_enabled: bool,
    /// Epoch ms: auto-hide the presence after this date (0 = permanent)
    pub display_until: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppearanceConfig {
    pub width: f64,
    pub height: f64,
    pub corner_radius: f64,
    /// 0..1
    pub opacity: f64,
    /// 0.8..1.4
    pub font_scale: f64,
    pub spacing: f64,
    pub font_family: String,
    pub anim_in: String,
    pub anim_out: String,
    /// ms
    pub anim_duration: u32,
    /// Borderless mode (no frame around the card)
    pub borderless: bool,
    pub always_on_top: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlayConfig {
    /// Logical position (DPI-independent)
    pub x: f64,
    pub y: f64,
    pub locked: bool,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub card: CardConfig,
    pub appearance: AppearanceConfig,
    pub overlay: OverlayConfig,
    pub discord: DiscordConfig,
}

/// Discord Rich Presence integration (local IPC, no server).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiscordConfig {
    /// Pousser la carte vers Discord
    pub enabled: bool,
    /// Identifiant d'application Discord (client_id)
    pub client_id: String,
}

impl Default for DiscordConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            client_id: std::env::var("CRP_DISCORD_CLIENT_ID").unwrap_or_default(),
        }
    }
}

impl Default for CardConfig {
    fn default() -> Self {
        Self {
            preset: "custom".into(),
            image_enabled: false,
            image_data: String::new(),
            title_enabled: true,
            title: "My presence".into(),
            subtitle_enabled: true,
            subtitle: "Subtitle".into(),
            body_enabled: false,
            body: String::new(),
            button_enabled: false,
            button_text: "Open".into(),
            button_url: String::new(),
            chrono_enabled: false,
            chrono_started_at: 0,
            progress_enabled: false,
            progress_value: 0.0,
            progress_max: 100.0,
            datetime_enabled: false,
            media_enabled: false,
            display_until: 0,
        }
    }
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            width: 340.0,
            height: 240.0,
            corner_radius: 14.0,
            opacity: 0.95,
            font_scale: 1.0,
            spacing: 16.0,
            font_family: "Segoe UI Variable".into(),
            anim_in: "fade".into(),
            anim_out: "fade".into(),
            anim_duration: 220,
            borderless: false,
            always_on_top: true,
        }
    }
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self { x: 0.0, y: 0.0, locked: false, visible: false }
    }
}

impl Default for Config {
    fn default() -> Self {
        // Default position: bottom-right corner of the primary screen
        // (refined by the frontend on first display).
        Self {
            card: CardConfig::default(),
            appearance: AppearanceConfig::default(),
            overlay: OverlayConfig::default(),
            discord: DiscordConfig::default(),
        }
    }
}

pub struct AppState {
    pub config: Mutex<Config>,
}

impl AppState {
    pub fn load() -> Self {
        let path = config_path();
        let cfg = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Config>(&s).ok())
            .unwrap_or_default();
        Self { config: Mutex::new(cfg) }
    }

    pub fn save(&self) {
        let cfg = self.config.lock().unwrap().clone();
        let json = serde_json::to_string_pretty(&cfg).unwrap_or_default();
        write_atomic(&config_path(), &json);
    }
}

pub fn config_path() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("CustomRichPresence").join("config.json")
}

/// Atomic write: temporary file, then rename.
pub fn write_atomic(path: &PathBuf, data: &str) {
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if fs::write(&tmp, data).is_ok() {
        let _ = fs::rename(&tmp, path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_serializes_to_camel_case() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"titleEnabled\""));
        assert!(json.contains("\"cornerRadius\""));
        assert!(!json.contains("title_enabled"));
    }

    #[test]
    fn config_survives_a_json_round_trip() {
        let mut cfg = Config::default();
        cfg.card.title = "Hello".into();
        cfg.appearance.width = 412.5;
        cfg.overlay.locked = true;
        cfg.discord.client_id = "1234567890".into();

        let json = serde_json::to_string(&cfg).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();

        assert_eq!(back.card.title, "Hello");
        assert_eq!(back.appearance.width, 412.5);
        assert!(back.overlay.locked);
        assert_eq!(back.discord.client_id, "1234567890");
    }

    #[test]
    fn partial_json_uses_defaults() {
        let parsed: Config = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed.card.title, "My presence");
        assert!(parsed.appearance.always_on_top);
    }

    #[test]
    fn atomic_write_produces_the_file() {
        let dir = std::env::temp_dir().join("crp-test-atomic");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("nested").join("cfg.json");
        write_atomic(&path, "{}");
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
        let _ = fs::remove_dir_all(&dir);
    }
}
