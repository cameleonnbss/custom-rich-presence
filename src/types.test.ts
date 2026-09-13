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
  it("starts in text-only mode with detection off", () => {
    const cfg = defaultConfig();
    expect(cfg.presence.textOnly).toBe(true);
    expect(cfg.presence.mediaEnabled).toBe(false);
    expect(cfg.presence.gameEnabled).toBe(false);
  });

  it("is JSON round-trippable", () => {
    const cfg = defaultConfig();
    const back = JSON.parse(JSON.stringify(cfg)) as typeof cfg;
    expect(back).toEqual(cfg);
  });
});
