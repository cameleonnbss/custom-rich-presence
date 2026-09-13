//! Application entry point: tray, windows, commands.

mod commands;
mod config;
mod discord;
mod discord_worker;
mod media;
mod overlay;
mod presets;
mod youtube;

use config::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let edit = MenuItem::with_id(app, "edit", "Edit", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let presets_menu = Submenu::with_id(app, "presets", "Presets", true)?;
    for name in ["minimal", "media", "gaming", "youtube", "custom"] {
        let label = match name {
            "minimal" => "Minimal",
            "media" => "Media",
            "gaming" => "Gaming",
            "youtube" => "YouTube",
            _ => "Custom",
        };
        let item = MenuItem::with_id(app, format!("preset-{name}"), label, true, None::<&str>)?;
        presets_menu.append(&item)?;
    }

    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&show, &hide, &edit, &sep1, &presets_menu, &sep2, &settings, &quit],
    )?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("embedded icon").clone())
        .tooltip("Custom Rich Presence")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => overlay::show(app),
            "hide" => overlay::hide(app),
            "edit" => show_main(app, None),
            "settings" => show_main(app, Some("parametres")),
            "quit" => app.exit(0),
            id => {
                if let Some(name) = id.strip_prefix("preset-") {
                    presets::apply(app, name);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                overlay::toggle(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn show_main(app: &tauri::AppHandle, section: Option<&str>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        if let Some(s) = section {
            let _ = win.emit("navigate", s);
        }
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
            commands::get_media_status,
            commands::fetch_youtube_info,
            commands::youtube_thumbnail_data,
            commands::reset_chrono,
            commands::show_overlay,
            commands::hide_overlay,
            commands::toggle_overlay,
            commands::set_overlay_position,
            commands::snap_overlay,
            commands::set_overlay_lock,
            commands::apply_preset,
            commands::open_data_folder,
            commands::read_image_data_url,
            commands::get_discord_status,
            commands::quit_app,
        ])
        .setup(|app| {
            build_tray(app)?;
            discord_worker::start(app.handle().clone());
            // Restore the presence if it was visible on close.
            if app.state::<AppState>().config.lock().unwrap().overlay.visible {
                overlay::show(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // The window minimizes to the notification area.
                api.prevent_close();
                let _ = window.hide();
                if window.label() == "overlay" {
                    overlay::set_visible_state(window.app_handle(), false);
                }
            }
            tauri::WindowEvent::Moved(pos) if window.label() == "overlay" => {
                overlay::on_moved(window.app_handle(), pos);
            }
            tauri::WindowEvent::Resized(size) if window.label() == "overlay" => {
                overlay::on_resized(window.app_handle(), size);
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("failed to initialize Tauri")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                overlay::flush(&app.state::<AppState>());
            }
        });
}
