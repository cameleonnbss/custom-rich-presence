import { describe, expect, it } from "vitest";
import { defaultConfig, fmtClock } from "./types";

describe("fmtClock", () => {
  it("formats minutes and seconds", () => {
    expect(fmtClock(0)).toBe("00:00");
    expect(fmtClock(157_000)).toBe("02:37");
    expect(fmtClock(243_000)).toBe("04:03");
  });
});

describe("defaultConfig", () => {
  it("starts with Discord disabled and detection on", () => {
    const cfg = defaultConfig();
    expect(cfg.discord.enabled).toBe(false);
    expect(cfg.presence.mediaEnabled).toBe(true);
    expect(cfg.presence.gameEnabled).toBe(true);
  });

  it("is JSON round-trippable", () => {
    const cfg = defaultConfig();
    const back = JSON.parse(JSON.stringify(cfg)) as typeof cfg;
    expect(back).toEqual(cfg);
  });
});
