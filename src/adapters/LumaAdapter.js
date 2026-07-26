/**
 * LumaAdapter — lu.ma/:slug and luma.com/:slug. Luma is a Next.js app whose
 * __NEXT_DATA__ carries props.pageProps.initialData.data.event with a rich
 * structured event (api_id, start_at/end_at with offset, timezone,
 * geo_address_info). We prefer that embedded state, then generic OG/meta.
 */
import { fetchDocument, sameSiteAllow } from "./base.js";
import { extractStructured, SOURCE_CONFIDENCE } from "../extract/structured.js";
import { buildExtractionResult } from "../extract/result.js";
import { nextData, normalizeText, imageUrl } from "../util/html.js";

const RESERVED = new Set([
  "calendar",
  "create",
  "discover",
  "home",
  "login",
  "signin",
]);

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

function inlineText(node) {
  if (!node || typeof node !== "object") return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(inlineText).filter(Boolean).join("");
}
function richText(doc) {
  if (!doc || !Array.isArray(doc.content)) return null;
  const paragraphs = doc.content
    .map((n) => normalizeText(inlineText(n), 4000))
    .filter(Boolean);
  return paragraphs.length ? paragraphs.join("\n\n").slice(0, 4000) : null;
}

function lumaData(html) {
  const root = nextData(html);
  const initial = root?.props?.pageProps?.initialData;
  if (initial?.kind === "event" && initial?.data?.event) return initial.data;
  return null;
}

export const LumaAdapter = {
  id: "luma",

  canHandle(url) {
    try {
      const u = url instanceof URL ? url : new URL(url);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      return host === "lu.ma" || host === "luma.com";
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
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "lu.ma" && host !== "luma.com") return null;
    const path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    const m = path.match(/^\/([^/]+)$/);
    if (!m || RESERVED.has(m[1].toLowerCase())) return null;
    const slug = decodeURIComponent(m[1]);
    return { canonicalUrl: `https://luma.com/${m[1]}`, externalId: slug };
  },

  async fetchSource(url, deps = {}) {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return fetchDocument(url, { allowUrl: sameSiteAllow(host), deps });
  },

  extractEvent(doc) {
    const { fields, raw } = extractStructured(doc);

    const data = lumaData(doc.html);
    const event = data?.event;
    if (event) {
      raw.lumaEvent = event;
      set(
        fields,
        "title",
        fv(normalizeText(event.name, 300), "embedded_state"),
      );
      set(
        fields,
        "description",
        fv(
          richText(data.description_mirror) ??
            normalizeText(data.description ?? event.description, 4000),
          "embedded_state",
        ),
      );
      set(
        fields,
        "startAt",
        fv(event.start_at, "embedded_state", undefined, event.start_at),
      );
      set(
        fields,
        "endAt",
        fv(event.end_at, "embedded_state", undefined, event.end_at),
      );
      set(fields, "timezone", fv(event.timezone, "embedded_state"));
      const location =
        event.geo_address_info?.full_address ??
        event.geo_address_info?.short_address ??
        event.location ??
        null;
      set(
        fields,
        "venueName",
        fv(normalizeText(location, 500), "embedded_state"),
      );
      if (Number.isFinite(Number(event.coordinate?.latitude))) {
        set(
          fields,
          "latitude",
          fv(Number(event.coordinate.latitude), "embedded_state"),
        );
        set(
          fields,
          "longitude",
          fv(Number(event.coordinate.longitude), "embedded_state"),
        );
      }
      set(
        fields,
        "imageUrl",
        fv(
          imageUrl(event.social_image_url) ??
            imageUrl(data.social_image) ??
            imageUrl(event.cover_url),
          "embedded_state",
        ),
      );
      if (event.visibility && event.visibility !== "public") {
        raw.visibility = event.visibility;
      }
    }

    const recognized = LumaAdapter.recognize(doc.finalUrl ?? doc.url);
    return buildExtractionResult(fields, {
      sourcePlatform: "luma",
      canonicalSourceUrl: recognized?.canonicalUrl ?? doc.finalUrl ?? doc.url,
      sourceExternalId:
        normalizeText(event?.api_id, 200) ?? recognized?.externalId ?? null,
      raw,
    });
  },
};
