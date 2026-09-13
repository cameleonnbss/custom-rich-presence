import { invoke } from "@tauri-apps/api/core";
import type { Config, MediaStatus, YoutubeInfo } from "./types";

export const getConfig = (): Promise<Config> => invoke("get_config");
export const saveConfig = (config: Config): Promise<void> =>
  invoke("save_config", { config });
export const getMediaStatus = (): Promise<MediaStatus> =>
  invoke("get_media_status");
export const fetchYoutubeInfo = (url: string): Promise<YoutubeInfo> =>
  invoke("fetch_youtube_info", { url });
export const youtubeThumbnailData = (url: string): Promise<string> =>
  invoke("youtube_thumbnail_data", { url });
export const resetChrono = (): Promise<number> => invoke("reset_chrono");
export const showOverlay = (): Promise<void> => invoke("show_overlay");
export const hideOverlay = (): Promise<void> => invoke("hide_overlay");
export const toggleOverlay = (): Promise<boolean> => invoke("toggle_overlay");
export const setOverlayLock = (locked: boolean): Promise<void> =>
  invoke("set_overlay_lock", { locked });
export const snapOverlay = (corner: string): Promise<void> =>
  invoke("snap_overlay", { corner });
export const applyPreset = (name: string): Promise<void> =>
  invoke("apply_preset", { name });
export const openDataFolder = (): Promise<void> => invoke("open_data_folder");
export const getDiscordStatus = (): Promise<string> =>
  invoke("get_discord_status");
export const readImageDataUrl = (path: string): Promise<string> =>
  invoke("read_image_data_url", { path });
export const quitApp = (): Promise<void> => invoke("quit_app");
