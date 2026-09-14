import type { Config } from "./types";
import { fmtClock } from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ellipsize(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} elapsed`;
  if (m > 0) return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} elapsed`;
  return `${s} seconds elapsed`;
}

/**
 * Rebuilds the Discord-style profile card from the current config —
 * the game-style card: app name, verb, title, elapsed time, art, button.
 * Pure DOM, no framework.
 */
export function renderPreview(root: HTMLElement, cfg: Config): void {
  const p = cfg.presence;

  const verb = p.verb.trim() || "Playing";
  const details = p.fallbackDetails.trim();
  const stateText = p.fallbackState.trim();

  const startMs = p.showElapsed && cfg.startedAt > 0 ? cfg.startedAt : 0;
  const elapsed = startMs ? fmtElapsed(Date.now() - startMs) : "";

  const btn = p.buttonEnabled && p.buttonLabel.trim() && p.buttonUrl.trim()
    ? `<div class="profile-act-text btn-link" style="margin-top:6px"><span style="color:#9fa8ff">${esc(p.buttonLabel.trim())}</span></div>`
    : "";

  const smallBadge = p.smallImage.trim()
    ? `<div class="profile-act-small"><div class="act-small-circle"></div></div>`
    : "";

  root.innerHTML = `
    <div class="profile-card">
      <div class="profile-banner">
        <div class="profile-avatar">
          <div class="act-large-circle">${p.largeImage.trim() ? "" : "?"}</div>
          ${smallBadge}
        </div>
        <div class="profile-name">Custom Rich Presence</div>
        <div class="profile-tag">custom status</div>
      </div>
      <div class="profile-body">
        <div class="profile-act">
          <div class="profile-act-header">${esc(verb)} ${esc(p.verb.trim() && details ? "" : "a game")}</div>
          <div class="profile-act-row">
            <div class="act-large-circle">${p.largeImage.trim() ? "" : "?"}</div>
            <div class="profile-act-text">
              <div><b>${esc(ellipsize(details || "Your status title", 60))}</b></div>
              ${stateText ? `<div>${esc(ellipsize(stateText, 60))}</div>` : ""}
              ${elapsed ? `<div>${esc(elapsed)}</div>` : ""}
              ${btn}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export function needsTicking(cfg: Config): boolean {
  return cfg.presence.showElapsed && cfg.startedAt > 0;
}

export { fmtClock };
