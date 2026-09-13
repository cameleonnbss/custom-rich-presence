# Custom Rich Presence

A small Windows utility that displays a **floating presence panel** on your desktop:
image, title, subtitle, free text, button with link, chronometer, progress bar,
Windows media playback or a YouTube video — fully configurable. It can also mirror
the card as a **Discord Rich Presence** status.

![stack](https://img.shields.io/badge/stack-Tauri_2%20%2B%20TypeScript-blue)

## Features

- **Floating panel**, independent from the editor: optional always-on-top, drag to move,
  resize handle, position lock (`Ctrl+Alt+P` on the panel), opacity, remembered position,
  snap to any corner, multi-monitor aware.
- **Editor** with a live preview (changes appear immediately, rendered by the same
  component as the overlay).
- **Elements**: image, title, subtitle, free text, button + link, chronometer,
  progress bar, date/time — each can be toggled independently.
- **Windows media**: reads metadata from *any* compatible app through the native
  SMTC API (title, artist, album, cover art, position, duration, play state,
  source app). No media detected → the card simply keeps its static content, no error.
- **YouTube**: paste a URL, the thumbnail and title are fetched through the public
  oEmbed endpoint (no API key); the thumbnail is cached locally for offline display.
  The architecture allows adding a dedicated API later (`src-tauri/src/youtube.rs`).
- **Discord Rich Presence**: the card is mirrored as a Discord status through
  Discord's local IPC (named pipe, no server). Title, subtitle, chronometer
  (timestamps) and the associated Discord app image. Requires a Discord
  application ID (see below) and Discord running.
- **Presets**: Minimal, Media, Gaming, YouTube, Custom — available from the editor
  or the tray menu.
- **System tray**: left click = show/hide the panel, right click = menu
  (Show, Hide, Edit, Presets, Settings, Quit).
- **Launch at Windows startup**: toggleable in Settings.
- **Local storage**: `%APPDATA%\CustomRichPresence\config.json` (atomic writes).
  No server connection; everything works offline except optional YouTube fetches.

## Build

Prerequisites: [Node.js 18+](https://nodejs.org), [Rust stable](https://rustup.rs)
with the `x86_64-pc-windows-msvc` target, and the Windows build tools
(VS Build Tools with the Windows SDK).

```powershell
npm install
npm test           # TypeScript tests (vitest)
npm run icons      # regenerate icons from assets/icon.png
npm run tauri:build
```

Rust unit tests:

```powershell
cd src-tauri
cargo test
```

The NSIS installer and the executable are produced under
`src-tauri/target/release/bundle/`. With the MSVC toolchain the exe is
statically linked against WebView2Loader and runs fully standalone.

If the Windows username contains non-ASCII characters **and** only the GNU
Rust toolchain is available, use `powershell -File scripts/build.ps1`, which
redirects the build to an ASCII path. With the standard MSVC toolchain,
`npm run tauri:build` works as-is.

### Development

```powershell
npm run tauri:dev
```

## Discord Rich Presence

1. Create an application on [discord.com/developers](https://discord.com/developers/applications)
   (a single "New Application" click is enough — the "description" field becomes
   the caption of the status).
2. Copy the **Application ID** and paste it in Settings > Discord Rich Presence.
3. Optional: under "Rich Presence > Art Assets", upload an image named `app-icon`
   (it is displayed next to the status).
4. Enable Discord Rich Presence, start Discord, show the panel.

The connection uses Discord's official IPC protocol (local named pipe): nothing
transits over the Internet beyond what Discord already displays. If Discord is
closed, the app keeps working and retries periodically, without blocking errors.

## Custom icon

Simply replace `assets/icon.png` with your icon (square, 512×512 recommended),
then run:

```powershell
npm run icons      # derives icons for the window, taskbar, tray and installer
npm run tauri:build
```

The derived files are regenerated in `src-tauri/icons/` (`.ico`, multiple PNGs):
executable, window, tray and shortcut icons.

## Integrations

The system is modular:

- `src-tauri/src/media.rs` — SMTC reader (any compatible Windows app).
- `src-tauri/src/youtube.rs` — YouTube mode (oEmbed today, dedicated API tomorrow).
- `src-tauri/src/presets.rs` — presets.
- `src-tauri/src/discord.rs` + `discord_worker.rs` — Discord IPC client and push loop.

Adding an integration = one module + one Tauri command + one panel in the editor
(`src/editor.ts`).

## Notes

- Emoji-free interface: inline monochrome SVG pictograms (`src/icons.ts`).
- The panel consumes very few resources: no active timer as long as no dynamic
  element (chronometer, clock, media progress) is displayed; media polling only
  runs while "follow playback" is enabled.
