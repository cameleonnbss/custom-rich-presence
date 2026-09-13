import type { Config, MediaStatus } from "./types";

const nowMs = (): number => Date.now();

function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h} h ${mm}` : `${String(m).padStart(2, "0")}:${ss}`;
}

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function safeUrl(u: string): string | null {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export interface CardContext {
  media: MediaStatus | null;
}

/**
 * Rendu de la carte — partagé par l'aperçu de l'éditeur et l'overlay.
 * Reconstruit le DOM à chaque appel : simple, prévisible, sans framework.
 */
export function renderCard(root: HTMLElement, cfg: Config, ctx: CardContext): void {
  const a = cfg.appearance;
  const c = cfg.card;
  const m = c.mediaEnabled ? ctx.media : null;

  root.className = "card";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.borderRadius = `${a.cornerRadius}px`;
  root.style.setProperty("--card-spacing", `${a.spacing}px`);
  root.style.setProperty("--card-font-scale", `${a.fontScale}`);
  root.style.setProperty("--card-opacity", `${a.opacity}`);
  root.style.setProperty("--card-font", `"${a.fontFamily}", "Segoe UI Variable", "Segoe UI", sans-serif`);
  root.style.setProperty("--card-anim-in", a.animIn);
  root.classList.toggle("borderless", a.borderless);

  root.replaceChildren();

  const mediaTitle = m?.available ? m.title : "";
  const mediaArtist = m?.available ? [m.artist, m.album].filter(Boolean).join(" — ") : "";
  const title = mediaTitle || c.title;
  const subtitle = mediaArtist || c.subtitle;

  if (c.imageEnabled) {
    const src = (m?.available && m.coverDataUrl) || c.imageData;
    if (src) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "card-image";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.draggable = false;
      imgWrap.appendChild(img);
      root.appendChild(imgWrap);
    }
  }

  if (c.titleEnabled && title) {
    const t = document.createElement("div");
    t.className = "card-title";
    t.textContent = title;
    root.appendChild(t);
  }

  if (c.subtitleEnabled && subtitle) {
    const s = document.createElement("div");
    s.className = "card-subtitle";
    s.textContent = subtitle;
    root.appendChild(s);
  }

  if (c.bodyEnabled && c.body) {
    const b = document.createElement("div");
    b.className = "card-body";
    b.textContent = c.body;
    root.appendChild(b);
  }

  if (c.chronoEnabled && c.chronoStartedAt > 0) {
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `Depuis ${fmtElapsed(nowMs() - c.chronoStartedAt)}`;
    root.appendChild(meta);
  }

  if (c.datetimeEnabled) {
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    root.appendChild(meta);
  }

  if (c.progressEnabled) {
    const useMedia = m?.available && m.durationMs > 0;
    const pos = useMedia ? m.positionMs : (c.progressValue / Math.max(c.progressMax, 1e-9)) * 100;
    const pct = useMedia
      ? (m.positionMs / m.durationMs) * 100
      : Math.max(0, Math.min(100, pos));
    const track = document.createElement("div");
    track.className = "card-progress";
    const fill = document.createElement("div");
    fill.className = "card-progress-fill";
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    track.appendChild(fill);
    root.appendChild(track);
    if (useMedia) {
      const times = document.createElement("div");
      times.className = "card-times";
      times.textContent = `${fmtClock(m.positionMs)} / ${fmtClock(m.durationMs)}`;
      root.appendChild(times);
    }
  }

  if (c.buttonEnabled) {
    const url = safeUrl(m?.available && c.mediaEnabled ? c.buttonUrl : c.buttonUrl);
    if (url || !c.buttonUrl) {
      const btn = document.createElement("button");
      btn.className = "card-button";
      btn.type = "button";
      btn.textContent = c.buttonText || "Ouvrir";
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!url) return;
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        try {
          await openUrl(url);
        } catch {
          /* silencieux : le bouton ne doit jamais casser la carte */
        }
      });
      root.appendChild(btn);
    }
  }
}

/** Éléments dynamiques présents ? (pour cadencer les re-rendus) */
export function needsTicking(cfg: Config): boolean {
  const c = cfg.card;
  return (
    (c.chronoEnabled && c.chronoStartedAt > 0) ||
    c.datetimeEnabled ||
    (c.progressEnabled && c.mediaEnabled)
  );
}
