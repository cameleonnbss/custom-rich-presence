import type { Config, GameStatus, MediaStatus } from "./types";
import { fmtClock } from "./types";

export interface PreviewState {
  media: MediaStatus | null;
  game: GameStatus | null;
}

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

/**
 * Rebuilds the Discord-style profile card from the current config and
 * detected state. Pure DOM, no framework.
 */
export function renderPreview(root: HTMLElement, cfg: Config, st: PreviewState): void {
  const p = cfg.presence;
  const useMedia = p.mediaEnabled && !!st.media?.available && !!st.media.title.trim();
  const useGame = !useMedia && p.gameEnabled && !!st.game?.available;

  let verb = "Playing a game";
  if (useMedia) verb = st.media!.playing ? "Listening to" : "Paused";
  else if (useGame) verb = "Playing a game";

  const details = useMedia
    ? st.media!.title
    : useGame
      ? st.game!.name
      : p.fallbackDetails.trim();
  const stateText = useMedia
    ? [st.media!.artist, st.media!.album].filter(Boolean).join(" — ")
    : useGame
      ? ""
      : p.fallbackState.trim();

  const artImg = useMedia && st.media!.coverDataUrl
    ? `<img src="${st.media!.coverDataUrl}" alt=""/>`
    : "";

  const hasEnd = useMedia && st.media!.playing && st.media!.durationMs > st.media!.positionMs;
  const remaining = hasEnd ? st.media!.durationMs - st.media!.positionMs : 0;
  const progress = useMedia && st.media!.durationMs > 0
    ? Math.min(100, (st.media!.positionMs / st.media!.durationMs) * 100)
    : 0;

  const startMs = !useMedia && p.showElapsed && cfg.startedAt > 0 ? cfg.startedAt : 0;
  const elapsed = startMs ? fmtElapsed(Date.now() - startMs) : "";

  const btn = p.buttonEnabled && p.buttonLabel.trim() && p.buttonUrl.trim()
    ? `<div class="profile-act-text .btn-link" style="margin-top:6px"><span style="color:#9fa8ff">${esc(p.buttonLabel.trim())}</span></div>`
    : "";

  root.innerHTML = `
    <div class="profile-banner"></div>
    <div class="profile-body">
      <div class="profile-avatar">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>
        <span class="badge">
          <span style="width:9px;height:9px;border-radius:50%;background:${cfg.discord.enabled && (useMedia || useGame || details) ? "var(--green)" : "var(--text-faint)"};display:block"></span>
        </span>
      </div>
      <div class="profile-name">${esc(cfg.discord.enabled ? "You" : "You")}</div>
      <div class="profile-tag">${cfg.discord.enabled ? "Online" : "Offline"}</div>
      <div class="profile-divider"></div>
      ${cfg.discord.enabled && (useMedia || useGame || details || stateText) ? `
      <div class="profile-section-title">${esc(verb)}</div>
      <div class="profile-activity">
        <div class="profile-act-art">${artImg || `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="4"/></svg>`}</div>
        <div class="profile-act-text">
          ${details ? `<div class="detail">${esc(ellipsize(details, 42))}</div>` : ""}
          ${stateText ? `<div class="state">${esc(ellipsize(stateText, 42))}</div>` : ""}
          ${useMedia && st.media!.durationMs > 0 ? `<div class="elapsed">${fmtClock(st.media!.positionMs)} / ${fmtClock(st.media!.durationMs)}</div>` : ""}
          ${btn}
        </div>
      </div>
      ${useMedia ? `
      <div class="now-bar" style="margin-top:10px"><div class="now-bar-fill" style="width:${progress}%"></div></div>
      ${hasEnd ? `<div class="profile-elapsed-line"><span>${fmtClock(st.media!.positionMs)}</span><span>elapsed</span><span>-${fmtClock(remaining)}</span></div>` : ""}` : ""}
      ${startMs ? `<div class="profile-elapsed-line">Elapsed ${elapsed}</div>` : ""}
      ` : `
      <div class="profile-section-title">No activity</div>
      <div class="profile-activity" style="margin-top:8px">
        <div class="profile-act-text" style="color:var(--text-faint)">The status will appear here once Discord is connected and something is playing.</div>
      </div>`}
    </div>`;
}

function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
