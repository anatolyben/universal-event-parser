import { describe, it, expect } from "vitest";
import {
  isValidTimezone,
  hasExplicitOffset,
  isDateOnly,
  zonedWallTimeToUtcMs,
  resolveInstant,
  hasEnded,
  crossesMidnight,
} from "../src/normalize/dates.js";

describe("timezone predicates", () => {
  it("validates IANA zones", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
  it("detects explicit offsets", () => {
    expect(hasExplicitOffset("2026-08-07T18:00:00Z")).toBe(true);
    expect(hasExplicitOffset("2026-08-07T18:00:00-04:00")).toBe(true);
    expect(hasExplicitOffset("2026-08-07T18:00:00")).toBe(false);
  });
  it("detects date-only", () => {
    expect(isDateOnly("2026-08-07")).toBe(true);
    expect(isDateOnly("2026-08-07T18:00")).toBe(false);
  });
});

describe("zonedWallTimeToUtcMs", () => {
  it("converts an EDT summer wall time to UTC (-4h)", () => {
    // 2026-08-07 18:00 in New York (EDT, UTC-4) == 22:00 UTC
    const ms = zonedWallTimeToUtcMs("2026-08-07T18:00:00", "America/New_York");
    expect(new Date(ms).toISOString()).toBe("2026-08-07T22:00:00.000Z");
  });
  it("converts an EST winter wall time to UTC (-5h)", () => {
    // 2026-01-10 18:00 in New York (EST, UTC-5) == 23:00 UTC
    const ms = zonedWallTimeToUtcMs("2026-01-10T18:00:00", "America/New_York");
    expect(new Date(ms).toISOString()).toBe("2026-01-10T23:00:00.000Z");
  });
  it("converts a positive-offset zone (Europe/Moscow, +3h)", () => {
    const ms = zonedWallTimeToUtcMs("2026-08-07T18:00:00", "Europe/Moscow");
    expect(new Date(ms).toISOString()).toBe("2026-08-07T15:00:00.000Z");
  });
});

describe("resolveInstant", () => {
  it("passes an explicit-offset ISO through to UTC without needing a tz", () => {
    const r = resolveInstant("2026-08-07T18:00:00-04:00");
    expect(r).toMatchObject({
      iso: "2026-08-07T22:00:00.000Z",
      ambiguous: false,
      allDay: false,
    });
  });
  it("converts a wall time WITH an explicit tz", () => {
    const r = resolveInstant("2026-08-07T18:00:00", {
      timezone: "America/New_York",
    });
    expect(r.iso).toBe("2026-08-07T22:00:00.000Z");
    expect(r.ambiguous).toBe(false);
    expect(r.usedTimezone).toBe("America/New_York");
  });
  it("flags a wall time WITHOUT a tz as ambiguous — never uses server tz", () => {
    const r = resolveInstant("2026-08-07T18:00:00");
    expect(r.iso).toBe(null);
    expect(r.ambiguous).toBe(true);
    expect(r.reason).toBe("wall_time_needs_tz");
  });
  it("treats a bare date as all-day, anchored to tz midnight", () => {
    const r = resolveInstant("2026-08-07", { timezone: "America/New_York" });
    expect(r.allDay).toBe(true);
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe("2026-08-07T04:00:00.000Z"); // local midnight EDT == 04:00 UTC
  });
  it("flags an all-day date with no tz as ambiguous", () => {
    const r = resolveInstant("2026-08-07");
    expect(r.allDay).toBe(true);
    expect(r.ambiguous).toBe(true);
  });
  it("flags free-form text as ambiguous rather than local-parsing it", () => {
    const r = resolveInstant("August 7, 6pm", { timezone: "America/New_York" });
    expect(r.iso).toBe(null);
    expect(r.ambiguous).toBe(true);
    expect(r.reason).toBe("freeform");
  });
});

describe("hasEnded / crossesMidnight", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  it("detects an event already ended", () => {
    expect(hasEnded({ startAt: "2026-08-06T00:00:00Z" }, now)).toBe(true);
    expect(hasEnded({ startAt: "2026-08-08T00:00:00Z" }, now)).toBe(false);
  });
  it("uses endAt when present", () => {
    expect(
      hasEnded(
        { startAt: "2026-08-06T00:00:00Z", endAt: "2026-08-09T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
  it("detects crossing local midnight", () => {
    // 22:00 → 02:00 next day in NY
    expect(
      crossesMidnight({
        startAt: "2026-08-08T02:00:00Z", // 22:00 EDT Aug 7
        endAt: "2026-08-08T06:00:00Z", // 02:00 EDT Aug 8
        timezone: "America/New_York",
      }),
    ).toBe(true);
  });
});
