//! Application entry point: tray, main window, commands.

mod commands;
mod config;
mod discord;
mod discord_worker;
mod game;
mod media;

use config::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open settings", true, None::<&str>)?;
    let status = MenuItem::with_id(app, "toggle", "Discord: off", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &sep, &status, &sep, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("embedded icon").clone())
        .tooltip("Discord Presence")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "toggle" => {
                let state = app.state::<AppState>();
                {
                    let mut c = state.config.lock().unwrap();
                    c.discord.enabled = !c.discord.enabled;
                }
                state.save();
                update_tray_status(app);
                let _ = app.emit("card-updated", {
                    let c = state.config.lock().unwrap();
                    c.clone()
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Reflects the Discord toggle state in the tray menu label.
pub fn update_tray_status(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let on = state.config.lock().map(|c| c.discord.enabled).unwrap_or(false);
    if let Some(menu) = app.menu() {
        if let Some(item) = menu.get("toggle") {
            if let Some(item) = item.as_menuitem() {
                let _ = item.set_text(if on { "Discord: on" } else { "Discord: off" });
            }
        }
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::load())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::push_now,
            commands::get_media_status,
            commands::get_game_status,
            commands::read_image_data_url,
            commands::prepare_asset,
            commands::open_asset_upload_page,
            commands::open_data_folder,
            commands::get_discord_status,
            commands::quit_app,
        ])
        .setup(|app| {
            build_tray(app)?;
            discord_worker::start(app.handle().clone());
            update_tray_status(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // The settings window hides to the notification area.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to initialize Tauri")
        .run(|_app, _event| {});
}
