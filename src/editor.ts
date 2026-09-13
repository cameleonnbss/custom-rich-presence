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

/**
 * Éditeur : barre de titre personnalisée, navigation latérale,
 * panneaux de configuration et aperçu en temps réel.
 */

let cfg: Config;
let media: MediaStatus | null = null;
let dirty = false;
let saveTimer: number | null = null;

const root = document.getElementById("root")!;

/* ---------- Construction du shell ---------- */

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

const NAV: Array<{ id: Section; label: string; icon: string }> = [
  { id: "presence", label: "Présence", icon: icons.card },
  { id: "musique", label: "Musique", icon: icons.music },
  { id: "youtube", label: "YouTube", icon: icons.youtube },
  { id: "custom", label: "Personnalisé", icon: icons.custom },
  { id: "apparence", label: "Apparence", icon: icons.appearance },
  { id: "presets", label: "Presets", icon: icons.pin },
  { id: "parametres", label: "Paramètres", icon: icons.settings }
];

let currentSection: Section = "presence";
const navButtons = new Map<Section, HTMLButtonElement>();

for (const item of NAV) {
  const b = document.createElement("button");
  b.className = "nav-item";
  b.innerHTML = `${item.icon}<span>${item.label}</span>`;
  b.addEventListener("click", () => navigate(item.id));
  navButtons.set(item.id, b);
  sidebar.appendChild(b);
  if (item.id === "presets") {
    const gap = document.createElement("div");
    gap.className = "nav-gap";
    sidebar.appendChild(gap);
  }
}

/* ---------- Aides de construction de formulaire ---------- */

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

/* ---------- Persistance + aperçu ---------- */

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
    console.error("sauvegarde impossible", e);
  }
}

const previewLabel = el("div", "preview-label", "Aperçu en temps réel");
const stage = el("div", "preview-stage");
const cardEl = el("div");
stage.appendChild(cardEl);
const previewBox = el("div", "preview-box");
previewBox.append(previewLabel, stage);

function redraw(): void {
  renderCard(cardEl, cfg, { media });
}

/* ---------- Panneaux ---------- */

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

/* ----- Présence ----- */

function buildPresence(): void {
  const p = pane("presence", true);
  const p1 = panel(p, "Contenu de la carte");
  p1.appendChild(toggleRow("Image", cfg.card.imageEnabled, v => { cfg.card.imageEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(toggleRow("Titre", cfg.card.titleEnabled, v => { cfg.card.titleEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(field("Titre", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p1.appendChild(toggleRow("Sous-titre", cfg.card.subtitleEnabled, v => { cfg.card.subtitleEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(field("Sous-titre", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
  p1.appendChild(toggleRow("Bouton", cfg.card.buttonEnabled, v => { cfg.card.buttonEnabled = v; markDirty(); redraw(); }));
  p1.appendChild(field("Texte du bouton", textInput(cfg.card.buttonText, v => { cfg.card.buttonText = v; markDirty(); redraw(); })));
  p1.appendChild(field("Lien du bouton (https://…)", textInput(cfg.card.buttonUrl, v => { cfg.card.buttonUrl = v; markDirty(); redraw(); }, "https://exemple.com")));

  const p2 = panel(p, "Éléments dynamiques");
  p2.appendChild(toggleRow("Chronomètre", cfg.card.chronoEnabled, v => {
    cfg.card.chronoEnabled = v;
    if (v && cfg.card.chronoStartedAt === 0) cfg.card.chronoStartedAt = Date.now();
    markDirty(); redraw();
  }));
  const chronoBtn = button("Réinitialiser le chronomètre", () => void resetChrono().then(() => redraw()), false);
  p2.appendChild(chronoBtn);
  p2.appendChild(toggleRow("Barre de progression", cfg.card.progressEnabled, v => { cfg.card.progressEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(rangeRow("Progression", 0, 100, 1, cfg.card.progressValue,
    v => { cfg.card.progressValue = v; markDirty(); redraw(); }, v => `${Math.round(v)} %`));
  p2.appendChild(field("Maximum", textInput(String(cfg.card.progressMax), v => {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n > 0) { cfg.card.progressMax = n; markDirty(); redraw(); }
  })));
  p2.appendChild(toggleRow("Date et heure", cfg.card.datetimeEnabled, v => { cfg.card.datetimeEnabled = v; markDirty(); redraw(); }));
}

/* ----- Musique ----- */

function buildMusique(): void {
  const p = pane("musique", true);
  const p1 = panel(p, "Lecture multimédia Windows");
  const hint = el("p", "hint",
    "Utilise les contrôles multimédias de Windows (SMTC) : Spotify, navigateurs, lecteurs système et toute application compatible. " +
    "Si rien n'est détecté, la carte affiche son contenu statique — aucune erreur n'est produite.");
  p1.appendChild(hint);
  p1.appendChild(toggleRow("Suivre la lecture en cours", cfg.card.mediaEnabled, v => {
    cfg.card.mediaEnabled = v; markDirty(); redraw();
  }));

  const status = el("div", "hint", "—");
  p1.appendChild(status);
  const refresh = button("Actualiser", () => void pollMediaEditor());
  p1.appendChild(refresh);

  const p2 = panel(p, "Textes de repli");
  const h2 = el("p", "hint",
    "Affichés lorsque la carte n'est pas en mode « suivre la lecture » ou qu'aucun média n'est détecté.");
  p2.appendChild(h2);
  p2.appendChild(field("Titre", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p2.appendChild(field("Sous-titre", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
}

async function pollMediaEditor(): Promise<void> {
  try {
    media = await getMediaStatus();
    if (media.available) {
      const st = media.playing ? "en lecture" : "en pause";
      statusText = `${media.title} — ${media.artist || "artiste inconnu"} (${st}, via ${media.appId || "application inconnue"})`;
    } else {
      statusText = "Aucun média détecté pour le moment.";
    }
  } catch {
    statusText = "Aucun média détecté pour le moment.";
  }
  const statusEl = panes.get("musique")?.querySelectorAll(".hint")[1];
  if (statusEl) statusEl.textContent = statusText;
  redraw();
}

let statusText = "—";

/* ----- YouTube ----- */

function buildYoutube(): void {
  const p = pane("youtube", true);
  const p1 = panel(p, "Vidéo YouTube");
  p1.appendChild(el("p", "hint",
    "Collez l'URL d'une vidéo : la miniature est récupérée automatiquement (aucune clé API requise). " +
    "Hors ligne, la dernière miniature mémorisée reste affichée."));
  const urlInput = textInput("", () => {}, "https://www.youtube.com/watch?v=…");
  p1.appendChild(field("URL de la vidéo", urlInput));

  const applyBtn = button("Utiliser cette vidéo", () => {
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
        cfg.card.buttonText = "Regarder";
        cfg.card.buttonUrl = `https://www.youtube.com/watch?v=${info.videoId}`;
        cfg.card.preset = "youtube";
        try {
          cfg.card.imageData = await youtubeThumbnailData(url);
        } catch {
          /* hors ligne : on garde l'image existante */
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

  const p2 = panel(p, "Personnalisation");
  p2.appendChild(field("Titre affiché", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p2.appendChild(field("Sous-titre affiché", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
  p2.appendChild(field("Lien du bouton", textInput(cfg.card.buttonUrl, v => { cfg.card.buttonUrl = v; markDirty(); redraw(); }, "https://www.youtube.com/watch?v=…")));
}

/* ----- Personnalisé ----- */

function buildCustom(): void {
  const p = pane("custom", true);
  const p1 = panel(p, "Image");
  p1.appendChild(toggleRow("Afficher l'image", cfg.card.imageEnabled, v => { cfg.card.imageEnabled = v; markDirty(); redraw(); }));
  const imgBtn = button("Choisir une image…", () => {
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
  const clearImg = button("Retirer l'image", () => { cfg.card.imageData = ""; markDirty(); redraw(); });
  p1.appendChild(clearImg);

  const p2 = panel(p, "Textes");
  p2.appendChild(toggleRow("Titre", cfg.card.titleEnabled, v => { cfg.card.titleEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(field("Titre", textInput(cfg.card.title, v => { cfg.card.title = v; markDirty(); redraw(); })));
  p2.appendChild(toggleRow("Sous-titre", cfg.card.subtitleEnabled, v => { cfg.card.subtitleEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(field("Sous-titre", textInput(cfg.card.subtitle, v => { cfg.card.subtitle = v; markDirty(); redraw(); })));
  p2.appendChild(toggleRow("Texte libre", cfg.card.bodyEnabled, v => { cfg.card.bodyEnabled = v; markDirty(); redraw(); }));
  p2.appendChild(field("Texte libre", textarea(cfg.card.body, v => { cfg.card.body = v; markDirty(); redraw(); })));

  const p3 = panel(p, "Bouton");
  p3.appendChild(toggleRow("Afficher le bouton", cfg.card.buttonEnabled, v => { cfg.card.buttonEnabled = v; markDirty(); redraw(); }));
  p3.appendChild(field("Texte", textInput(cfg.card.buttonText, v => { cfg.card.buttonText = v; markDirty(); redraw(); })));
  p3.appendChild(field("Lien", textInput(cfg.card.buttonUrl, v => { cfg.card.buttonUrl = v; markDirty(); redraw(); }, "https://…")));
}

/* ----- Apparence ----- */

function buildApparence(): void {
  const p = pane("apparence", true);
  const p1 = panel(p, "Dimensions et position");
  p1.appendChild(rangeRow("Largeur", 220, 560, 5, cfg.appearance.width, v => { cfg.appearance.width = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));
  p1.appendChild(rangeRow("Hauteur", 120, 720, 5, cfg.appearance.height, v => { cfg.appearance.height = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));
  p1.appendChild(rangeRow("Rayon des coins", 0, 28, 1, cfg.appearance.cornerRadius, v => { cfg.appearance.cornerRadius = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));
  p1.appendChild(rangeRow("Opacité", 0.2, 1, 0.01, cfg.appearance.opacity, v => { cfg.appearance.opacity = v; markDirty(); redraw(); }, v => `${Math.round(v * 100)} %`));
  p1.appendChild(toggleRow("Mode sans bordure", cfg.appearance.borderless, v => { cfg.appearance.borderless = v; markDirty(); redraw(); }));
  p1.appendChild(toggleRow("Toujours au-dessus", cfg.appearance.alwaysOnTop, v => { cfg.appearance.alwaysOnTop = v; markDirty(); redraw(); }));

  const p2 = panel(p, "Typographie");
  const fonts = ["Segoe UI Variable", "Segoe UI", "Cascadia Code", "Consolas", "Arial", "Verdana", "Georgia", "Times New Roman"];
  const sel = document.createElement("select");
  for (const f of fonts) {
    const o = document.createElement("option");
    o.value = f; o.textContent = f;
    if (f === cfg.appearance.fontFamily) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => { cfg.appearance.fontFamily = sel.value; markDirty(); redraw(); });
  p2.appendChild(field("Police", sel));
  p2.appendChild(rangeRow("Taille du texte", 0.8, 1.4, 0.05, cfg.appearance.fontScale, v => { cfg.appearance.fontScale = v; markDirty(); redraw(); }, v => `${Math.round(v * 100)} %`));
  p2.appendChild(rangeRow("Espacement", 6, 32, 1, cfg.appearance.spacing, v => { cfg.appearance.spacing = v; markDirty(); redraw(); }, v => `${Math.round(v)} px`));

  const pAnim = panel(p, "Apparition et durée");
  const anims = [["Fondu", "fade"], ["Glissement", "slide"], ["Échelle", "scale"], ["Aucune", "none"]] as const;
  const animSel = document.createElement("select");
  for (const [label, v] of anims) {
    const o = document.createElement("option");
    o.value = v; o.textContent = label;
    if (v === cfg.appearance.animIn) o.selected = true;
    animSel.appendChild(o);
  }
  animSel.addEventListener("change", () => { cfg.appearance.animIn = animSel.value; markDirty(); });
  pAnim.appendChild(field("Animation d'apparition", animSel));
  pAnim.appendChild(rangeRow("Durée de l'animation (ms)", 80, 600, 20, cfg.appearance.animDuration,
    v => { cfg.appearance.animDuration = v; markDirty(); }, v => `${Math.round(v)} ms`));
  const minutesInput = textInput(String(Math.max(0, Math.round((cfg.card.displayUntil - Date.now()) / 60000)) || 0), v => {
    const m = Number(v.replace(",", "."));
    cfg.card.displayUntil = Number.isFinite(m) && m > 0 ? Date.now() + m * 60000 : 0;
    markDirty();
  });
  pAnim.appendChild(field("Masquer automatiquement après (minutes, 0 = permanent)", minutesInput));

  const p3 = panel(p, "Position du panneau");
  const row = el("div", "btn-row");
  for (const [label, corner] of [["Haut gauche", "tl"], ["Haut droit", "tr"], ["Bas gauche", "bl"], ["Bas droit", "br"]] as const) {
    row.appendChild(button(label, () => void snapOverlay(corner)));
  }
  p3.appendChild(row);
  p3.appendChild(toggleRow("Verrouiller la position", cfg.overlay.locked, v => { cfg.overlay.locked = v; markDirty(); void setOverlayLock(v); }));
  p3.appendChild(button(cfg.overlay.visible ? "Masquer le panneau" : "Afficher le panneau", () => {
    void (cfg.overlay.visible ? hideOverlay() : showOverlay());
  }));
}

/* ----- Presets ----- */

const PRESETS: Array<{ id: string; name: string; desc: string }> = [
  { id: "minimal", name: "Minimal", desc: "Titre seul, carte compacte et discrète." },
  { id: "media", name: "Media", desc: "Pochette, progression et bouton — pensé pour la musique." },
  { id: "gaming", name: "Gaming", desc: "Jaquette, chronomètre de session et bouton d'ouverture." },
  { id: "youtube", name: "YouTube", desc: "Miniature de vidéo, titre et bouton Regarder." },
  { id: "custom", name: "Custom", desc: "Votre configuration libre, inchangée." }
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
    "Un preset configure dimensions, contenu et éléments affichés. Vous pouvez ensuite tout ajuster dans les autres sections."));
}

/* ----- Paramètres ----- */

function buildParametres(): void {
  const p = pane("parametres", false);
  p.appendChild(el("h2", undefined, "Paramètres"));

  const p1 = panel(p, "Démarrage");
  const autoRow = toggleRow("Lancer au démarrage de Windows", false, v => {
    void (async () => {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (v) await enable(); else await disable();
    })();
  });
  p1.appendChild(autoRow);
  p1.appendChild(el("p", "hint", "L'application démarre réduite dans la zone de notification ; le panneau réapparaît s'il était affiché."));

  const p2 = panel(p, "Données");
  p2.appendChild(el("p", "hint",
    "Toute la configuration est stockée localement dans %APPDATA%\\CustomRichPresence\\config.json. Aucune donnée n'est envoyée à un serveur."));
  p2.appendChild(button("Ouvrir le dossier de données", () => void openDataFolder()));

  const p3 = panel(p, "Discord Rich Presence");
  p3.appendChild(el("p", "hint",
    "Reflète la carte comme statut Discord (IPC locale, aucun serveur). " +
    "Nécessite un identifiant d'application Discord : créez une application sur " +
    "discord.com/developers (onglet Rich Presence > Art Assets pour y téléverser " +
    "une image nommée app-icon). Discord doit être lancé."));
  p3.appendChild(toggleRow("Activer la présence Discord", cfg.discord.enabled, v => {
    cfg.discord.enabled = v; markDirty();
  }));
  p3.appendChild(field("Identifiant d'application (client ID)", textInput(cfg.discord.clientId, v => {
    cfg.discord.clientId = v.trim(); markDirty();
  }, "ex. 1234567890123456789")));
  const discordStatus = el("div", "hint", "—");
  p3.appendChild(discordStatus);
  p3.appendChild(button("Vérifier la connexion", () => {
    void getDiscordStatus()
      .then(pipe => { discordStatus.textContent = `Discord détecté (${pipe})`; })
      .catch(() => { discordStatus.textContent = "Discord non détecté — lancez Discord puis réessayez."; });
  }));

  const p4 = panel(p, "À propos");
  p4.appendChild(el("p", "hint", "Custom Rich Presence — panneau de présence personnalisé pour le bureau Windows."));

  // État initial du démarrage automatique
  void (async () => {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    const input = autoRow.querySelector<HTMLInputElement>("input");
    if (input) input.checked = await isEnabled();
  })();
}

/* ----- Synchronisation externe (tray, autres fenêtres) ----- */

listen<Config>("card-updated", (e) => {
  cfg = e.payload;
  redraw();
});

listen<string>("navigate", (e) => {
  const s = e.payload as Section;
  if (navButtons.has(s)) navigate(s);
});

/* ----- Initialisation ----- */

async function init(): Promise<void> {
  cfg = await getConfig();
  buildPresence();
  buildMusique();
  buildYoutube();
  buildCustom();
  buildApparence();
  buildPresets();
  buildParametres();
  navigate("presence");
  redraw();
}

void init();
