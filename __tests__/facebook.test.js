import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FacebookEventAdapter } from "../src/adapters/FacebookEventAdapter.js";
import { createDefaultRegistry } from "../src/adapters/SourceAdapterRegistry.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(dir, "fixtures", n), "utf8");
const doc = (n, url) => ({
  url,
  finalUrl: url,
  html: fixture(n),
  contentType: "text/html",
  fetchedAt: 0,
});

describe("FacebookEventAdapter recognition", () => {
  it("recognizes facebook.com/events/:id and canonicalizes", () => {
    expect(
      FacebookEventAdapter.recognize(
        "https://www.facebook.com/events/1234567890/?ref=x",
      ),
    ).toEqual({
      canonicalUrl: "https://www.facebook.com/events/1234567890",
      externalId: "1234567890",
    });
    expect(
      FacebookEventAdapter.recognize("https://m.facebook.com/events/999")
        .externalId,
    ).toBe("999");
    expect(
      FacebookEventAdapter.recognize("https://fb.me/e/abcDEF").canonicalUrl,
    ).toBe("https://fb.me/e/abcDEF");
    expect(
      FacebookEventAdapter.recognize("https://facebook.com/somepage"),
    ).toBe(null);
  });
  it("is claimed by the default registry before generic", () => {
    const r = createDefaultRegistry();
    expect(
      r.recognize("https://www.facebook.com/events/1234567890").sourcePlatform,
    ).toBe("facebook");
  });
});

describe("FacebookEventAdapter extraction", () => {
  it("extracts a public event from OG + JSON-LD", () => {
    const r = FacebookEventAdapter.extractEvent(
      doc("facebook.html", "https://www.facebook.com/events/1234567890"),
    );
    expect(r.sourcePlatform).toBe("facebook");
    expect(r.fields.title.value).toBe("Brooklyn Night Market");
    expect(r.fields.startAt.value).toBe("2026-08-15T17:00:00-04:00");
    expect(r.fields.venueName.value).toBe("Brooklyn Army Terminal");
    expect(r.sourceExternalId).toBe("1234567890");
    expect(r.missingFields).toEqual([]);
  });
  it("degrades safely on a login wall (no invented data)", () => {
    const r = FacebookEventAdapter.extractEvent(
      doc("facebook-loginwall.html", "https://www.facebook.com/events/555"),
    );
    expect(r.missingFields).toContain("startAt");
    expect(r.warnings).toContain("facebook_login_wall_suspected");
  });
});
