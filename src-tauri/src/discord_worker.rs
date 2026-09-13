//! Discord worker: periodically builds a presence payload from the
//! detected media session / game / custom fallback and pushes it to
//! Discord. Best-effort: never panics; a missing or refusing Discord
//! client never affects the settings window.

use crate::config::{AppState, Config};
use crate::discord;
use crate::game;
use crate::media;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

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

/// Last pushed payload signature; avoids hammering Discord with
/// identical SET_ACTIVITY frames.
static LAST_SIG: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn signature(
    enabled: bool,
    client_id: &str,
    details: &str,
    state_text: &str,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
    button: &str,
) -> String {
    format!("{enabled}|{client_id}|{details}|{state_text}|{start_ms:?}|{end_ms:?}|{button}")
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
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).map(|v| {
            let _ = tx.send(v);
        });
    });
    rx.recv_timeout(dur).ok()
}

enum Payload {
    Media(media::MediaStatus),
    Game(game::GameStatus),
    Custom,
    Clear,
}

/// Reads the config and probes the system to decide what to display.
fn decide(cfg: &Config) -> Payload {
    let p = &cfg.presence;
    // Text-only mode: the typed text IS the status, skip all detection.
    if p.text_only {
        if !p.fallback_details.trim().is_empty() || !p.fallback_state.trim().is_empty() {
            return Payload::Custom;
        }
        return Payload::Clear;
    }
    if p.media_enabled {
        let media = media::read_smtc_blocking();
        if media.available && !media.title.is_empty() {
            return Payload::Media(media);
        }
    }
    if p.game_enabled {
        let game = game::detect_blocking();
        if game.available {
            return Payload::Game(game);
        }
    }
    if !p.fallback_details.trim().is_empty() || !p.fallback_state.trim().is_empty() {
        Payload::Custom
    } else {
        Payload::Clear
    }
}

/// Builds the (details, state, start, end, large_text) tuple for a payload.
fn compose(cfg: &Config, payload: &Payload) -> (String, String, Option<u64>, Option<u64>, String) {
    let p = &cfg.presence;
    match payload {
        Payload::Media(m) => {
            let artist_album = [m.artist.as_str(), m.album.as_str()]
                .iter()
                .filter(|s| !s.is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join(" — ");
            let end = if m.duration_ms > m.position_ms && m.playing {
                Some(now_ms() + (m.duration_ms - m.position_ms))
            } else {
                None
            };
            let large = if !p.large_text.is_empty() {
                p.large_text.clone()
            } else if !m.album.is_empty() {
                m.album.clone()
            } else {
                String::new()
            };
            (
                truncated(&m.title, 128),
                truncated(&artist_album, 128),
                None,
                end,
                truncated(&large, 64),
            )
        }
        Payload::Game(g) => {
            let start = if p.show_elapsed { Some(cfg.started_at) } else { None };
            let state_text = if p.verb.eq_ignore_ascii_case("playing") {
                String::new()
            } else {
                "Playing".to_string()
            };
            (
                truncated(&g.name, 128),
                truncated(&state_text, 128),
                start,
                None,
                String::new(),
            )
        }
        Payload::Custom => {
            let start = if p.show_elapsed { Some(cfg.started_at) } else { None };
            (
                truncated(p.fallback_details.trim(), 128),
                truncated(p.fallback_state.trim(), 128),
                start,
                None,
                truncated(p.large_text.trim(), 64),
            )
        }
        Payload::Clear => (String::new(), String::new(), None, None, String::new()),
    }
}

fn push_once(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let snapshot: Config = state.config.lock().unwrap().clone();
    // Auto-enable Discord as soon as there is anything to display.
    let enabled = snapshot.discord.enabled
        || !snapshot.presence.fallback_details.trim().is_empty()
        || !snapshot.presence.fallback_state.trim().is_empty();

    let payload = decide(&snapshot);
    let (details, state_text, start_ms, end_ms, large_text) = compose(&snapshot, &payload);
    let cid = snapshot.discord.client_id.clone();
    let large_image = snapshot.presence.large_image.trim().to_string();
    let small_image = snapshot.presence.small_image.trim().to_string();
    let button = if snapshot.presence.button_enabled {
        format!("{}|{}", snapshot.presence.button_label, snapshot.presence.button_url)
    } else {
        String::new()
    };
    let (bl, bu) = match button.split_once('|') {
        Some((l, u)) => (l.to_string(), u.to_string()),
        None => (String::new(), String::new()),
    };

    let sig = signature(
        enabled,
        &cid,
        &details,
        &state_text,
        if enabled { start_ms } else { None },
        if enabled { end_ms } else { None },
        &button,
    );
    let changed = {
        let mut last = LAST_SIG.lock().unwrap_or_else(|e| e.into_inner());
        if last.as_deref() == Some(sig.as_str()) {
            false
        } else {
            *last = Some(sig.clone());
            true
        }
    };
    if !changed {
        return;
    }

    if !enabled {
        let _ = bounded(Duration::from_secs(5), move || discord::clear_activity(&cid));
        let _ = app.emit("presence-state", "cleared");
        return;
    }

    let _ = app.emit("presence-state", "connecting");
    let app2 = app.clone();
    let res = bounded(Duration::from_secs(8), move || {
        discord::set_activity(
            &cid,
            &details,
            &state_text,
            &large_image,
            &large_text,
            &small_image,
            start_ms,
            end_ms,
            &bl,
            &bu,
        )
    });
    match res {
        Some(Ok(msg)) => {
            let _ = app2.emit("presence-state", msg);
        }
        Some(Err(e)) => {
            let _ = app2.emit("presence-state", format!("error: {e}"));
        }
        None => {
            let _ = app2.emit("presence-state", "error: Discord did not answer");
        }
    }
}

pub fn start(app: tauri::AppHandle) {
    if DISCORD_RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = Arc::new(app);
    std::thread::spawn(move || {
        loop {
            // Catch panics so a WinRT hiccup can never kill the worker.
            let handle = app.clone();
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                push_once(&handle);
            }));
            let interval = {
                let Some(state) = handle.try_state::<AppState>() else {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                };
                let secs = state.config.lock().unwrap().ui.poll_interval_secs;
                secs.clamp(1, 30) as u64
            };
            std::thread::sleep(Duration::from_secs(interval));
        }
    });
}
