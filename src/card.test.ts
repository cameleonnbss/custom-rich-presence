import { describe, expect, it } from "vitest";
import { defaultConfig } from "./types";
import { fmtClock, fmtElapsed, needsTicking, renderCard, safeUrl } from "./card";

describe("fmtClock", () => {
  it("formats minutes and seconds", () => {
    expect(fmtClock(0)).toBe("00:00");
    expect(fmtClock(157_000)).toBe("02:37");
    expect(fmtClock(243_000)).toBe("04:03");
  });

  it("handles the hour boundary", () => {
    expect(fmtClock(3_600_000)).toBe("60:00");
  });
});

describe("fmtElapsed", () => {
  it("formats short durations as mm:ss", () => {
    expect(fmtElapsed(0)).toBe("00:00");
    expect(fmtElapsed(84_000)).toBe("01:24");
  });

  it("formats long durations as h:mm", () => {
    expect(fmtElapsed(5_040_000)).toBe("1 h 24");
  });
});

describe("safeUrl", () => {
  it("accepts http and https URLs", () => {
    expect(safeUrl("https://example.com")).not.toBeNull();
    expect(safeUrl("http://example.com/path")).not.toBeNull();
  });

  it("rejects javascript, data and malformed URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});

describe("needsTicking", () => {
  it("is false for a static card", () => {
    const cfg = defaultConfig();
    cfg.card.chronoEnabled = false;
    cfg.card.datetimeEnabled = false;
    cfg.card.progressEnabled = false;
    expect(needsTicking(cfg)).toBe(false);
  });

  it("is true with a running chronometer, clock or media progress", () => {
    const cfg = defaultConfig();
    cfg.card.chronoEnabled = true;
    cfg.card.chronoStartedAt = 123;
    expect(needsTicking(cfg)).toBe(true);

    const cfg2 = defaultConfig();
    cfg2.card.datetimeEnabled = true;
    expect(needsTicking(cfg2)).toBe(true);

    const cfg3 = defaultConfig();
    cfg3.card.progressEnabled = true;
    cfg3.card.mediaEnabled = true;
    expect(needsTicking(cfg3)).toBe(true);
  });
});

describe("renderCard", () => {
  const emptyMedia = {
    available: false,
    title: "",
    artist: "",
    album: "",
    appId: "",
    playing: false,
    positionMs: 0,
    durationMs: 0,
    coverDataUrl: ""
  };

  it("renders title and subtitle from the config", () => {
    const root = document.createElement("div");
    const cfg = defaultConfig();
    cfg.card.titleEnabled = true;
    cfg.card.title = "Midnight City";
    cfg.card.subtitleEnabled = true;
    cfg.card.subtitle = "M83";
    renderCard(root, cfg, { media: null });
    expect(root.querySelector(".card-title")?.textContent).toBe("Midnight City");
    expect(root.querySelector(".card-subtitle")?.textContent).toBe("M83");
  });

  it("hides disabled elements", () => {
    const root = document.createElement("div");
    const cfg = defaultConfig();
    cfg.card.buttonEnabled = false;
    cfg.card.imageEnabled = false;
    renderCard(root, cfg, { media: null });
    expect(root.querySelector(".card-button")).toBeNull();
    expect(root.querySelector(".card-image")).toBeNull();
  });

  it("prefers live media title over static title", () => {
    const root = document.createElement("div");
    const cfg = defaultConfig();
    cfg.card.mediaEnabled = true;
    cfg.card.title = "Static";
    renderCard(root, cfg, {
      media: { ...emptyMedia, available: true, title: "Live Track", artist: "Artist" }
    });
    expect(root.querySelector(".card-title")?.textContent).toBe("Live Track");
  });

  it("falls back to static content when no media is available", () => {
    const root = document.createElement("div");
    const cfg = defaultConfig();
    cfg.card.mediaEnabled = true;
    cfg.card.title = "Static";
    renderCard(root, cfg, { media: { ...emptyMedia } });
    expect(root.querySelector(".card-title")?.textContent).toBe("Static");
  });

  it("clamps the progress bar to 0-100%", () => {
    const root = document.createElement("div");
    const cfg = defaultConfig();
    cfg.card.progressEnabled = true;
    cfg.card.progressValue = 250;
    cfg.card.progressMax = 100;
    renderCard(root, cfg, { media: null });
    const fill = root.querySelector<HTMLElement>(".card-progress-fill");
    expect(fill?.style.width).toBe("100%");
  });

  it("shows media position and duration when a duration exists", () => {
    const root = document.createElement("div");
    const cfg = defaultConfig();
    cfg.card.progressEnabled = true;
    cfg.card.mediaEnabled = true;
    renderCard(root, cfg, {
      media: { ...emptyMedia, available: true, positionMs: 157_000, durationMs: 243_000 }
    });
    expect(root.querySelector(".card-times")?.textContent).toBe("02:37 / 04:03");
  });
});
