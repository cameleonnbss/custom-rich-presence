import { defaultConfig, type Config, type GameStatus, type MediaStatus } from "./types";
import { getConfig, saveConfig, getMediaStatus, getGameStatus, getDiscordStatus, openDataFolder, quitApp } from "./bridge";
import { renderPreview } from "./preview";
import { icons } from "./icons";
import { startParticles } from "./particles";

let cfg: Config = defaultConfig();
let media: MediaStatus | null = null;
let game: GameStatus | null = null;
let dirty = false;
let saveTimer: number | null = null;

const root = document.getElementById("root")!;

/* ---------- Shell ---------- */

root.innerHTML = `
  <div class="backdrop"></div>
  <canvas id="particles"></canvas>
  <div class="app-root">
    <div class="titlebar">
      <span class="brand"><span class="brand-dot"></span><span class="app-name">Discord Presence</span></span>
      <span class="spacer"></span>
      <button id="tb-min" title="Minimize">${icons.minimize}</button>
      <button id="tb-max" title="Maximize">${icons.maximize}</button>
      <button id="tb-close" class="close" title="Close">${icons.close}</button>
    </div>
    <div class="app-shell">
      <nav class="sidebar" id="sidebar"></nav>
      <main class="content" id="content"></main>
    </div>
  </div>`;

const sidebar = root.querySelector("#sidebar") as HTMLElement;
const content = root.querySelector("#content") as HTMLElement;

(root.querySelector("#tb-min") as HTMLElement).addEventListener("click", async () => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  void getCurrentWindow().minimize();
});
(root.querySelector("#tb-max") as HTMLElement).addEventListener("click", async () => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  void getCurrentWindow().toggleMaximize();
});
(root.querySelector("#tb-close") as HTMLElement).addEventListener("click", async () => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  void getCurrentWindow().hide();
});

/* ---------- Navigation ---------- */

type Section = "status" | "presence" | "detection" | "appearance" | "settings";

const NAV: Array<{ title: string; items: Array<{ id: Section; label: string; icon: string }> }> = [
  {
    title: "Presence",
    items: [
      { id: "status", label: "Status", icon: icons.status },
      { id: "presence", label: "Content", icon: icons.presence },
      { id: "detection", label: "Detection", icon: icons.game }
    ]
  },
  {
    title: "Personalize",
    items: [
      { id: "appearance", label: "Appearance", icon: icons.sparkle }
    ]
  },
  {
    title: "Application",
    items: [
      { id: "settings", label: "Settings", icon: icons.settings }
    ]
  }
];

let current: Section = "status";
const panes = new Map<Section, HTMLElement>();
const navButtons = new Map<Section, HTMLButtonElement>();

for (const group of NAV) {
  const header = document.createElement("div");
  header.className = "nav-header";
  header.textContent = group.title;
  sidebar.appendChild(header);
  for (const item of group.items) {
    const b = document.createElement("button");
    b.className = "nav-item";
    b.innerHTML = `${item.icon}<span>${item.label}</span>`;
    b.addEventListener("click", () => navigate(item.id));
    navButtons.set(item.id, b);
    sidebar.appendChild(b);
  }
}
const gap = document.createElement("div");
gap.className = "nav-gap";
sidebar.appendChild(gap);
const ver = document.createElement("div");
ver.className = "nav-version";
ver.textContent = "v0.4.0";
sidebar.appendChild(ver);

function navigate(section: Section): void {
  current = section;
  for (const [id, b] of navButtons) b.classList.toggle("active", id === section);
  for (const [id, p] of panes) p.classList.toggle("active", id === section);
}

/* ---------- Form helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function panel(parent: HTMLElement, title: string): HTMLDivElement {
  const p = el("div", "panel");
  p.appendChild(el("h2", undefined, title));
  parent.appendChild(p);
  return p;
}
function pane(id: Section, title: string, sub: string, withPreview: boolean): HTMLDivElement {
  const p = el("div", withPreview ? "pane" : "pane single");
  const left = el("div");
  left.appendChild(el("h1", undefined, title));
  left.appendChild(el("p", "sub", sub));
  p.appendChild(left);
  const right = el("div");
  p.appendChild(right);
  p.dataset.previewHost = withPreview ? "1" : "";
  panes.set(id, p);
  content.appendChild(p);
  return p;
}
function field(label: string, control: HTMLElement): HTMLDivElement {
  const f = el("div", "field");
  f.appendChild(el("label", undefined, label));
  f.appendChild(control);
  return f;
}
function textInput(value: string, on: (v: string) => void, placeholder?: string): HTMLInputElement {
  const i = document.createElement("input");
  i.type = "text";
  i.value = value;
  if (placeholder) i.placeholder = placeholder;
  i.addEventListener("input", () => on(i.value));
  return i;
}
function toggleRow(label: string, checked: boolean, on: (v: boolean) => void): HTMLDivElement {
  const row = el("div", "toggle-row");
  row.appendChild(el("span", undefined, label));
  const sw = el("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => on(input.checked));
  const track = el("span", "track");
  sw.append(input, track);
  row.appendChild(sw);
  return row;
}
function rangeRow(label: string, min: number, max: number, step: number, value: number, on: (v: number) => void, fmt: (v: number) => string): HTMLDivElement {
  const f = el("div", "field");
  f.appendChild(el("label", undefined, label));
  const row = el("div", "range-row");
  const r = document.createElement("input");
  r.type = "range";
  r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(value);
  const val = el("span", "val", fmt(value));
  r.addEventListener("input", () => { val.textContent = fmt(Number(r.value)); on(Number(r.value)); });
  row.append(r, val);
  f.appendChild(row);
  return f;
}
function button(label: string, on: () => void, primary = false): HTMLButtonElement {
  const b = el("button", primary ? "btn primary" : "btn", label);
  b.addEventListener("click", on);
  return b;
}

/* ---------- Persistence + preview ---------- */

function markDirty(): void {
  dirty = true;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void persist(), 400);
}
async function persist(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  try {
    await saveConfig(structuredClone(cfg));
  } catch (e) {
    console.error("failed to save", e);
  }
}

let previewEl: HTMLElement | null = null;
function redraw(): void {
  if (previewEl) renderPreview(previewEl, cfg, { media, game });
}

async function refreshDetect(): Promise<void> {
  try { media = await getMediaStatus(); } catch { media = null; }
  try { game = await getGameStatus(); } catch { game = null; }
  redraw();
  renderStatus();
}

/* ---------- Panes ---------- */

function pill(kind: "ok" | "bad" | "warn" | "", text: string): HTMLDivElement {
  const p = el("div", `pill ${kind}`);
  p.appendChild(el("span", "dot"));
  p.appendChild(el("span", undefined, text));
  return p;
}

let discordPill: HTMLDivElement | null = null;
let mediaPill: HTMLDivElement | null = null;
let gamePill: HTMLDivElement | null = null;
let nowCard: HTMLElement | null = null;

function buildStatus(): void {
  const p = pane("status", "Status", "What Discord sees right now. Detection updates automatically.", true);
  const left = p.firstElementChild as HTMLElement;
  previewEl = p.lastElementChild as HTMLElement;

  const conn = panel(left, "Discord connection");
  discordPill = pill("", "Checking…");
  conn.appendChild(discordPill);
  conn.appendChild(button("Recheck", () => void refreshDetect()));

  const now = panel(left, "Now detected");
  mediaPill = pill("", "Checking media…");
  gamePill = pill("", "Checking games…");
  now.append(mediaPill, gamePill);
  nowCard = el("div");
  now.appendChild(nowCard);
}

function renderStatus(): void {
  if (discordPill) {
    void getDiscordStatus()
      .then(pipe => {
        discordPill!.className = "pill ok";
        discordPill!.lastElementChild!.textContent = `Discord detected (${pipe.replace(/^.*pipe./, "").slice(0, 40)})`;
      })
      .catch(() => {
        discordPill!.className = "pill bad";
        discordPill!.lastElementChild!.textContent = "Discord not detected — start Discord";
      });
  }
  if (mediaPill) {
    if (media?.available && media.title) {
      mediaPill.className = "pill ok";
      mediaPill.lastElementChild!.textContent = `${media.playing ? "Playing" : "Paused"}: ${media.title}`;
    } else {
      mediaPill.className = "pill";
      mediaPill.lastElementChild!.textContent = "No media session";
    }
  }
  if (gamePill) {
    if (game?.available) {
      gamePill.className = "pill ok";
      gamePill.lastElementChild!.textContent = `Game: ${game.name}`;
    } else {
      gamePill.className = "pill";
      gamePill.lastElementChild!.textContent = "No game detected";
    }
  }
  if (nowCard) {
    if (media?.available && media.title) {
      const pct = media.durationMs > 0 ? (media.positionMs / media.durationMs) * 100 : 0;
      nowCard.innerHTML = `
        <div class="now-card">
          <div class="now-art">${media.coverDataUrl ? `<img src="${media.coverDataUrl}"/>` : icons.media}</div>
          <div class="now-meta">
            <div class="now-title">${media.title.replace(/</g, "&lt;")}</div>
            <div class="now-sub">${[media.artist, media.album].filter(Boolean).join(" — ").replace(/</g, "&lt;") || "&nbsp;"}</div>
            <div class="now-bar"><div class="now-bar-fill" style="width:${pct}%"></div></div>
            <div class="now-times"><span>${fmt2(media.positionMs)}</span><span>${media.appId.replace(/</g, "&lt;")}</span><span>${fmt2(media.durationMs)}</span></div>
          </div>
        </div>`;
    } else if (game?.available) {
      nowCard.innerHTML = `
        <div class="now-card">
          <div class="now-art">${icons.game}</div>
          <div class="now-meta">
            <div class="now-title">${game.name.replace(/</g, "&lt;")}</div>
            <div class="now-sub">${game.process.replace(/</g, "&lt;")}</div>
          </div>
        </div>`;
    } else {
      nowCard.innerHTML = `<div class="hint">Nothing detected — the custom fallback from the Content tab is used.</div>`;
    }
  }
}

function fmt2(ms: number): string {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function buildPresence(): void {
  const p = pane("presence", "Content", "What the status shows when nothing is automatically detected, plus images and buttons.", true);
  const left = p.firstElementChild as HTMLElement;
  if (!previewEl) previewEl = p.lastElementChild as HTMLElement;

  const pb = panel(left, "Custom presence (fallback)");
  pb.appendChild(el("p", "hint", "Shown when no media session and no game are detected. Leave empty to clear the status instead."));
  pb.appendChild(field("Details (top line)", textInput(cfg.presence.fallbackDetails, v => { cfg.presence.fallbackDetails = v; markDirty(); redraw(); })));
  pb.appendChild(field("State (second line)", textInput(cfg.presence.fallbackState, v => { cfg.presence.fallbackState = v; markDirty(); redraw(); })));
  pb.appendChild(toggleRow("Show elapsed time", cfg.presence.showElapsed, v => { cfg.presence.showElapsed = v; markDirty(); redraw(); }));

  const pa = panel(left, "Images");
  const imgBtn = button("Choose local image…", () => {
    void (async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
      });
      if (typeof picked !== "string") return;
      try {
        const data = await import("./bridge").then(b => b.readImageDataUrl(picked));
        // The user must upload the same image to their Discord application
        // assets; we prefill the large image key suggestion.
        cfg.presence.largeImage = cfg.presence.largeImage || "app-icon";
        cfg.presence.largeText = cfg.presence.largeText || "";
        markDirty(); redraw();
        void data; // preview uses asset keys, not data URLs (Discord-side)
      } catch (e) {
        alert(String(e));
      }
    })();
  });
  pa.appendChild(imgBtn);
  pa.appendChild(field("Large image key", textInput(cfg.presence.largeImage, v => { cfg.presence.largeImage = v; markDirty(); redraw(); }, "app-icon")));
  pa.appendChild(field("Large image text", textInput(cfg.presence.largeText, v => { cfg.presence.largeText = v; markDirty(); redraw(); }, "Hover text")));
  pa.appendChild(field("Small image key", textInput(cfg.presence.smallImage, v => { cfg.presence.smallImage = v; markDirty(); redraw(); }, "optional")));
  pa.appendChild(el("p", "hint", "Keys refer to images uploaded in your Discord application (Rich Presence > Art Assets)."));

  const pbtn = panel(left, "Button");
  pbtn.appendChild(toggleRow("Show a button on the status", cfg.presence.buttonEnabled, v => { cfg.presence.buttonEnabled = v; markDirty(); redraw(); }));
  pbtn.appendChild(field("Label", textInput(cfg.presence.buttonLabel, v => { cfg.presence.buttonLabel = v; markDirty(); redraw(); }, "Open")));
  pbtn.appendChild(field("URL", textInput(cfg.presence.buttonUrl, v => { cfg.presence.buttonUrl = v; markDirty(); redraw(); }, "https://example.com")));
}

function buildDetection(): void {
  const p = pane("detection", "Detection", "What the app watches to build the status automatically.", true);
  const left = p.firstElementChild as HTMLElement;
  if (!previewEl) previewEl = p.lastElementChild as HTMLElement;

  const pd = panel(left, "Windows media (SMTC)");
  pd.appendChild(el("p", "hint", "Spotify, browsers, media players, system playback — anything exposed through Windows media controls. Title, artist, album, cover art and playback position are mirrored, with the track remaining time as the status countdown."));
  pd.appendChild(toggleRow("Follow media playback", cfg.presence.mediaEnabled, v => { cfg.presence.mediaEnabled = v; markDirty(); redraw(); }));

  const pg = panel(left, "Games & apps");
  pg.appendChild(el("p", "hint", "Detects a running game by its window title (Minecraft, Roblox, Fortnite, VALORANT and many more). Used when no media session is playing."));
  pg.appendChild(toggleRow("Detect games", cfg.presence.gameEnabled, v => { cfg.presence.gameEnabled = v; markDirty(); redraw(); }));

  const pr = panel(left, "Refresh");
  pr.appendChild(rangeRow("Poll interval", 2, 30, 1, cfg.ui.pollIntervalSecs, v => { cfg.ui.pollIntervalSecs = Math.round(v); markDirty(); }, v => `${v} s`));
  pr.appendChild(button("Probe now", () => void refreshDetect()));
}

function buildAppearance(): void {
  const p = pane("appearance", "Appearance", "How this window looks and feels.", false);
  const left = p.firstElementChild as HTMLElement;

  const pg = panel(left, "Frosted glass");
  pg.appendChild(rangeRow("Glass strength", 0, 1, 0.05, cfg.ui.glass, v => {
    cfg.ui.glass = v; markDirty();
    document.documentElement.style.setProperty("--glass-blur", `${Math.round(10 + v * 24)}px`);
  }, v => `${Math.round(v * 100)} %`));

  const pp = panel(left, "Particles");
  pp.appendChild(rangeRow("Particle count", 0, 100, 2, cfg.ui.particles, v => {
    cfg.ui.particles = Math.round(v); markDirty();
  }, v => `${v}`));
  pp.appendChild(el("p", "hint", "Applied after reopening the window (0 disables the canvas)."));
}

function buildSettings(): void {
  const p = pane("settings", "Settings", "Connection, startup and data.", false);
  const left = p.firstElementChild as HTMLElement;

  const pd = panel(left, "Discord Rich Presence");
  pd.appendChild(el("p", "hint",
    "1. Create an application on discord.com/developers (New Application). " +
    "2. Copy the Application ID below. " +
    "3. Optional: upload an image named app-icon under Rich Presence > Art Assets. " +
    "4. Keep Discord running."));
  pd.appendChild(toggleRow("Enable Rich Presence", cfg.discord.enabled, v => { cfg.discord.enabled = v; markDirty(); }));
  pd.appendChild(field("Application ID (client ID)", textInput(cfg.discord.clientId, v => { cfg.discord.clientId = v.trim(); markDirty(); }, "e.g. 1234567890123456789")));
  const status = el("div", "hint", "—");
  pd.appendChild(status);
  pd.appendChild(button("Check Discord connection", () => {
    void getDiscordStatus()
      .then(pipe => { status.textContent = `Discord detected (${pipe})`; })
      .catch(() => { status.textContent = "Discord not detected — start Discord and retry."; });
  }));

  const ps = panel(left, "Startup");
  const autoRow = toggleRow("Launch at Windows startup", false, v => {
    void (async () => {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (v) await enable(); else await disable();
    })();
  });
  ps.appendChild(autoRow);
  void (async () => {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    const input = autoRow.querySelector<HTMLInputElement>("input");
    if (input) input.checked = await isEnabled();
  })();

  const pa = panel(left, "Data");
  pa.appendChild(el("p", "hint", "Configuration is stored locally in %APPDATA%\\CustomRichPresence\\config.json. Nothing is sent to any server except the activity data Discord itself displays."));
  pa.appendChild(button("Open data folder", () => void openDataFolder()));

  const pq = panel(left, "Application");
  pq.appendChild(button("Quit completely", () => void quitApp(), true));
}

/* ---------- Init ---------- */

async function init(): Promise<void> {
  try { cfg = await getConfig(); } catch { cfg = defaultConfig(); }
  buildStatus();
  buildPresence();
  buildDetection();
  buildAppearance();
  buildSettings();
  navigate("status");
  startParticles(cfg.ui.particles);
  await refreshDetect();
  // Light periodic refresh so the status page stays honest.
  window.setInterval(() => { if (current === "status") void refreshDetect(); }, 5000);
}

void init();
