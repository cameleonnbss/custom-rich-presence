//! Discord worker: periodically mirrors the current card to Discord
//! (Rich Presence). Best-effort: never panics; a missing or refusing
//! Discord client never affects the panel.

use crate::config::AppState;
use crate::discord;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Manager;

static DISCORD_RUNNING: AtomicBool = AtomicBool::new(false);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn truncated(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        let cut: String = s.chars().take(max - 1).collect();
        format!("{cut}…")
    } else {
        s.to_string()
    }
}

/// Runs an IPC operation with a bounded delay: if Discord does not answer
/// (half-dead connection), the cycle is not blocked forever.
fn bounded<T, F>(dur: Duration, f: F) -> Option<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(dur).ok()
}

pub fn start(app: tauri::AppHandle) {
    if DISCORD_RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    tauri::async_runtime::spawn_blocking(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        let Some(state) = app.try_state::<AppState>() else { continue };
        let (cfg_card, media_enabled) = {
            let c = state.config.lock().unwrap();
            (c.card.clone(), c.card.media_enabled)
        };
        let discord_on = {
            let c = state.config.lock().unwrap();
            c.discord.enabled
        };
        if !discord_on {
            continue;
        }
        // Clear when the presence is hidden or has no content.
        let overlay_visible = {
            let c = state.config.lock().unwrap();
            c.overlay.visible
        };
        if !overlay_visible {
            let cid = state.config.lock().unwrap().discord.client_id.clone();
            let _ = bounded(Duration::from_secs(5), move || discord::clear_activity(&cid));
            std::thread::sleep(Duration::from_millis(7500));
            continue;
        }
        let media = if media_enabled {
            crate::media::read_smtc_blocking()
        } else {
            crate::media::MediaStatus::unavailable()
        };
        let title = if media.available && !media.title.is_empty() {
            media.title.clone()
        } else {
            cfg_card.title.clone()
        };
        let subtitle = if media.available && !media.artist.is_empty() {
            format!("{} — {}", media.artist, media.album)
        } else {
            cfg_card.subtitle.clone()
        };
        let cid = state.config.lock().unwrap().discord.client_id.clone();
        let start_ms = if cfg_card.chrono_enabled && cfg_card.chrono_started_at > 0 {
            Some(cfg_card.chrono_started_at)
        } else {
            None
        };
        let end_ms = if cfg_card.progress_enabled && media.available && media.duration_ms > 0 {
            Some(now_ms() + media.duration_ms.saturating_sub(media.position_ms))
        } else {
            None
        };
        let push = move || discord::set_activity(
            &cid,
            &truncated(&title, 128),
            &truncated(&subtitle, 128),
            "app-icon",
            &truncated(&title, 64),
            start_ms,
            end_ms,
        );
        let _ = bounded(Duration::from_secs(8), push);
        std::thread::sleep(Duration::from_millis(7500));
    });
}