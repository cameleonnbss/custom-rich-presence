export interface PresenceConfig {
  mediaEnabled: boolean;
  gameEnabled: boolean;
  fallbackDetails: string;
  fallbackState: string;
  showElapsed: boolean;
  largeImage: string;
  largeText: string;
  smallImage: string;
  verb: string;
  buttonEnabled: boolean;
  buttonLabel: string;
  buttonUrl: string;
}

export interface DiscordConfig {
  enabled: boolean;
  clientId: string;
}

export interface UiConfig {
  particles: number;
  glass: number;
  pollIntervalSecs: number;
}

export interface Config {
  presence: PresenceConfig;
  discord: DiscordConfig;
  ui: UiConfig;
  startedAt: number;
}

export interface MediaStatus {
  available: boolean;
  title: string;
  artist: string;
  album: string;
  appId: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  coverDataUrl: string;
}

export interface GameStatus {
  available: boolean;
  name: string;
  process: string;
}

export function defaultConfig(): Config {
  return {
    presence: {
      mediaEnabled: true,
      gameEnabled: true,
      fallbackDetails: "Custom Rich Presence",
      fallbackState: "",
      showElapsed: true,
      largeImage: "app-icon",
      largeText: "",
      smallImage: "",
      verb: "Listening",
      buttonEnabled: false,
      buttonLabel: "Open",
      buttonUrl: ""
    },
    discord: { enabled: false, clientId: "" },
    ui: { particles: 42, glass: 0.55, pollIntervalSecs: 5 },
    startedAt: 0
  };
}

export function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
