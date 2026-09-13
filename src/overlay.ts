import { renderCard, needsTicking } from "./card";
import type { Config } from "./types";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Runtime de l'overlay : rendu de la carte, déplacement par glisser,
 * poignée de redimensionnement, verrouillage, persistance gérée côté Rust.
 */

let cfg: Config | null = null;
let timer: number | null = null;
let currentMedia: any = null;
let lastSig = "";

const root = document.getElementById("root")!;

const host = document.createElement("div");
host.id = "card-host";
document.body.classList.add("overlay-mode");
document.body.appendChild(host);

const resizeHandle = document.createElement("div");
resizeHandle.id = "resize-handle";
resizeHandle.title = "Redimensionner";
document.body.appendChild(resizeHandle);

function draw(): void {
  if (!cfg) return;
  // Affichage temporaire : masquer automatiquement une fois la durée écoulée.
  if (cfg.card.displayUntil > 0 && Date.now() > cfg.card.displayUntil) {
    cfg.card.displayUntil = 0;
    void import("./bridge").then(({ hideOverlay }) => hideOverlay());
    return;
  }
  // Animation d'apparition : uniquement quand la configuration change,
  // pas à chaque tic des éléments dynamiques.
  const sig = JSON.stringify(cfg);
  if (sig !== lastSig) {
    lastSig = sig;
    const anims: Record<string, string> = {
      fade: "crp-fade-in",
      slide: "crp-slide-in",
      scale: "crp-scale-in"
    };
    const cls = anims[cfg.appearance.animIn] ?? "crp-fade-in";
    host.style.animation = `${cls} ${cfg.appearance.animDuration}ms ease`;
  }
  renderCard(host, cfg, { media: currentMedia });
  if (needsTicking(cfg)) {
    if (timer === null) {
      timer = window.setInterval(() => renderCard(host, cfg!, { media: currentMedia }), 1000);
    }
  } else if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

async function pollMedia(): Promise<void> {
  if (!cfg?.card.mediaEnabled) return;
  try {
    const { getMediaStatus } = await import("./bridge");
    currentMedia = await getMediaStatus();
  } catch {
    currentMedia = null; // pas de média disponible : la carte reste sur son contenu statique
  }
}

let mediaTimer: number | null = null;
function setMediaPolling(on: boolean): void {
  if (on && mediaTimer === null) {
    void pollMedia().then(draw);
    mediaTimer = window.setInterval(() => void pollMedia().then(draw), 2000);
  } else if (!on && mediaTimer !== null) {
    window.clearInterval(mediaTimer);
    mediaTimer = null;
  }
}

listen<Config>("card-updated", (e) => {
  cfg = e.payload;
  setMediaPolling(!!cfg.card.mediaEnabled);
  draw();
}).then(() => {
  // Premier rendu dès que le listener est en place.
  void (async () => {
    const { getConfig } = await import("./bridge");
    cfg = await getConfig();
    setMediaPolling(cfg.card.mediaEnabled);
    await pollMedia();
    draw();
  })();
});

// Déplacement par glisser (désactivé quand verrouillé)
host.addEventListener("pointerdown", (e) => {
  if (cfg?.overlay.locked || e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest("button")) return; // le bouton de la carte reste cliquable
  void getCurrentWindow().startDragging();
});

// Redimensionnement par la poignée (coin Sud-Est)
resizeHandle.addEventListener("pointerdown", (e) => {
  if (cfg?.overlay.locked) return;
  e.preventDefault();
  e.stopPropagation();
  void getCurrentWindow().startResizeDragging("SouthEast");
});

// Ctrl+Alt+P : verrouiller/déverrouiller rapidement
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && (e.key === "p" || e.key === "P")) {
    cfg!.overlay.locked = !cfg!.overlay.locked;
    host.classList.toggle("locked", cfg!.overlay.locked);
  }
});
