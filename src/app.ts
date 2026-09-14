import { defaultConfig, type Config } from "./types";
import { getConfig, saveConfig, pushNow, getDiscordStatus, openDataFolder, quitApp, prepareAsset, openAssetUploadPage, readImageDataUrl } from "./bridge";
import { renderPreview } from "./preview";
import { icons } from "./icons";
import { startParticles } from "./particles";

let cfg: Config = defaultConfig();
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
      <button id="tb-close" class="close" title="Close (stays in tray)">${icons.close}</button>
    </div>
    <div class="app-shell">
      <main class="content">
        <div class="flow" id="flow"></div>
      </main>
    </div>
  </div>`;

const flow = root.querySelector("#flow") as HTMLElement;

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

/* ---------- Discord status chip ---------- */

const chip = el("div", "pill", "");
function setChip(ok: boolean, text: string): void {
  chip.className = `pill ${ok ? "ok" : "bad"}`;
  chip.innerHTML = `<span class="dot"></span><span></span>`;
  (chip.lastChild as HTMLElement).textContent = text;
}
flow.appendChild(chip);

async function refreshChip(): Promise<void> {
  try {
    await getDiscordStatus();
    setChip(true, "Discord detected");
  } catch {
    setChip(false, "Discord not running — open Discord, then Push");
  }
}

/* ---------- Card ---------- */

const card = panel(flow);

/* 1 · Image */
card.appendChild(el("h1", undefined, "Your status on Discord"));
card.appendChild(el("p", "hint", "Image, text, link — then press Push. It appears on your Discord profile."));

const imgRow = el("div", "image-row");
const imgThumb = el("div", "image-thumb");
imgThumb.innerHTML = icons.image;
const imgMeta = el("div", "image-meta");
const imgBtn = button("Image…", () => void pickImage());
const imgHint = el("div", "hint", "");
const imgOpen = button("Upload page", () => {
  void openAssetUploadPage().catch(e => alert(String(e)));
});
imgOpen.classList.add("hidden");
imgMeta.append(imgBtn, imgOpen, imgHint);
imgRow.append(imgThumb, imgMeta);
card.appendChild(imgRow);

async function pickImage(): Promise<void> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
  });
  if (typeof picked !== "string") return;
  imgBtn.disabled = true;
  try {
    const outPath = await prepareAsset(picked);
    cfg.presence.largeImage = "app-icon";
    const preview = await readImageDataUrl(outPath);
    imgThumb.innerHTML = `<img src="${preview}" alt=""/>`;
    imgOpen.classList.remove("hidden");
    imgHint.textContent = "512×512 ready — click Upload page, drag the file in, done.";
    markDirty();
    refreshPreview();
  } catch (e) {
    alert(String(e));
  } finally {
    imgBtn.disabled = false;
  }
}

/* 2 · Text */
const mainInput = document.createElement("textarea");
mainInput.rows = 2;
mainInput.placeholder = "What are you doing?";
mainInput.addEventListener("input", () => {
  cfg.presence.fallbackDetails = mainInput.value;
  markDirty();
  refreshPreview();
});
card.appendChild(mainInput);

const stateInput = document.createElement("input");
stateInput.type = "text";
stateInput.placeholder = "Second line (optional)";
stateInput.addEventListener("input", () => {
  cfg.presence.fallbackState = stateInput.value;
  markDirty();
  refreshPreview();
});
card.appendChild(stateInput);

/* 3 · Link */
const linkRow = el("div", "link-row");
const btnLabel = document.createElement("input");
btnLabel.type = "text";
btnLabel.placeholder = "Button label (Watch, Open…)";
btnLabel.addEventListener("input", () => {
  cfg.presence.buttonLabel = btnLabel.value;
  markDirty();
  refreshPreview();
});
const btnUrl = document.createElement("input");
btnUrl.type = "text";
btnUrl.placeholder = "Link (https://…, optional)";
btnUrl.addEventListener("input", () => {
  cfg.presence.buttonUrl = btnUrl.value.trim();
  cfg.presence.buttonEnabled = cfg.presence.buttonUrl.length > 0;
  markDirty();
  refreshPreview();
});
linkRow.append(btnLabel, btnUrl);
card.appendChild(linkRow);

/* Push */
const actions = el("div", "btn-row push-row");
const pushBtn = button("Push to Discord", () => void push(), true);
pushBtn.classList.add("push");
const clearBtn = button("Clear", () => {
  mainInput.value = "";
  stateInput.value = "";
  btnUrl.value = "";
  btnLabel.value = "";
  cfg.presence.fallbackDetails = "";
  cfg.presence.fallbackState = "";
  cfg.presence.buttonUrl = "";
  cfg.presence.buttonEnabled = false;
  markDirty();
  refreshPreview();
  void push(true);
});
const timerSel = document.createElement("select");
timerSel.innerHTML = `
  <option value="0">Until I change it</option>
  <option value="15">Clear in 15 min</option>
  <option value="30">Clear in 30 min</option>
  <option value="60">Clear in 1 h</option>
  <option value="120">Clear in 2 h</option>`;
timerSel.addEventListener("change", () => {
  const mins = Number(timerSel.value);
  if (clearTimer !== null) { window.clearTimeout(clearTimer); clearTimer = null; }
  if (mins > 0) {
    clearTimer = window.setTimeout(() => {
      mainInput.value = "";
      stateInput.value = "";
      cfg.presence.fallbackDetails = "";
      cfg.presence.fallbackState = "";
      markDirty();
      refreshPreview();
      void push(true);
    }, mins * 60_000);
  }
});
actions.append(pushBtn, clearBtn, timerSel);
card.appendChild(actions);

async function push(silent = false): Promise<void> {
  dirty = false;
  if (saveTimer !== null) { window.clearTimeout(saveTimer); saveTimer = null; }
  pushBtn.disabled = true;
  try {
    await saveConfig(structuredClone(cfg));
    await pushNow();
    if (!silent) {
      pushBtn.textContent = "Sent ✓";
      window.setTimeout(() => { pushBtn.textContent = "Push to Discord"; }, 1500);
    }
  } catch (e) {
    pushBtn.textContent = "Failed — retry";
    window.setTimeout(() => { pushBtn.textContent = "Push to Discord"; }, 2000);
    if (!silent) alert(String(e));
  } finally {
    pushBtn.disabled = false;
  }
}

/* ---------- Live preview ---------- */

const previewWrap = panel(flow, "Preview");
const previewEl = el("div");
previewWrap.appendChild(previewEl);

function refreshPreview(): void {
  renderPreview(previewEl, cfg, { media: null, game: null });
}

/* ---------- Optional extras (collapsed) ---------- */

const setup = details(flow, "Change the name above your status (optional, once)");
const setupPanel = panel(setup);
setupPanel.appendChild(el("p", "hint", "The status shows on your profile under the name “Custom Rich Presence”. Want another name? Create it on Discord's site (30 seconds, no login) and paste its ID here:"));
const steps = el("ol", "steps");
steps.innerHTML = `
  <li>Open <a href="#" id="dev-portal">discord.com/developers</a>, click <b>New Application</b>, name it what should show on your profile</li>
  <li>Copy the <b>Application ID</b> (General page)</li>
  <li>Paste it below</li>`;
setupPanel.appendChild(steps);
const idInput = document.createElement("input");
idInput.type = "text";
idInput.placeholder = "Application ID (numbers only, optional)";
idInput.value = cfg.discord.clientId;
idInput.addEventListener("input", () => {
  cfg.discord.clientId = idInput.value.trim();
  markDirty();
});
setupPanel.appendChild(idInput);
(root.querySelector("#dev-portal") as HTMLAnchorElement | null)?.addEventListener("click", async (e) => {
  e.preventDefault();
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  void openUrl("https://discord.com/developers/applications");
});

const advanced = details(flow, "Advanced");
const advPanel = panel(advanced);
const partRow = el("div", "toggle-row");
partRow.appendChild(el("span", undefined, "Background particles"));
const partInput = document.createElement("input");
partInput.type = "range";
partInput.min = "0"; partInput.max = "100"; partInput.step = "2";
partInput.value = String(cfg.ui.particles);
partInput.addEventListener("change", () => {
  cfg.ui.particles = Number(partInput.value);
  markDirty();
  startParticles(cfg.ui.particles);
});
partRow.appendChild(partInput);
advPanel.appendChild(partRow);
advPanel.appendChild(button("Open data folder", () => void openDataFolder()));
advPanel.appendChild(button("Quit completely", () => void quitApp(), true));

/* ---------- Init ---------- */

async function init(): Promise<void> {
  try { cfg = { ...defaultConfig(), ...(await getConfig()) }; } catch { /* first run */ }
  mainInput.value = cfg.presence.fallbackDetails;
  stateInput.value = cfg.presence.fallbackState;
  btnLabel.value = cfg.presence.buttonLabel === "Open" ? "" : cfg.presence.buttonLabel;
  btnUrl.value = cfg.presence.buttonUrl;
  idInput.value = cfg.discord.clientId;
  startParticles(cfg.ui.particles);
  refreshPreview();
  await refreshChip();
  window.setInterval(() => void refreshChip(), 10_000);
  mainInput.focus();
}

void init();
