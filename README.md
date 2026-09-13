# Discord Presence

Automatic **Discord Rich Presence** for Windows, in a single lightweight `.exe`.
Listen to a song on Spotify, play Minecraft — your Discord status updates by itself.

![stack](https://img.shields.io/badge/stack-Tauri_2%20%2B%20Rust-blue)

## What it does

- **Windows media (SMTC)** — mirrors whatever any app exposes through Windows media
  controls: Spotify, browsers, media players. Title, artist, album, cover art,
  playback position, remaining-time countdown, play/pause state.
- **Game detection** — recognizes running games by their window title
  (Minecraft, Roblox, Fortnite, VALORANT, League of Legends, Cyberpunk 2077,
  Elden Ring, and many more — the watchlist lives in `src-tauri/src/game.rs`).
- **Custom presence** — static fallback text, elapsed timer, large/small image keys
  and a clickable button, for when nothing is detected.
- **Live Discord-style preview** — the settings window shows a pixel-close Discord
  profile card of what your status looks like at any moment.
- **Modern UI** — dark frosted-glass panels over a soft color-field backdrop,
  ambient particles (adjustable), monochrome pictograms, no emoji, Discord accent.

## Setup (once)

1. Create an application on [discord.com/developers](https://discord.com/developers/applications)
   — a single "New Application" click is enough.
2. Copy the **Application ID** into the app: Settings > Discord Rich Presence.
3. Optional: upload an image named `app-icon` under *Rich Presence > Art Assets*
   (512×512 recommended) — it becomes the large image on your status.
4. Enable **Rich Presence** and keep Discord running. That's it.

The connection uses Discord's official local IPC (named pipe). Nothing transits
over the Internet beyond what Discord itself displays. If Discord is closed,
the app keeps running and retries quietly.

## Build

Prerequisites: [Node.js 18+](https://nodejs.org), [Rust stable](https://rustup.rs)
with the `x86_64-pc-windows-msvc` target, and VS Build Tools with the Windows SDK.

```powershell
npm install
npm test           # frontend tests (vitest)
npm run tauri:build
```

Rust tests:

```powershell
cd src-tauri
cargo test
```

Artifacts are produced under `src-tauri/target/release/bundle/nsis/` (installer)
and `src-tauri/target/release/` (portable exe, statically linked WebView2Loader).

## Architecture

- `src-tauri/src/discord.rs` — Discord IPC client (handshake, SET_ACTIVITY, buttons).
- `src-tauri/src/discord_worker.rs` — push loop: change detection, panic guards,
  bounded timeouts, emits live state to the UI.
- `src-tauri/src/media.rs` — SMTC reader (native Windows API, never panics).
- `src-tauri/src/game.rs` — window-title game detection with a curated watchlist.
- `src-tauri/src/config.rs` — atomic JSON persistence in
  `%APPDATA%\CustomRichPresence\config.json`.
- `src/app.ts` + `src/preview.ts` — settings UI and Discord-profile preview.

## Notes

- The worker only pushes to Discord when something actually changed.
- Media polling runs on a configurable interval (2–30 s) and is skipped entirely
  when media follow is disabled.
- Configuration is local-only. No account, no server, no telemetry.
