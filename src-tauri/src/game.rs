//! Game/process detection: finds the most relevant running application
//! by enumerating top-level window titles through the Win32 API.
//!
//! Heuristic: a full-screen-visible window of a known game title wins;
//! otherwise the first matching entry from the watched list. This is
//! best-effort by design — the custom presence is used when nothing
//! matches.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
    pub available: bool,
    /// Human-readable name, e.g. "Minecraft".
    pub name: String,
    /// Process executable name, e.g. "javaw.exe".
    pub process: String,
}

impl GameStatus {
    pub fn unavailable() -> Self {
        Self { available: false, name: String::new(), process: String::new() }
    }
}

/// Well-known games: (window title or process substring, display name).
const WATCHLIST: &[(&str, &str)] = &[
    ("Minecraft", "Minecraft"),
    ("javaw", "Minecraft"),
    ("Roblox", "Roblox"),
    ("Fortnite", "Fortnite"),
    ("Valorant", "VALORANT"),
    ("League of Legends", "League of Legends"),
    ("Counter-Strike", "Counter-Strike 2"),
    ("cs2.exe", "Counter-Strike 2"),
    ("Grand Theft Auto", "GTA"),
    ("GTA5", "GTA V"),
    ("Elden Ring", "Elden Ring"),
    ("Cyberpunk", "Cyberpunk 2077"),
    ("The Witcher", "The Witcher 3"),
    ("Overwatch", "Overwatch"),
    ("Apex Legends", "Apex Legends"),
    ("Rocket League", "Rocket League"),
    ("For Honor", "For Honor"),
    ("Rainbow Six", "Rainbow Six Siege"),
    ("Terraria", "Terraria"),
    ("Stardew Valley", "Stardew Valley"),
    ("Hollow Knight", "Hollow Knight"),
    ("Hades", "Hades"),
    ("Doom", "DOOM"),
    ("Battlefield", "Battlefield"),
    ("Call of Duty", "Call of Duty"),
    ("Microsoft Flight Simulator", "MS Flight Simulator"),
    ("Euro Truck Simulator", "Euro Truck Simulator 2"),
    ("Farming Simulator", "Farming Simulator"),
    ("Cities: Skylines", "Cities: Skylines"),
    ("Sims", "The Sims"),
    ("Factorio", "Factorio"),
    ("Rust Client", "Rust"),
    ("EscapeFromTarkov", "Escape from Tarkov"),
    ("PUBG", "PUBG"),
    ("Destiny 2", "Destiny 2"),
    ("Warframe", "Warframe"),
    ("World of Warcraft", "World of Warcraft"),
    ("WoW", "World of Warcraft"),
    ("Genshin Impact", "Genshin Impact"),
    ("osu!", "osu!"),
    ("Geometry Dash", "Geometry Dash"),
    ("Among Us", "Among Us"),
    ("Sons Of The Forest", "Sons of the Forest"),
    ("Palworld", "Palworld"),
    ("Lethal Company", "Lethal Company"),
    ("Baldur", "Baldur's Gate 3"),
];

#[cfg(windows)]
mod win {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, IsIconic,
    };
    use std::sync::Mutex;

    struct Collected {
        titles: Mutex<Vec<String>>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        let collected = &*(lparam.0 as *const Collected);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return windows::core::BOOL::from(true); // keep enumerating
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return windows::core::BOOL::from(true);
        }
        let mut buf = [0u16; 512];
        let copied = GetWindowTextW(hwnd, &mut buf);
        if copied > 0 {
            let title = String::from_utf16_lossy(&buf[..copied as usize]);
            collected.titles.lock().ok().map(|mut v| v.push(title));
        }
        windows::core::BOOL::from(true)
    }

    pub fn visible_window_titles() -> Vec<String> {
        let collected = Collected { titles: Mutex::new(Vec::new()) };
        unsafe {
            let _ = EnumWindows(
                Some(enum_proc),
                LPARAM(&collected as *const Collected as isize),
            );
        }
        collected.titles.into_inner().unwrap_or_default()
    }

    // Keep imports referenced (WPARAM/PCWSTR are part of the signatures surface).
    #[allow(dead_code)]
    fn _refs(_w: WPARAM, _p: PCWSTR) {}
}

#[cfg(not(windows))]
mod win {
    pub fn visible_window_titles() -> Vec<String> {
        Vec::new()
    }
}

/// Detects the currently interesting application. Never panics.
pub fn detect_blocking() -> GameStatus {
    detect_inner().unwrap_or_else(|_| GameStatus::unavailable())
}

fn detect_inner() -> Result<GameStatus, ()> {
    let titles = win::visible_window_titles();
    if titles.is_empty() {
        return Err(());
    }
    // First pass: exact-ish title match against the watchlist.
    for (needle, display) in WATCHLIST {
        for t in &titles {
            if t.to_lowercase().contains(&needle.to_lowercase()) {
                return Ok(GameStatus {
                    available: true,
                    name: display.to_string(),
                    process: t.chars().take(64).collect(),
                });
            }
        }
    }
    Err(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unavailable_status_is_empty() {
        let s = GameStatus::unavailable();
        assert!(!s.available);
        assert!(s.name.is_empty());
    }
}
