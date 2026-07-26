import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toProvider, providersFromRegistry } from "../src/adapters/provider.js";
import { PartifulAdapter } from "../src/adapters/PartifulAdapter.js";
import { createDefaultRegistry } from "../src/adapters/SourceAdapterRegistry.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(dir, "fixtures", n), "utf8");
const NOW = Date.parse("2026-06-01T00:00:00Z");

function fixtureFetch(name) {
  return async () => ({
    status: 200,
    ok: true,
    headers: {
      get: (k) => (k.toLowerCase() === "content-type" ? "text/html" : null),
    },
    async text() {
      return fixture(name);
    },
  });
}
describe("toProvider — detect / fetch / normalize / sync", () => {
  const provider = toProvider(PartifulAdapter);

  it("exposes the four-method provider interface", () => {
    expect(provider.id).toBe("partiful");
    for (const m of ["detect", "fetch", "normalize"]) {
      expect(typeof provider[m]).toBe("function");
    }
  });

  it("detect() recognizes + canonicalizes a URL", () => {
    expect(provider.detect("https://partiful.com/e/abc123?utm=x")).toEqual({
      canonicalUrl: "https://partiful.com/e/abc123",
      externalId: "abc123",
      sourcePlatform: "partiful",
    });
    expect(provider.detect("https://partiful.com/about")).toBe(null);
  });

  it("fetch() + normalize() yield a canonical event", async () => {
    const doc = await provider.fetch("https://partiful.com/e/abc123", {
      fetchPage: fixtureFetch("partiful.html"),
    });
    const { event } = provider.normalize(doc, {
      nowMs: NOW,
      sourceUrl: "https://partiful.com/e/abc123",
    });
    expect(event.title).toBe("Sunset Rooftop Party");
    expect(event.startAt).toBe("2026-08-07T22:00:00.000Z");
    expect(event.timezone).toBe("America/New_York");
  });

  it("providersFromRegistry wraps every adapter", () => {
    const providers = providersFromRegistry(createDefaultRegistry());
    expect(Object.keys(providers)).toEqual(
      expect.arrayContaining(["partiful", "luma", "facebook", "generic"]),
    );
    expect(providers.luma.id).toBe("luma");
  });
});
