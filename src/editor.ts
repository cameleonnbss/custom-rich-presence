import { renderCard } from "./card";
import type { Config, MediaStatus } from "./types";
import { icons } from "./icons";
import {
  getConfig, saveConfig, fetchYoutubeInfo, youtubeThumbnailData,
  resetChrono, showOverlay, hideOverlay, snapOverlay, setOverlayLock,
  applyPreset, openDataFolder, readImageDataUrl, getMediaStatus, getDiscordStatus
} from "./bridge";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const APP_VERSION = "v0.3.0";

/**
 * Editor: custom title bar, side navigation, configuration panels
 * and live preview.
 */

let cfg: Config;
let media: MediaStatus | null = null;
let dirty = false;
let saveTimer: number | null = null;

const root = document.getElementById("root")!;

/* ---------- Shell construction ---------- */

const titlebar = document.createElement("div");
titlebar.className = "titlebar";
const appName = document.createElement("span");
appName.className = "app-name";
appName.textContent = "Custom Rich Presence";
const tbSpacer = document.createElement("span");
tbSpacer.className = "spacer";
const btnMin = document.createElement("button");
btnMin.innerHTML = icons.minimize;
const btnMax = document.createElement("button");
btnMax.innerHTML = icons.maximize;
const btnClose = document.createElement("button");
btnClose.className = "close";
btnClose.innerHTML = icons.close;
titlebar.append(appName, tbSpacer, btnMin, btnMax, btnClose);

const shell = document.createElement("div");
shell.className = "app-shell";
const sidebar = document.createElement("nav");
sidebar.className = "sidebar";
const content = document.createElement("main");
content.className = "content";
shell.append(sidebar, content);
root.append(titlebar, shell);

btnMin.addEventListener("click", () => void getCurrentWindow().minimize());
btnMax.addEventListener("click", () => void getCurrentWindow().toggleMaximize());
btnClose.addEventListener("click", () => void getCurrentWindow().hide());

/* ---------- Navigation ---------- */

type Section = "presence" | "musique" | "youtube" | "custom" | "apparence" | "presets" | "parametres";

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: Section; label: string; icon: string }> }> = [
  {
    title: "Content",
    items: [
      { id: "presence", label: "Presence", icon: icons.card },
      { id: "musique", label: "Media", icon: icons.music },
      { id: "youtube", label: "YouTube", icon: icons.youtube },
      { id: "custom", label: "Custom", icon: icons.custom }
    ]
  },
  {
    title: "Personalize",
    items: [
      { id: "apparence", label: "Appearance", icon: icons.appearance },
      { id: "presets", label: "Presets", icon: icons.pin }
    ]
  },
  {
    title: "Application",
    items: [
      { id: "parametres", label: "Settings", icon: icons.settings }
    ]
  }
];

let currentSection: Section = "presence";
const navButtons = new Map<Section, HTMLButtonElement>();

for (const group of NAV_GROUPS) {
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
const sidebarEnd = document.createElement("div");
sidebarEnd.className = "nav-gap";
sidebar.appendChild(sidebarEnd);
const versionLabel = document.createElement("div");
versionLabel.className = "nav-version";
versionLabel.textContent = APP_VERSION;
sidebar.appendChild(versionLabel);

/* ---------- Form helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(labelText: string, control: HTMLElement): HTMLDivElement {
  const f = el("div", "field");
  const l = el("label", undefined, labelText);
  f.append(l, control);
  return f;
}

function textInput(value: string, onInput: (v: string) => void, placeholder?: string): HTMLInputElement {
  const i = document.createElement("input");
  i.type = "text";
  i.value = value;
  if (placeholder) i.placeholder = placeholder;
  i.addEventListener("input", () => onInput(i.value));
  return i;
}

function textarea(value: string, onInput: (v: string) => void, placeholder?: string): HTMLTextAreaElement {
  const t = document.createElement("textarea");
  t.value = value;
  if (placeholder) t.placeholder = placeholder;
  t.addEventListener("input", () => onInput(t.value));
  return t;
}

function toggleRow(labelText: string, checked: boolean, onChange: (v: boolean) => void): HTMLDivElement {
  const row = el("div", "toggle-row");
  const span = el("span", undefined, labelText);
  const sw = el("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const track = el("span", "track");
  input.addEventListener("change", () => onChange(input.checked));
  sw.append(input, track);
  row.append(span, sw);
  return row;
}

function rangeRow(
  labelText: string, min: number, max: number, step: number, value: number,
  onInput: (v: number) => void, fmt: (v: number) => string
): HTMLDivElement {
  const f = el("div", "field");
  const l = el("label", undefined, labelText);
  const row = el("div", "range-row");
  const r = document.createElement("input");
  r.type = "range";
  r.min = String(min);
  r.max = String(max);
  r.step = String(step);
  r.value = String(value);
  const val = el("span", "val", fmt(value));
  r.addEventListener("input", () => {
    val.textContent = fmt(Number(r.value));
    onInput(Number(r.value));
  });
  row.append(r, val);
  f.append(l, row);
  return f;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el("button", primary ? "btn primary" : "btn", label);
  b.addEventListener("click", onClick);
  return b;
}

/* ---------- Persistence + preview ---------- */

function markDirty(): void {
  dirty = true;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void persist(), 350);
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

const previewLabel = el("div", "preview-label", "Live preview");
const stage = el("div", "preview-stage");
const cardEl = el("div");
stage.appendChild(cardEl);
const previewBox = el("div", "preview-box");
previewBox.append(previewLabel, stage);

function redraw(): void {
  renderCard(cardEl, cfg, { media });
}

/* ---------- Panels ---------- */

const panes = new Map<Section, HTMLElement>();

function pane(section: Section, withPreview: boolean): HTMLDivElement {
  const p = el("div", withPreview ? "pane" : "pane single");
  panes.set(section, p);
  content.appendChild(p);
  return p;
}

function panel(parent: HTMLElement, title?: string): HTMLDivElement {
  const p = el("div", "panel");
  if (title) p.appendChild(el("h2", undefined, title));
  parent.appendChild(p);
  return p;
}

function navigate(section: Section): void {
  currentSection = section;
  for (const [id, b] of navButtons) b.classList.toggle("active", id === section);
  for (const [id, p] of panes) p.classList.toggle("active", id === section);
  if (section === "musique") void pollMediaEditor();
}

/* ----- Presence ----- */

function buildPresence(): void {
  const p = pane("presence", true);
  const p1 = panel(p, "Card content");
  p1.appendChild(toggleRow("Image", cfg.card.imageEnabled, v => { cfg.card.imageEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(toggleRow("Title", cfg.card.titleEnabled, v => { cfg.card.titleEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(field("Title", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p1.appendChild(toggleRow("Subtitle", cfg.card.subtitleEnabled, v => { cfg.card.subtitleEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(field("Subtitle", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
  p1.appendChild(toggleRow("Button", cfg.card.buttonEnabled, v => { cfg.card.buttonEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(field("Button label", textInput(cfg.card.buttonText, v => { cfg.card.buttonText = v; markDirty(); redraw(); })));
  p1.appendChild(field("Button link (https://…)", textInput(cfg.card.buttonUrl, v => { cfg.card.buttonUrl = v; markDirty(); redraw(); }, "https://example.com")));

  const p2 = panel(p, "Dynamic elements");
  p2.appendChild(toggleRow("Chronometer", cfg.card.chronoEnabled, v => {
    cfg.card.chronoEnabled = v;
    if (v && cfg.card.chronoStartedAt === 0) cfg.card.chronoStartedAt = Date.now();
    markDirty(); redraw();
  }));
  const chronoBtn = button("Reset chronometer", () => void resetChrono().then(() => redraw()), false);
  p2.appendChild(chronoBtn);
  p2.appendChild(toggleRow("Progress bar", cfg.card.progressEnabled, v => { cfg.card.progressEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(rangeRow("Progress", 0, 100, 1, cfg.card.progressValue,
    v => { cfg.card.progressValue = v; markDirty(); redraw(); }, v => `${Math.round(v)} %`));
  p2.appendChild(field("Maximum", textInput(String(cfg.card.progressMax), v => {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n > 0) { cfg.card.progressMax = n; markDirty(); redraw(); }
  })));
  p2.appendChild(toggleRow("Date and time", cfg.card.datetimeEnabled, v => { cfg.card.datetimeEnabled = v; markDirty(); redraw(); }));
}

/* ----- Media ----- */

function buildMusique(): void {
  const p = pane("musique", true);
  const p1 = panel(p, "Windows media playback");
  p1.appendChild(el("p", "hint",
    "Uses the Windows System Media Transport Controls (SMTC): Spotify, browsers, system players and any compatible app. " +
    "If nothing is detected, the card simply shows its static content — no error is raised."));
  p1.appendChild(toggleRow("Follow current playback", cfg.card.mediaEnabled, v => {
    cfg.card.mediaEnabled = v; markDirty(); redraw();
  }));

  p1.appendChild(el("div", "hint", "—"));
  p1.appendChild(button("Refresh", () => void pollMediaEditor()));

  const p2 = panel(p, "Fallback texts");
  p2.appendChild(el("p", "hint",
    "Shown when the card is not following playback or when no media is detected."));
  p2.appendChild(field("Title", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p2.appendChild(field("Subtitle", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
}

async function pollMediaEditor(): Promise<void> {
  try {
    media = await getMediaStatus();
    if (media.available) {
      const st = media.playing ? "playing" : "paused";
      statusText = `${media.title} — ${media.artist || "unknown artist"} (${st}, via ${media.appId || "unknown app"})`;
    } else {
      statusText = "No media detected at the moment.";
    }
  } catch {
    statusText = "No media detected at the moment.";
  }
  const statusEl = panes.get("musique")?.querySelectorAll(".hint")[1];
  if (statusEl) statusEl.textContent = statusText;
  redraw();
}

let statusText = "—";

/* ----- YouTube ----- */

function buildYoutube(): void {
  const p = pane("youtube", true);
  const p1 = panel(p, "YouTube video");
  p1.appendChild(el("p", "hint",
    "Paste a video URL: the thumbnail is fetched automatically (no API key required). " +
    "Offline, the last cached thumbnail keeps showing."));
  const urlInput = textInput("", () => {}, "https://www.youtube.com/watch?v=…");
  p1.appendChild(field("Video URL", urlInput));

  const applyBtn = button("Use this video", () => {
    const url = urlInput.value.trim();
    if (!url) return;
    applyBtn.disabled = true;
    void (async () => {
      try {
        const info = await fetchYoutubeInfo(url);
        cfg.card.imageEnabled = true;
        cfg.card.titleEnabled = true;
        if (info.title) cfg.card.title = info.title;
        cfg.card.subtitleEnabled = true;
        cfg.card.subtitle = info.author ? `${info.author} — YouTube` : "YouTube";
        cfg.card.buttonEnabled = true;
        cfg.card.buttonText = "Watch";
        cfg.card.buttonUrl = `https://www.youtube.com/watch?v=${info.videoId}`;
        cfg.card.preset = "youtube";
        try {
          cfg.card.imageData = await youtubeThumbnailData(url);
        } catch {
          /* offline: keep the existing image */
        }
        markDirty(); redraw();
      } catch (e) {
        alert(String(e));
      } finally {
        applyBtn.disabled = false;
      }
    })();
  }, true);
  p1.appendChild(applyBtn);

  const p2 = panel(p, "Customization");
  p2.appendChild(field("Displayed title", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p2.appendChild(field("Displayed subtitle", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
  p2.appendChild(field("Button link", textInput(cfg.card.buttonUrl, v => { cfg.card.buttonUrl = v; markDirty(); redraw(); }, "https://www.youtube.com/watch?v=…")));
}

/* ----- Custom ----- */

function buildCustom(): void {
  const p = pane("custom", true);
  const p1 = panel(p, "Image");
  p1.appendChild(toggleRow("Show image", cfg.card.imageEnabled, v => { cfg.card.imageEnabled = v; markDirty(); redraw(); }));
  const imgBtn = button("Choose an image…", () => {
    void (async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }]
      });
      if (typeof picked !== "string") return;
      try {
        cfg.card.imageData = await readImageDataUrl(picked);
        cfg.card.imageEnabled = true;
        markDirty(); redraw();
      } catch (e) {
        alert(String(e));
      }
    })();
  });
  p1.appendChild(imgBtn);
  const clearImg = button("Remove image", () => { cfg.card.imageData = ""; markDirty(); redraw(); });
  p1.appendChild(clearImg);

  const p2 = panel(p, "Texts");
  p2.appendChild(toggleRow("Title", cfg.card.titleEnabled, v => { cfg.card.titleEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(field("Title", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p2.appendChild(toggleRow("Subtitle", cfg.card.subtitleEnabled, v => { cfg.card.subtitleEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(field("Subtitle", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
  p2.appendChild(toggleRow("Free text", cfg.card.bodyEnabled, v => { cfg.card.bodyEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(field("Free text", textarea(cfg.card.body, v => { cfg.card.body = v; markDirty(); redraw(); })));

  const p3 = panel(p, "Button");
  p3.appendChild(toggleRow("Show button", cfg.card.buttonEnabled, v => { cfg.card.buttonEnabled = v; markDirty(); redraw(); }));
  p3.appendChild(field("Label", textInput(cfg.card.buttonText, v => { cfg.card.buttonText = v; markDirty(); redraw(); })));
  p3.appendChild(field("Link", textInput(cfg.card.buttonUrl, v => { cfg.card.buttonUrl = v; markDirty(); redraw(); }, "https://…")));
}

/* ----- Appearance ----- */

function buildApparence(): void {
  const p = pane("apparence", true);
  const p1 = panel(p, "Dimensions and position");
  p1.appendChild(rangeRow("Width", 220, 560, 5, cfg.appearance.width, v => { cfg.appearance.width = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));
  p1.appendChild(rangeRow("Height", 120, 720, 5, cfg.appearance.height, v => { cfg.appearance.height = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));
  p1.appendChild(rangeRow("Corner radius", 0, 28, 1, cfg.appearance.cornerRadius, v => { cfg.appearance.cornerRadius = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));
  p1.appendChild(rangeRow("Opacity", 0.2, 1, 0.01, cfg.appearance.opacity, v => { cfg.appearance.opacity = v; markDirty(); redraw(); }, v => `${Math.round(v * 100)} %`));
  p1.appendChild(toggleRow("Borderless mode", cfg.appearance.borderless, v => { cfg.appearance.borderless = v; markDirty(); redraw(); }));
  p1.appendChild(toggleRow("Always on top", cfg.appearance.alwaysOnTop, v => { cfg.appearance.alwaysOnTop = v; markDirty(); redraw(); }));

  const p2 = panel(p, "Typography");
  const fonts = ["Segoe UI Variable", "Segoe UI", "Cascadia Code", "Consolas", "Arial", "Verdana", "Georgia", "Times New Roman"];
  const sel = document.createElement("select");
  for (const f of fonts) {
    const o = document.createElement("option");
    o.value = f; o.textContent = f;
    if (f === cfg.appearance.fontFamily) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => { cfg.appearance.fontFamily = sel.value; markDirty(); redraw(); });
  p2.appendChild(field("Font", sel));
  p2.appendChild(rangeRow("Text size", 0.8, 1.4, 0.05, cfg.appearance.fontScale, v => { cfg.appearance.fontScale = v; markDirty(); redraw(); }, v => `${Math.round(v * 100)} %`));
  p2.appendChild(rangeRow("Spacing", 6, 32, 1, cfg.appearance.spacing, v => { cfg.appearance.spacing = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));

  const pAnim = panel(p, "Entrance and duration");
  const anims = [["Fade", "fade"], ["Slide", "slide"], ["Scale", "scale"], ["None", "none"]] as const;
  const animSel = document.createElement("select");
  for (const [label, v] of anims) {
    const o = document.createElement("option");
    o.value = v; o.textContent = label;
    if (v === cfg.appearance.animIn) o.selected = true;
    animSel.appendChild(o);
  }
  animSel.addEventListener("change", () => { cfg.appearance.animIn = animSel.value; markDirty(); });
  pAnim.appendChild(field("Entrance animation", animSel));
  pAnim.appendChild(rangeRow("Animation duration (ms)", 80, 600, 20, cfg.appearance.animDuration,
    v => { cfg.appearance.animDuration = v; markDirty(); }, v => `${Math.round(v)} ms`));
  const minutesInput = textInput(String(Math.max(0, Math.round((cfg.card.displayUntil - Date.now()) / 60000)) || 0), v => {
    const m = Number(v.replace(",", "."));
    cfg.card.displayUntil = Number.isFinite(m) && m > 0 ? Date.now() + m * 60000 : 0;
    markDirty();
  });
  pAnim.appendChild(field("Auto-hide after (minutes, 0 = permanent)", minutesInput));

  const p3 = panel(p, "Panel position");
  const row = el("div", "btn-row");
  for (const [label, corner] of [["Top left", "tl"], ["Top right", "tr"], ["Bottom left", "bl"], ["Bottom right", "br"]] as const) {
    row.appendChild(button(label, () => void snapOverlay(corner)));
  }
  p3.appendChild(row);
  p3.appendChild(toggleRow("Lock position", cfg.overlay.locked, v => { cfg.overlay.locked = v; markDirty(); void setOverlayLock(v); }));
  p3.appendChild(button(cfg.overlay.visible ? "Hide panel" : "Show panel", () => {
    void (cfg.overlay.visible ? hideOverlay() : showOverlay());
  }));
}

/* ----- Presets ----- */

const PRESETS: Array<{ id: string; name: string; desc: string }> = [
  { id: "minimal", name: "Minimal", desc: "Title only — a compact, discreet card." },
  { id: "media", name: "Media", desc: "Cover art, progress bar and button — built for music." },
  { id: "gaming", name: "Gaming", desc: "Cover image, session chronometer and open button." },
  { id: "youtube", name: "YouTube", desc: "Video thumbnail, title and Watch button." },
  { id: "custom", name: "Custom", desc: "Your free-form configuration, unchanged." }
];

function buildPresets(): void {
  const p = pane("presets", false);
  p.appendChild(el("h2", undefined, "Presets"));
  const grid = el("div", "preset-grid");
  for (const pr of PRESETS) {
    const card = el("button", "preset-card");
    card.appendChild(el("div", "p-name", pr.name));
    card.appendChild(el("div", "p-desc", pr.desc));
    card.classList.toggle("active", cfg.card.preset === pr.id);
    card.addEventListener("click", () => {
      void applyPreset(pr.id).then(() => location.reload());
    });
    grid.appendChild(card);
  }
  p.appendChild(grid);
  p.appendChild(el("p", "hint",
    "A preset configures dimensions, content and visible elements. You can then fine-tune everything in the other sections."));
}

/* ----- Settings ----- */

function buildSettings(): void {
  const p = pane("parametres", false);
  p.appendChild(el("h2", undefined, "Settings"));

  const p1 = panel(p, "Startup");
  const autoRow = toggleRow("Launch at Windows startup", false, v => {
    void (async () => {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (v) await enable(); else await disable();
    })();
  });
  p1.appendChild(autoRow);
  p1.appendChild(el("p", "hint", "The app starts minimized to the notification area; the panel reappears if it was visible."));

  const p2 = panel(p, "Data");
  p2.appendChild(el("p", "hint",
    "All configuration is stored locally in %APPDATA%\\CustomRichPresence\\config.json. Nothing is sent to any server."));
  p2.appendChild(button("Open data folder", () => void openDataFolder()));

  const p3 = panel(p, "Discord Rich Presence");
  p3.appendChild(el("p", "hint",
    "Mirrors the card as a Discord status (local IPC, no server). " +
    "Requires a Discord application ID: create an application on " +
    "discord.com/developers (Rich Presence > Art Assets tab to upload " +
    "an image named app-icon). Discord must be running."));
  p3.appendChild(toggleRow("Enable Discord Rich Presence", cfg.discord.enabled, v => {
    cfg.discord.enabled = v; markDirty();
  }));
  p3.appendChild(field("Application ID (client ID)", textInput(cfg.discord.clientId, v => {
    cfg.discord.clientId = v.trim(); markDirty();
  }, "e.g. 1234567890123456789")));
  const discordStatus = el("div", "hint", "—");
  p3.appendChild(discordStatus);
  p3.appendChild(button("Check connection", () => {
    void getDiscordStatus()
      .then(pipe => { discordStatus.textContent = `Discord detected (${pipe})`; })
      .catch(() => { discordStatus.textContent = "Discord not detected — start Discord and try again."; });
  }));

  const p4 = panel(p, "About");
  p4.appendChild(el("p", "hint", "Custom Rich Presence — a custom presence panel for the Windows desktop."));

  // Initial autostart state
  void (async () => {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    const input = autoRow.querySelector<HTMLInputElement>("input");
    if (input) input.checked = await isEnabled();
  })();
}

/* ----- External sync (tray, other windows) ----- */

listen<Config>("card-updated", (e) => {
  cfg = e.payload;
  redraw();
});

listen<string>("navigate", (e) => {
  const s = e.payload as Section;
  if (navButtons.has(s)) navigate(s);
});

/* ----- Init ----- */

async function init(): Promise<void> {
  cfg = await getConfig();
  buildPresence();
  buildMusique();
  buildYoutube();
  buildCustom();
  buildApparence();
  buildPresets();
  buildSettings();
  navigate("presence");
  redraw();
}

void init();
