export interface CardConfig {
  preset: string;
  imageEnabled: boolean;
  imageData: string;
  titleEnabled: boolean;
  title: string;
  subtitleEnabled: boolean;
  subtitle: string;
  bodyEnabled: boolean;
  body: string;
  buttonEnabled: boolean;
  buttonText: string;
  buttonUrl: string;
  chronoEnabled: boolean;
  chronoStartedAt: number;
  progressEnabled: boolean;
  progressValue: number;
  progressMax: number;
  datetimeEnabled: boolean;
  mediaEnabled: boolean;
  /** Epoch ms : masquer automatiquement après cette date (0 = permanent) */
  displayUntil: number;
}

export interface AppearanceConfig {
  width: number;
  height: number;
  cornerRadius: number;
  opacity: number;
  fontScale: number;
  spacing: number;
  fontFamily: string;
  animIn: string;
  animOut: string;
  animDuration: number;
  borderless: boolean;
  alwaysOnTop: boolean;
}

export interface OverlayConfig {
  x: number;
  y: number;
  locked: boolean;
  visible: boolean;
}

export interface DiscordConfig {
  enabled: boolean;
  clientId: string;
}

export interface Config {
  card: CardConfig;
  appearance: AppearanceConfig;
  overlay: OverlayConfig;
  discord: DiscordConfig;
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

export interface YoutubeInfo {
  videoId: string;
  title: string | null;
  author: string | null;
  thumbnailUrl: string;
}

export function defaultConfig(): Config {
  return {
    card: {
      preset: "custom",
      imageEnabled: false,
      imageData: "",
      titleEnabled: true,
      title: "Ma présence",
      subtitleEnabled: true,
      subtitle: "Sous-titre",
      bodyEnabled: false,
      body: "",
      buttonEnabled: false,
      buttonText: "Ouvrir",
      buttonUrl: "",
      chronoEnabled: false,
      chronoStartedAt: 0,
      progressEnabled: false,
      progressValue: 0,
      progressMax: 100,
      datetimeEnabled: false,
      mediaEnabled: false,
      displayUntil: 0
    },
    appearance: {
      width: 340,
      height: 240,
      cornerRadius: 14,
      opacity: 0.95,
      fontScale: 1,
      spacing: 16,
      fontFamily: "Segoe UI Variable",
      animIn: "fade",
      animOut: "fade",
      animDuration: 220,
      borderless: false,
      alwaysOnTop: true
    },
    overlay: { x: 0, y: 0, locked: false, visible: false },
    discord: { enabled: false, clientId: "" }
  };
}
