/**
 * GenericEventPageAdapter — the fallback for any public http(s) page. It relies
 * purely on deterministic structured metadata (JSON-LD schema.org/Event, Open
 * Graph, HTML meta, <title>). If a page has none of these, extraction returns
 * missing core fields and the orchestrator escalates to the LLM fallback and/or
 * a confirmation request.
 *
 * canHandle() is always true (it is the registry's last resort), so it must be
 * registered LAST.
 */
import { fetchDocument, sameSiteAllow } from "./base.js";
import { extractStructured } from "../extract/structured.js";
import { buildExtractionResult } from "../extract/result.js";

export const GenericEventPageAdapter = {
  id: "generic",

  canHandle() {
    return true;
  },

  recognize(url) {
    let u;
    try {
      u = url instanceof URL ? url : new URL(url);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(u.protocol)) return null;
    // Canonical form: drop tracking params + fragment, keep path.
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(p))
        u.searchParams.delete(p);
    }
    return { canonicalUrl: u.toString(), externalId: null };
  },

  async fetchSource(url, deps = {}) {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return fetchDocument(url, { allowUrl: sameSiteAllow(host), deps });
  },

  extractEvent(doc) {
    const { fields, raw } = extractStructured(doc);
    const warnings = [];
    if (!raw.jsonLd) warnings.push("no_json_ld_event");
    return buildExtractionResult(fields, {
      sourcePlatform: "generic",
      canonicalSourceUrl: doc.finalUrl ?? doc.url,
      sourceExternalId: null,
      raw,
      warnings,
    });
  },
};
