//! Overlay window management: geometry, visibility, persistence.

use crate::config::{AppState, Config};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize};

/// Disk write throttle for move/resize events.
const SAVE_THROTTLE: Duration = Duration::from_millis(800);

static LAST_SAVE: Mutex<Option<Instant>> = Mutex::new(None);

fn apply(win: &tauri::WebviewWindow, cfg: &Config) {
    let _ = win.set_size(LogicalSize::new(cfg.appearance.width, cfg.appearance.height));
    let _ = win.set_position(LogicalPosition::new(cfg.overlay.x, cfg.overlay.y));
    let _ = win.set_always_on_top(cfg.appearance.always_on_top);
}

/// Reapplies the stored geometry (after a config change).
pub fn apply_from_state(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("overlay") {
        let cfg = app.state::<AppState>().config.lock().unwrap().clone();
        apply(&win, &cfg);
    }
}

pub fn show(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("overlay") {
        apply_from_state(app);
        let _ = win.show();
        set_visible_state(app, true);
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.hide();
    }
    set_visible_state(app, false);
}

/// Shows or hides; returns the new state.
pub fn toggle(app: &AppHandle) -> bool {
    let visible = app.state::<AppState>().config.lock().unwrap().overlay.visible;
    if visible { hide(app); } else { show(app); }
    app.state::<AppState>().config.lock().unwrap().overlay.visible
}

pub fn set_visible_state(app: &AppHandle, visible: bool) {
    let state = app.state::<AppState>();
    {
        let mut c = state.config.lock().unwrap();
        if c.overlay.visible != visible {
            c.overlay.visible = visible;
            state.save();
        }
    }
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.emit("card-updated", state.config.lock().unwrap().clone());
    }
}

pub fn on_moved(app: &AppHandle, pos: &PhysicalPosition<i32>) {
    let state = app.state::<AppState>();
    if let Some(win) = app.get_webview_window("overlay") {
        if let Ok(scale) = win.scale_factor() {
            let logical = pos.to_logical(scale);
            let mut c = state.config.lock().unwrap();
            c.overlay.x = logical.x;
            c.overlay.y = logical.y;
        }
    }
    throttled_save(&state);
}

pub fn on_resized(app: &AppHandle, size: &PhysicalSize<u32>) {
    let state = app.state::<AppState>();
    if let Some(win) = app.get_webview_window("overlay") {
        if let Ok(scale) = win.scale_factor() {
            let logical = size.to_logical(scale);
            let mut c = state.config.lock().unwrap();
            c.appearance.width = logical.width;
            c.appearance.height = logical.height;
        }
    }
    throttled_save(&state);
}

pub fn throttled_save(state: &tauri::State<'_, AppState>) {
    let due = {
        let mut last = LAST_SAVE.lock().unwrap();
        let now = Instant::now();
        let write = last.map(|t| now.duration_since(t) >= SAVE_THROTTLE).unwrap_or(true);
        if write {
            *last = Some(now);
        }
        write
    };
    if due {
        state.save();
    }
}

/// Final save (on app exit).
pub fn flush(state: &tauri::State<'_, AppState>) {
    state.save();
}
