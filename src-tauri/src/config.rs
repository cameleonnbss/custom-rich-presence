//! Modèles de configuration + persistance locale (JSON atomique).
//! Stockage : %APPDATA%\CustomRichPresence\config.json

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
    /// Epoch ms du départ du chronomètre (0 = non démarré)
    pub chrono_started_at: u64,
    pub progress_enabled: bool,
    pub progress_value: f64,
    pub progress_max: f64,
    pub datetime_enabled: bool,
    /// Suivre la lecture multimédia Windows (SMTC)
    pub media_enabled: bool,
    /// Epoch ms : masquer automatiquement la présence après cette date (0 = permanent)
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
    /// Mode sans bordure (aucun liseré autour de la carte)
    pub borderless: bool,
    pub always_on_top: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlayConfig {
    /// Position logique (indépendante du DPI)
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

/// Intégration Discord Rich Presence (IPC locale, aucun serveur).
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
            title: "Ma présence".into(),
            subtitle_enabled: true,
            subtitle: "Sous-titre".into(),
            body_enabled: false,
            body: String::new(),
            button_enabled: false,
            button_text: "Ouvrir".into(),
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
        // Position par défaut : coin inférieur droit de l'écran principal
        // (affiné au premier affichage par le frontend).
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

/// Écriture atomique : fichier temporaire puis renommage.
pub fn write_atomic(path: &PathBuf, data: &str) {
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if fs::write(&tmp, data).is_ok() {
        let _ = fs::rename(&tmp, path);
    }
}
