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
let clearTimer: number | null = null;

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
      <main class="content" id="content"></main>
    </div>
  </div>`;

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

/* ---------- Persistence ---------- */

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

/* ---------- Helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function panel(parent: HTMLElement, title?: string): HTMLDivElement {
  const p = el("div", "panel");
  if (title) p.appendChild(el("h2", undefined, title));
  parent.appendChild(p);
  return p;
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
function button(label: string, on: () => void, primary = false): HTMLButtonElement {
  const b = el("button", primary ? "btn primary" : "btn", label);
  b.addEventListener("click", on);
  return b;
}
function details(parent: HTMLElement, summary: string): HTMLDetailsElement {
  const d = document.createElement("details");
  const s = document.createElement("summary");
  s.textContent = summary;
  d.appendChild(s);
  parent.appendChild(d);
  return d;
}

/* ---------- Main layout: type-first ---------- */

const grid = el("div", "type-grid");
content.appendChild(grid);
const left = el("div", "type-left");
const right = el("div", "type-right");
grid.append(left, right);

/* -- The big input -- */

const hero = panel(left);
hero.classList.add("hero");
hero.appendChild(el("h1", undefined, "Type it. See it on Discord."));
const hint = el("p", "hint", "Your text becomes your Discord status live. Nothing else to do.");
hero.appendChild(hint);

const stateLabel = el("label", undefined, "Second line (optional)");
const stateInput = document.createElement("input");
stateInput.type = "text";
stateInput.placeholder = "e.g. chilling, working, gaming…";
stateInput.value = cfg.presence.fallbackState;
const stateField = el("div", "field");
stateField.append(stateLabel, stateInput);
hero.appendChild(stateField);

const mainLabel = el("label", undefined, "Status text");
const mainInput = document.createElement("textarea");
mainInput.rows = 3;
mainInput.placeholder = "What should Discord show?";
mainInput.value = cfg.presence.fallbackDetails;
const mainField = el("div", "field");
mainField.append(mainLabel, mainInput);
hero.appendChild(mainField);

const actions = el("div", "btn-row");
const clearBtn = button("Clear status", () => {
  mainInput.value = "";
  stateInput.value = "";
  cfg.presence.fallbackDetails = "";
  cfg.presence.fallbackState = "";
  markDirty();
  refreshPreview();
});
const timerSel = document.createElement("select");
timerSel.innerHTML = `
  <option value="0">Stay until I change it</option>
  <option value="15">Clear after 15 min</option>
  <option value="30">Clear after 30 min</option>
  <option value="60">Clear after 1 h</option>
  <option value="120">Clear after 2 h</option>`;
timerSel.addEventListener("change", () => {
  const mins = Number(timerSel.value);
  if (clearTimer !== null) { window.clearTimeout(clearTimer); clearTimer = null; }
  if (mins > 0) {
    clearTimer = window.setTimeout(() => {
      cfg.presence.fallbackDetails = "";
      cfg.presence.fallbackState = "";
      mainInput.value = "";
      stateInput.value = "";
      markDirty();
      refreshPreview();
    }, mins * 60_000);
  }
});
actions.append(clearBtn, timerSel);
hero.appendChild(actions);

mainInput.addEventListener("input", () => {
  cfg.presence.fallbackDetails = mainInput.value;
  markDirty();
  refreshPreview();
});
stateInput.addEventListener("input", () => {
  cfg.presence.fallbackState = stateInput.value;
  markDirty();
  refreshPreview();
});

/* -- Live Discord preview -- */

const previewWrap = panel(right, "Live on your Discord");
const previewEl = el("div");
previewWrap.appendChild(previewEl);
const pills = el("div", "pill-row");
right.appendChild(pills);

function refreshPreview(): void {
  renderPreview(previewEl, cfg, { media, game });
}

/* -- One-time ID setup (collapsed once done) -- */

const setup = details(left, "One-time setup — connect Discord");
setup.classList.add("setup");
const setupPanel = panel(setup);
setupPanel.appendChild(el("p", "hint",
  "Discord needs an application ID to display a custom status (30 seconds, once, kept forever):"));
const steps = el("ol", "steps");
steps.innerHTML = `
  <li>Open <a href="#" id="dev-portal">discord.com/developers</a> and click <b>New Application</b></li>
  <li>Copy the <b>Application ID</b> shown on the General page</li>
  <li>Paste it below</li>`;
setupPanel.appendChild(steps);
const idInput = document.createElement("input");
idInput.type = "text";
idInput.placeholder = "Application ID (numbers only)";
idInput.value = cfg.discord.clientId;
setupPanel.appendChild(idInput);
const idStatus = el("div", "hint", cfg.discord.clientId ? "Saved. You're connected." : "");
setupPanel.appendChild(idStatus);
idInput.addEventListener("input", () => {
  cfg.discord.clientId = idInput.value.trim();
  cfg.discord.enabled = idInput.value.trim().length > 0;
  markDirty();
  refreshPreview();
  void updateSetupStatus();
});
setupPanel.appendChild(button("Check Discord is running", () => {
  void getDiscordStatus()
    .then(pipe => { idStatus.textContent = `Discord detected (${pipe}) — you're good.`; })
    .catch(() => { idStatus.textContent = "Discord not detected — start the Discord app first."; });
}));

async function updateSetupStatus(): Promise<void> {
  if (cfg.discord.clientId) {
    setup.open = false;
    hint.textContent = "Your text becomes your Discord status live.";
  } else {
    setup.open = true;
    hint.textContent = "Complete the one-time setup below, then type — it shows up on Discord.";
  }
}

(root.querySelector("#dev-portal") as HTMLAnchorElement | null)?.addEventListener("click", async (e) => {
  e.preventDefault();
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  void openUrl("https://discord.com/developers/applications");
});

/* -- Advanced (collapsed): auto detection + looks -- */

const advanced = details(left, "Advanced — music & game detection, button, timer");
const advDetect = panel(advanced, "Automatic detection");
advDetect.appendChild(toggleRow("Show the music I'm listening to", cfg.presence.mediaEnabled, v => { cfg.presence.mediaEnabled = v; markDirty(); }));
advDetect.appendChild(toggleRow("Show the game I'm playing", cfg.presence.gameEnabled, v => { cfg.presence.gameEnabled = v; markDirty(); }));
advDetect.appendChild(toggleRow("Text only — never auto-detect", cfg.presence.textOnly, v => { cfg.presence.textOnly = v; markDirty(); }));

const advShow = panel(advanced, "Status extras");
advShow.appendChild(toggleRow("Show elapsed time", cfg.presence.showElapsed, v => { cfg.presence.showElapsed = v; markDirty(); refreshPreview(); }));
advShow.appendChild(toggleRow("Add a button", cfg.presence.buttonEnabled, v => { cfg.presence.buttonEnabled = v; markDirty(); }));
const btnLabel = document.createElement("input");
btnLabel.type = "text";
btnLabel.placeholder = "Button label";
btnLabel.value = cfg.presence.buttonLabel;
btnLabel.addEventListener("input", () => { cfg.presence.buttonLabel = btnLabel.value; markDirty(); });
const btnUrl = document.createElement("input");
btnUrl.type = "text";
btnUrl.placeholder = "https://link";
btnUrl.value = cfg.presence.buttonUrl;
btnUrl.addEventListener("input", () => { cfg.presence.buttonUrl = btnUrl.value; markDirty(); });
advShow.appendChild(btnLabel);
advShow.appendChild(btnUrl);

const advUi = panel(advanced, "This window");
const partRow = el("div", "toggle-row");
partRow.appendChild(el("span", undefined, "Background particles"));
const partInput = document.createElement("input");
partInput.type = "range";
partInput.min = "0"; partInput.max = "100"; partInput.step = "2";
partInput.value = String(cfg.ui.particles);
partInput.addEventListener("change", () => { cfg.ui.particles = Number(partInput.value); markDirty(); });
partRow.appendChild(partInput);
advUi.appendChild(partRow);
advUi.appendChild(button("Open data folder", () => void openDataFolder()));
advUi.appendChild(button("Quit completely", () => void quitApp(), true));

/* ---------- Status pills ---------- */

function pill(kind: "ok" | "bad" | "", text: string): HTMLDivElement {
  const p = el("div", `pill ${kind}`);
  p.appendChild(el("span", "dot"));
  p.appendChild(el("span", undefined, text));
  return p;
}
let discordPill = pill("", "checking…");

async function renderPills(): Promise<void> {
  pills.innerHTML = "";
  try {
    const pipe = await getDiscordStatus();
    discordPill = pill("ok", `Discord connected (${pipe.replace(/^.*pipe./, "").slice(0, 30)})`);
  } catch {
    discordPill = pill("bad", "Discord not running");
  }
  if (!cfg.discord.clientId) {
    pills.appendChild(pill("", "One-time setup needed"));
  }
  pills.appendChild(discordPill);
}

/* ---------- Init ---------- */

async function init(): Promise<void> {
  try { cfg = { ...defaultConfig(), ...(await getConfig()) }; } catch { /* first run */ }
  mainInput.value = cfg.presence.fallbackDetails;
  stateInput.value = cfg.presence.fallbackState;
  idInput.value = cfg.discord.clientId;
  startParticles(cfg.ui.particles);
  await updateSetupStatus();
  await renderPills();
  refreshPreview();
  try {
    media = await getMediaStatus();
    game = await getGameStatus();
  } catch { /* detection is optional */ }
  refreshPreview();
}

void init();
