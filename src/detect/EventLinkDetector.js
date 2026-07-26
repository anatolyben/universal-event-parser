/**
 * EventLinkDetector — find + classify event URLs in a message.
 *
 * Pulls candidate URLs from common rich-message entities (`text_link` / `url`)
 * and a plaintext scan of text/caption, trims trailing punctuation, de-dupes,
 * and caps the count. Each candidate is classified through the registry.
 *
 * Policy: named-platform URLs (partiful/luma/…) are "known" and auto-eligible.
 * A generic page is only surfaced when `allowGeneric` is on and, if an allowlist
 * is configured, its host is on it — we do NOT auto-import every link a user
 * happens to paste.
 */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function trimTrailingPunctuation(value) {
  return value.replace(/[)\]},.!?;:'"]+$/g, "");
}

/** Collect raw candidate URL strings from a generic rich-message object. */
export function extractCandidateUrls(message, { maxLinks = 5 } = {}) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    if (typeof raw !== "string") return;
    const u = trimTrailingPunctuation(raw.trim());
    if (!u || seen.has(u)) return;
    try {
      const parsed = new URL(u);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
    } catch {
      return;
    }
    seen.add(u);
    out.push(u);
  };

  const text = String(message?.text ?? "");
  const caption = String(message?.caption ?? "");
  const entities = message?.entities ?? message?.caption_entities ?? [];
  for (const e of entities) {
    if (e?.type === "text_link" && e.url) push(e.url);
    else if (
      e?.type === "url" &&
      Number.isInteger(e.offset) &&
      Number.isInteger(e.length)
    ) {
      const src = message?.text != null ? text : caption;
      push(src.slice(e.offset, e.offset + e.length));
    }
  }
  for (const src of [text, caption]) {
    for (const m of src.matchAll(URL_RE)) push(m[0]);
  }

  return { urls: out.slice(0, maxLinks), truncated: out.length > maxLinks };
}

/**
 * @param {object} message rich-message shape { text, caption, entities }
 * @param {object} opts
 * @param {import("../adapters/SourceAdapterRegistry.js").SourceAdapterRegistry} opts.registry
 * @param {boolean} [opts.allowGeneric=false]
 * @param {string[]|null} [opts.allowedDomains=null] host allowlist for generic pages
 * @param {number} [opts.maxLinks=5]
 * @returns {{ detections: Array<{url:string,canonicalUrl:string,sourcePlatform:string,externalId:string|null,known:boolean}>, truncated:boolean }}
 */
export function detectEventLinks(message, opts) {
  const {
    registry,
    allowGeneric = false,
    allowedDomains = null,
    maxLinks = 5,
  } = opts;
  const { urls, truncated } = extractCandidateUrls(message, { maxLinks });
  const detections = [];

  for (const url of urls) {
    const recognized = registry.recognize(url);
    if (!recognized) continue;
    const known = recognized.sourcePlatform !== "generic";

    if (!known) {
      if (!allowGeneric) continue;
      if (allowedDomains && allowedDomains.length) {
        let host;
        try {
          host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
        } catch {
          continue;
        }
        const ok = allowedDomains.some(
          (d) =>
            host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
        );
        if (!ok) continue;
      }
    }

    detections.push({
      url,
      canonicalUrl: recognized.canonicalUrl,
      sourcePlatform: recognized.sourcePlatform,
      externalId: recognized.externalId ?? null,
      known,
    });
  }

  return { detections, truncated };
}
