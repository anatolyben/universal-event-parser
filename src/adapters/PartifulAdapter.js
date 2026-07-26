/**
 * PartifulAdapter — partiful.com/e/:id. Partiful ships both a schema.org/Event
 * JSON-LD block and a Next.js __NEXT_DATA__ blob (props.pageProps.event); we
 * merge them, preferring JSON-LD, and fall back to generic OG/meta.
 */
import { fetchDocument, sameSiteAllow } from "./base.js";
import { extractStructured, SOURCE_CONFIDENCE } from "../extract/structured.js";
import { buildExtractionResult } from "../extract/result.js";
import {
  nextData,
  normalizeText,
  imageUrl,
  schemaLocation,
} from "../util/html.js";

const HOST = "partiful.com";

function fv(value, source, confidence, raw) {
  if (value == null || value === "") return undefined;
  return {
    value,
    source,
    confidence: confidence ?? SOURCE_CONFIDENCE[source],
    raw,
  };
}
function set(fields, key, candidate) {
  if (candidate && !(key in fields)) fields[key] = candidate;
}

export const PartifulAdapter = {
  id: "partiful",

  canHandle(url) {
    try {
      const u = url instanceof URL ? url : new URL(url);
      return u.hostname.toLowerCase().replace(/^www\./, "") === HOST;
    } catch {
      return false;
    }
  },

  recognize(url) {
    let u;
    try {
      u = url instanceof URL ? url : new URL(url);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.hostname.toLowerCase().replace(/^www\./, "") !== HOST) return null;
    const path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    const m = path.match(/^\/e\/([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    return { canonicalUrl: `https://partiful.com/e/${m[1]}`, externalId: m[1] };
  },

  async fetchSource(url, deps = {}) {
    return fetchDocument(url, { allowUrl: sameSiteAllow(HOST), deps });
  },

  extractEvent(doc) {
    // Start from generic structured extraction (gets the JSON-LD Event + OG).
    const { fields, raw } = extractStructured(doc);

    // Layer Partiful's embedded state for anything JSON-LD missed.
    const pageEvent = nextData(doc.html)?.props?.pageProps?.event ?? null;
    if (pageEvent) {
      raw.partifulPageEvent = pageEvent;
      set(
        fields,
        "title",
        fv(normalizeText(pageEvent.title, 300), "embedded_state"),
      );
      set(
        fields,
        "description",
        fv(normalizeText(pageEvent.description, 4000), "embedded_state"),
      );
      set(
        fields,
        "startAt",
        fv(
          pageEvent.startDate,
          "embedded_state",
          undefined,
          pageEvent.startDate,
        ),
      );
      set(
        fields,
        "endAt",
        fv(pageEvent.endDate, "embedded_state", undefined, pageEvent.endDate),
      );
      set(
        fields,
        "venueName",
        fv(
          schemaLocation(pageEvent.locationInfo ?? pageEvent.location),
          "embedded_state",
        ),
      );
      set(fields, "imageUrl", fv(imageUrl(pageEvent.image), "embedded_state"));
      set(fields, "timezone", fv(pageEvent.timezone, "embedded_state"));
    }

    const recognized = PartifulAdapter.recognize(doc.finalUrl ?? doc.url);
    return buildExtractionResult(fields, {
      sourcePlatform: "partiful",
      canonicalSourceUrl: recognized?.canonicalUrl ?? doc.finalUrl ?? doc.url,
      sourceExternalId:
        normalizeText(pageEvent?.id, 200) ?? recognized?.externalId ?? null,
      raw,
    });
  },
};
