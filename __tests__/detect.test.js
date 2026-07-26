import { describe, it, expect } from "vitest";
import {
  detectEventLinks,
  extractCandidateUrls,
} from "../src/detect/EventLinkDetector.js";
import { createDefaultRegistry } from "../src/adapters/SourceAdapterRegistry.js";

const registry = createDefaultRegistry();

describe("extractCandidateUrls", () => {
  it("finds URLs in plain text and trims trailing punctuation", () => {
    const { urls } = extractCandidateUrls({
      text: "check this out https://partiful.com/e/abc123, it's great!",
    });
    expect(urls).toEqual(["https://partiful.com/e/abc123"]);
  });

  it("reads text_link + url entities", () => {
    const { urls } = extractCandidateUrls({
      text: "join here",
      entities: [{ type: "text_link", url: "https://lu.ma/founders" }],
    });
    expect(urls).toContain("https://lu.ma/founders");
  });

  it("caps the number of links and flags truncation", () => {
    const text = Array.from({ length: 8 }, (_, i) => `https://x.com/${i}`).join(
      " ",
    );
    const { urls, truncated } = extractCandidateUrls({ text }, { maxLinks: 3 });
    expect(urls).toHaveLength(3);
    expect(truncated).toBe(true);
  });
});

describe("detectEventLinks", () => {
  it("surfaces known-platform links automatically", () => {
    const { detections } = detectEventLinks(
      { text: "party! https://partiful.com/e/abc123" },
      { registry },
    );
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      sourcePlatform: "partiful",
      canonicalUrl: "https://partiful.com/e/abc123",
      known: true,
    });
  });

  it("ignores generic pages by default", () => {
    const { detections } = detectEventLinks(
      { text: "https://venue.example/events/1" },
      { registry },
    );
    expect(detections).toHaveLength(0);
  });

  it("surfaces generic pages only when allowed and on the domain allowlist", () => {
    const msg = { text: "https://venue.example/events/1" };
    expect(
      detectEventLinks(msg, { registry, allowGeneric: true }).detections,
    ).toHaveLength(1);
    expect(
      detectEventLinks(msg, {
        registry,
        allowGeneric: true,
        allowedDomains: ["other.com"],
      }).detections,
    ).toHaveLength(0);
    expect(
      detectEventLinks(msg, {
        registry,
        allowGeneric: true,
        allowedDomains: ["venue.example"],
      }).detections,
    ).toHaveLength(1);
  });
});
