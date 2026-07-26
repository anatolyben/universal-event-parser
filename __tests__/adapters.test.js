import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PartifulAdapter } from "../src/adapters/PartifulAdapter.js";
import { LumaAdapter } from "../src/adapters/LumaAdapter.js";
import { GenericEventPageAdapter } from "../src/adapters/GenericEventPageAdapter.js";
import { createDefaultRegistry } from "../src/adapters/SourceAdapterRegistry.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(dir, "fixtures", name), "utf8");
const doc = (name, url) => ({
  url,
  finalUrl: url,
  html: fixture(name),
  contentType: "text/html",
  fetchedAt: 0,
});

describe("URL recognition + canonicalization", () => {
  it("Partiful recognizes /e/:id and canonicalizes", () => {
    expect(
      PartifulAdapter.recognize("https://partiful.com/e/abc123?utm=x"),
    ).toEqual({
      canonicalUrl: "https://partiful.com/e/abc123",
      externalId: "abc123",
    });
    expect(PartifulAdapter.recognize("https://partiful.com/about")).toBe(null);
    expect(
      PartifulAdapter.canHandle(new URL("https://www.partiful.com/e/x")),
    ).toBe(true);
  });

  it("Luma recognizes slug on lu.ma and luma.com, rejects reserved paths", () => {
    expect(LumaAdapter.recognize("https://lu.ma/founders").canonicalUrl).toBe(
      "https://luma.com/founders",
    );
    expect(LumaAdapter.recognize("https://luma.com/discover")).toBe(null);
    expect(LumaAdapter.recognize("https://luma.com/a/b")).toBe(null);
  });

  it("Generic canonicalizes by stripping tracking params + fragment", () => {
    expect(
      GenericEventPageAdapter.recognize(
        "https://venue.example/events/1?utm_source=fb&keep=1#top",
      ).canonicalUrl,
    ).toBe("https://venue.example/events/1?keep=1");
  });
});

describe("PartifulAdapter.extractEvent", () => {
  const result = PartifulAdapter.extractEvent(
    doc("partiful.html", "https://partiful.com/e/abc123"),
  );
  it("pulls title/start/venue from JSON-LD with high confidence", () => {
    expect(result.fields.title.value).toBe("Sunset Rooftop Party");
    expect(result.fields.startAt.value).toBe("2026-08-07T18:00:00-04:00");
    expect(result.fields.startAt.source).toBe("json_ld");
    expect(result.fields.venueName.value).toBe("230 Fifth Rooftop");
    expect(result.fields.city.value).toBe("New York");
    expect(result.fields.organizerName.value).toBe("Example Events");
  });
  it("carries the platform external id + timezone from embedded state", () => {
    expect(result.sourceExternalId).toBe("abc123");
    expect(result.fields.timezone.value).toBe("America/New_York");
    expect(result.canonicalSourceUrl).toBe("https://partiful.com/e/abc123");
    expect(result.missingFields).toEqual([]);
    expect(result.extractionConfidence).toBeGreaterThan(0.9);
  });
});

describe("LumaAdapter.extractEvent", () => {
  const result = LumaAdapter.extractEvent(
    doc("luma.html", "https://luma.com/founders"),
  );
  it("reads the embedded Luma event state", () => {
    expect(result.fields.title.value).toBe("Founders Dinner");
    expect(result.fields.startAt.value).toBe("2026-09-12T19:30:00+03:00");
    expect(result.fields.timezone.value).toBe("Europe/Moscow");
    expect(result.fields.venueName.value).toContain("White Rabbit");
    expect(result.fields.latitude.value).toBeCloseTo(55.7481);
    expect(result.sourceExternalId).toBe("evt-9f2a");
  });
});

describe("GenericEventPageAdapter.extractEvent", () => {
  it("extracts a schema.org/Event from an arbitrary page", () => {
    const r = GenericEventPageAdapter.extractEvent(
      doc("generic-jsonld.html", "https://venue.example/yoga"),
    );
    expect(r.sourcePlatform).toBe("generic");
    expect(r.fields.title.value).toBe("Community Yoga in the Park");
    expect(r.fields.startAt.value).toBe("2026-07-05T09:00:00-07:00");
    expect(r.fields.priceMin.value).toBe(0);
    expect(r.fields.currency.value).toBe("USD");
    expect(r.missingFields).toEqual([]);
  });

  it("reports missing core fields for an incomplete page (title from OG, no date)", () => {
    const r = GenericEventPageAdapter.extractEvent(
      doc("incomplete.html", "https://venue.example/mystery"),
    );
    expect(r.fields.title.value).toBe("Mystery Meetup");
    expect(r.missingFields).toContain("startAt");
    expect(r.warnings).toContain("no_json_ld_event");
  });

  it("does not throw on malformed html/json — degrades to what it can find", () => {
    const r = GenericEventPageAdapter.extractEvent(
      doc("malformed.html", "https://venue.example/broken"),
    );
    expect(r.missingFields).toContain("startAt");
  });
});

describe("registry routing", () => {
  const registry = createDefaultRegistry();
  it("routes platform URLs to their adapter and everything else to generic", () => {
    expect(registry.recognize("https://partiful.com/e/x").sourcePlatform).toBe(
      "partiful",
    );
    expect(registry.recognize("https://lu.ma/founders").sourcePlatform).toBe(
      "luma",
    );
    expect(
      registry.recognize("https://random.example/e/1").sourcePlatform,
    ).toBe("generic");
    expect(registry.recognize("ftp://nope")).toBe(null);
  });
});
