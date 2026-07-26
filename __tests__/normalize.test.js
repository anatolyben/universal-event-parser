import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PartifulAdapter } from "../src/adapters/PartifulAdapter.js";
import { LumaAdapter } from "../src/adapters/LumaAdapter.js";
import { GenericEventPageAdapter } from "../src/adapters/GenericEventPageAdapter.js";
import { normalizeEvent } from "../src/normalize/normalize.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(dir, "fixtures", name), "utf8");
const doc = (name, url) => ({
  url,
  finalUrl: url,
  html: fixture(name),
  contentType: "text/html",
  fetchedAt: 0,
});

// A clock well before every fixture event so they are not "ended".
const NOW = Date.parse("2026-06-01T00:00:00Z");

describe("normalizeEvent — Partiful end to end", () => {
  const extraction = PartifulAdapter.extractEvent(
    doc("partiful.html", "https://partiful.com/e/abc123"),
  );
  const { event, missingFields, confirmFields, warnings } = normalizeEvent(
    extraction,
    {
      nowMs: NOW,
      sourceUrl: "https://partiful.com/e/abc123",
    },
  );

  it("produces a fully-resolved UTC start from the explicit offset", () => {
    expect(event.startAt).toBe("2026-08-07T22:00:00.000Z"); // 18:00 EDT
    expect(event.timezone).toBe("America/New_York");
    expect(event.title).toBe("Sunset Rooftop Party");
    expect(event.venueName).toBe("230 Fifth Rooftop");
    expect(event.city).toBe("New York");
  });
  it("needs no confirmation and preserves the original date text", () => {
    expect(missingFields).toEqual([]);
    expect(confirmFields).toEqual([]);
    expect(warnings).not.toContain("event_ended");
    expect(event.originalStartText).toBe("2026-08-07T18:00:00-04:00");
    expect(event.status).toBe("draft");
  });
});

describe("normalizeEvent — Luma positive-offset zone", () => {
  it("converts +03:00 correctly and keeps the IANA tz", () => {
    const extraction = LumaAdapter.extractEvent(
      doc("luma.html", "https://luma.com/founders"),
    );
    const { event } = normalizeEvent(extraction, {
      nowMs: NOW,
      sourceUrl: "https://luma.com/founders",
    });
    expect(event.startAt).toBe("2026-09-12T16:30:00.000Z"); // 19:30 MSK
    expect(event.timezone).toBe("Europe/Moscow");
    expect(event.latitude).toBeCloseTo(55.7481);
  });
});

describe("normalizeEvent — confirmation policy", () => {
  it("flags a missing date + title for an incomplete page", () => {
    const extraction = GenericEventPageAdapter.extractEvent(
      doc("incomplete.html", "https://venue.example/mystery"),
    );
    const { missingFields, confirmFields } = normalizeEvent(extraction, {
      nowMs: NOW,
      sourceUrl: "https://venue.example/mystery",
    });
    expect(missingFields).toContain("startAt");
    expect(confirmFields).toContain("startAt");
  });

  it("marks a cancelled event's status and does not require confirmation for that alone", () => {
    const extraction = GenericEventPageAdapter.extractEvent(
      doc("cancelled.html", "https://venue.example/rave"),
    );
    const { event } = normalizeEvent(extraction, {
      nowMs: NOW,
      sourceUrl: "https://venue.example/rave",
    });
    expect(event.status).toBe("cancelled");
  });

  it("flags an already-ended event", () => {
    const extraction = PartifulAdapter.extractEvent(
      doc("partiful.html", "https://partiful.com/e/abc123"),
    );
    const after = Date.parse("2026-12-01T00:00:00Z");
    const { warnings, confirmFields, event } = normalizeEvent(extraction, {
      nowMs: after,
      sourceUrl: "https://partiful.com/e/abc123",
    });
    expect(warnings).toContain("event_ended");
    expect(confirmFields).toContain("ended");
    expect(event.status).toBe("completed");
  });
});
