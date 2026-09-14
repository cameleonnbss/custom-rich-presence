//! Configuration models + local persistence (atomic JSON).
//! Storage: %APPDATA%\CustomRichPresence\config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// What the Discord status displays.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PresenceConfig {
    /// Follow the Windows media session (Spotify, browsers, players...).
    pub media_enabled: bool,
    /// Prefer a detected game / running process name when available.
    pub game_enabled: bool,
    /// Text-only mode: the custom text IS the status, nothing is detected.
    pub text_only: bool,
    /// Static text when nothing is detected (or always in text-only mode).
    pub fallback_details: String,
    pub fallback_state: String,
    /// Show elapsed time since the app started (custom presence).
    pub show_elapsed: bool,
    /// Large image key uploaded in the Discord application assets.
    pub large_image: String,
    pub large_text: String,
    /// Small image key (optional badge).
    pub small_image: String,
    /// "Playing" / "Listening to" action phrasing.
    pub verb: String,
    /// Custom button label + URL (both required by Discord to render).
    pub button_enabled: bool,
    pub button_label: String,
    pub button_url: String,
}

impl Default for PresenceConfig {
    fn default() -> Self {
        Self {
            media_enabled: false,
            game_enabled: false,
            text_only: true,
            fallback_details: String::new(),
            fallback_state: String::new(),
            show_elapsed: false,
            large_image: "app-icon".into(),
            large_text: String::new(),
            small_image: String::new(),
            verb: "Playing".into(),
            button_enabled: false,
            button_label: "Open".into(),
            button_url: String::new(),
        }
    }
}

/// Discord connection settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiscordConfig {
    pub enabled: bool,
    /// Discord application (client) ID.
    pub client_id: String,
}

impl Default for DiscordConfig {
    fn default() -> Self {
        Self { enabled: false, client_id: String::new() }
    }
}

/// Settings window UI preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UiConfig {
    /// Background particles density (0 = disabled).
    pub particles: u32,
    /// Acrylic-style translucency strength 0..1.
    pub glass: f64,
    /// Poll interval for media/process detection, seconds (1..30).
    pub poll_interval_secs: u32,
}

impl Default for UiConfig {
    fn default() -> Self {
        Self { particles: 42, glass: 0.55, poll_interval_secs: 5 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub presence: PresenceConfig,
    pub discord: DiscordConfig,
    pub ui: UiConfig,
    /// Epoch ms when this instance started (elapsed timer).
    pub started_at: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            presence: PresenceConfig::default(),
            discord: DiscordConfig::default(),
            ui: UiConfig::default(),
            started_at: 0,
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
        assert!(json.contains("\"mediaEnabled\""));
        assert!(json.contains("\"clientId\""));
        assert!(!json.contains("media_enabled"));
    }

    #[test]
    fn config_survives_a_json_round_trip() {
        let mut cfg = Config::default();
        cfg.presence.fallback_details = "Hello".into();
        cfg.discord.client_id = "1234567890".into();
        cfg.ui.particles = 7;

        let json = serde_json::to_string(&cfg).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();

        assert_eq!(back.presence.fallback_details, "Hello");
        assert_eq!(back.discord.client_id, "1234567890");
        assert_eq!(back.ui.particles, 7);

        // Empty ID stays empty in config; the worker substitutes its
        // built-in default at push time.
        assert_eq!(Config::default().discord.client_id, "");
    }

    #[test]
    fn partial_json_uses_defaults() {
        let parsed: Config = serde_json::from_str("{}").unwrap();
        assert!(parsed.presence.text_only);
        assert!(!parsed.presence.media_enabled);
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
