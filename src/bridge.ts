import { invoke } from "@tauri-apps/api/core";
import type { Config, GameStatus, MediaStatus } from "./types";

export const getConfig = (): Promise<Config> => invoke("get_config");
export const saveConfig = (config: Config): Promise<void> =>
  invoke("save_config", { config });
export const getMediaStatus = (): Promise<MediaStatus> =>
  invoke("get_media_status");
export const getGameStatus = (): Promise<GameStatus> =>
  invoke("get_game_status");
export const readImageDataUrl = (path: string): Promise<string> =>
  invoke("read_image_data_url", { path });
export const prepareAsset = (path: string): Promise<string> =>
  invoke("prepare_asset", { sourcePath: path });
export const openAssetUploadPage = (): Promise<void> =>
  invoke("open_asset_upload_page");
export const openDataFolder = (): Promise<void> => invoke("open_data_folder");
export const getDiscordStatus = (): Promise<string> =>
  invoke("get_discord_status");
export const quitApp = (): Promise<void> => invoke("quit_app");
