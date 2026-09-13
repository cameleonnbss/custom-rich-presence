//! Presets d'apparence et de contenu.

use crate::{config::AppState, overlay};
use tauri::{AppHandle, Emitter, Manager};

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Applique un preset à la configuration, persiste, réaffiche l'overlay
/// et prévient les deux fenêtres.
pub fn apply(app: &AppHandle, name: &str) {
    let state = app.state::<AppState>();
    {
        let mut c = state.config.lock().unwrap();
        c.card.preset = name.to_string();
        match name {
            "minimal" => {
                c.appearance.width = 300.0;
                c.appearance.height = 150.0;
                c.appearance.corner_radius = 14.0;
                c.appearance.opacity = 0.95;
                c.appearance.spacing = 14.0;
                c.card.image_enabled = false;
                c.card.title_enabled = true;
                c.card.title = "En séance".into();
                c.card.subtitle_enabled = false;
                c.card.body_enabled = false;
                c.card.button_enabled = false;
                c.card.chrono_enabled = false;
                c.card.progress_enabled = false;
                c.card.datetime_enabled = false;
                c.card.media_enabled = false;
            }
            "media" => {
                c.appearance.width = 330.0;
                c.appearance.height = 430.0;
                c.appearance.corner_radius = 16.0;
                c.appearance.spacing = 16.0;
                c.card.image_enabled = true;
                c.card.title_enabled = true;
                c.card.subtitle_enabled = true;
                c.card.body_enabled = true;
                c.card.button_enabled = true;
                c.card.button_text = "Ouvrir".into();
                c.card.button_url = String::new();
                c.card.chrono_enabled = false;
                c.card.progress_enabled = true;
                c.card.datetime_enabled = false;
                c.card.media_enabled = true;
            }
            "gaming" => {
                c.appearance.width = 340.0;
                c.appearance.height = 410.0;
                c.appearance.corner_radius = 18.0;
                c.appearance.spacing = 18.0;
                c.card.image_enabled = true;
                c.card.title_enabled = true;
                if c.card.title.trim().is_empty() || c.card.preset != "gaming" {
                    c.card.title = "Minecraft".into();
                }
                c.card.subtitle_enabled = true;
                c.card.subtitle = "En train de jouer".into();
                c.card.body_enabled = false;
                c.card.button_enabled = true;
                c.card.button_text = "Ouvrir".into();
                c.card.button_url = String::new();
                c.card.chrono_enabled = true;
                c.card.chrono_started_at = now_ms();
                c.card.progress_enabled = false;
                c.card.datetime_enabled = false;
                c.card.media_enabled = false;
            }
            "youtube" => {
                c.appearance.width = 340.0;
                c.appearance.height = 390.0;
                c.appearance.corner_radius = 12.0;
                c.appearance.spacing = 14.0;
                c.card.image_enabled = true;
                c.card.title_enabled = true;
                c.card.subtitle_enabled = true;
                c.card.subtitle = "YouTube".into();
                c.card.body_enabled = false;
                c.card.button_enabled = true;
                c.card.button_text = "Regarder".into();
                c.card.button_url = String::new();
                c.card.chrono_enabled = false;
                c.card.progress_enabled = false;
                c.card.datetime_enabled = false;
                c.card.media_enabled = false;
            }
            _ => {}
        }
    }
    state.save();
    overlay::apply_from_state(app);
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.show();
    }
    overlay::set_visible_state(app, true);
    let cfg = state.config.lock().unwrap().clone();
    let _ = app.emit("card-updated", &cfg);
}
