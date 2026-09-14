# Architecture — Custom Discord Rich Presence (Rust + TypeScript + CSS)

## What this app is

A small Windows app that shows a **custom status on your Discord profile**,
shaped exactly like a game status:

```
┌──────────────────────────────┐
│  MY APP NAME        (from Application ID)                    │
│  ▓▓▓  Playing My Status      │  verb + details (title)      │
│  ▓▓▓  since 12:34      1h24  │  state + elapsed time        │
│        [ My Button ]         │  optional button + link      │
│  small badge (optional)      │                              │
└──────────────────────────────┘
```

Icon, title, elapsed time, optional button — the same fields a game sends.
Everything is custom: your text, your image, your link, your elapsed clock.

## Stack

| Layer     | Tech                              | Role                                              |
|-----------|-----------------------------------|---------------------------------------------------|
| Core      | Rust (tauri v2, MSVC toolchain)   | Discord IPC, presence payloads, config, assets    |
| UI        | TypeScript + Vite                 | one settings window, live Discord-style preview   |
| Style     | CSS (glass panels, particles)     | modern frosted-glass look                         |

## How Discord Rich Presence actually works (verified live on this machine)

1. Discord client exposes named pipes `\\.\pipe\discord-ipc-0..9`
2. Connect → send frame op 0: `{"v":1,"client_id":"<Application ID>"}`
3. Discord replies op 2 `READY` — or closes with `Invalid Client ID`
4. Send op 1 `SET_ACTIVITY` with `details` (title), `state` (subtitle),
   `timestamps.start` (epoch ms — **must be ≥ 1**, a 0 is rejected),
   `assets.large_image` (asset key from the app's Art Assets page),
   `assets.large_text`, `buttons: [{label, url}]`
5. The status shows **on your profile**, like a game's. It stays while the
   connection lives; Discord drops it ~15 s after disconnect
6. No user-token, no ToS risk: the local IPC protocol is the official path
7. Images must be **asset keys** uploaded once to your application's
   Art Assets (512×512) — raw URLs are not accepted over IPC

## The two constraints that shape everything

- **An Application ID is mandatory.** The status lives under an application.
  Borrowed public IDs die (verified: one worked, then Discord rejected it),
  so the app guides a one-time 30-second creation and validates the pasted
  ID live against Discord (handshake probe).
- **Images are asset keys.** The app resizes any picked image to 512×512 and
  opens the upload page; the user uploads once, types the key, done.

## Core modules (Rust)

- `discord.rs` — IPC actor thread owning one persistent connection:
  handshake validation (op 2 READY vs op 2 Invalid Client ID), SET_ACTIVITY,
  clear, auto-reconnect, bounded timeouts, nonce, frame codec
- `discord_worker.rs` — builds payloads from config (text / media / game),
  change-detection signature, push + clear, guards (timestamps ≥ 1,
  non-empty sections only), `push_now` for the button
- `config.rs` — camelCase JSON at `%APPDATA%\CustomRichPresence\config.json`,
  atomic writes, defaults
- `media.rs` — SMTC (any Windows media app) → title/artist/album/position
- `game.rs` — window enumeration → curated game list (like a game would)
- `commands.rs` — Tauri commands: get/save config, push_now,
  validate_client_id (live handshake probe), prepare_asset (512×512),
  media/game status, tray helpers
- `lib.rs` — tray, single settings window, autostart plugin

## UI (TypeScript + CSS)

One linear flow, in order of importance:

1. **Connect** — Application ID field, live validation, portal link
2. **Card** — image, main line, second line, button label + link
3. **Push** — one green button + real error text underneath
4. Live Discord-profile preview beside the form
5. Collapsed extras: elapsed timer, music/game detection, particles

## Reference repositories (proven implementations to lean on)

- **maximmax42/Discord-CustomRP** — the reference custom-RP manager for
  Windows: profiles, tray, autostart, elapsed timestamps, asset handling.
  Feature bar and UX model for this app
- **vionya/discord-rich-presence** (Rust crate) — minimal, correct IPC
  protocol implementation; closest to this app's `discord.rs` actor design
- **qwertyquerty/pypresence** — the classic; its payload schemas
  (SET_ACTIVITY shape, timestamps, assets, buttons) are the compatibility
  baseline every tool copies
- **Snazzah/SublimeDiscordRP** — clean payload/pipe reference, good error
  handling patterns
- **WorldOfBasti/CustomRichPresence** — GUI tool doing exactly this job
  (profiles + GUI patterns worth borrowing)

## What NOT to do (learned the hard way here)

- No borrowed public Application IDs (works once, then `Invalid Client ID`)
- No raw image URLs over IPC (needs pre-signed `mp:external/` hashes from
  the client itself; user-token hacks = ToS violation)
- No `timestamps.start = 0` (schema requires ≥ 1)
- No reconnect-per-push (jams Discord's IPC; keep one persistent connection)
- No silent failures: surface Discord's real error text in the UI
