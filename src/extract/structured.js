/**
 * Deterministic structured-metadata extraction, shared by the generic adapter
 * and available to platform adapters as a fallback. Order of trust:
 *   JSON-LD schema.org/Event  >  Open Graph  >  standard HTML meta  >  <title>
 *
 * Produces a partial map of FieldValue<T> keyed by EventRecord field name. Only
 * fields actually found are included — nothing is invented. The LLM fallback
 * (extract/llm.js, wired by the app) fills gaps this leaves behind.
 */
import {
  jsonLdEvent,
  metaTags,
  titleTag,
  normalizeText,
  imageUrl,
  schemaLocation,
  schemaAddressParts,
} from "../util/html.js";

// Per-source base confidence for a cleanly-present value.
export const SOURCE_CONFIDENCE = Object.freeze({
  json_ld: 0.95,
  opengraph: 0.8,
  html_meta: 0.7,
  embedded_state: 0.9,
  visible_text: 0.55,
  llm_extraction: 0.6,
  url: 0.5,
  default: 0.4,
  manual: 1,
});

function fv(value, source, confidence, raw) {
  return {
    value,
    source,
    confidence: confidence ?? SOURCE_CONFIDENCE[source] ?? 0.5,
    raw,
  };
}

/** Set field only if not already present (higher-trust source wins). */
function set(fields, key, candidate) {
  if (candidate?.value == null || candidate.value === "") return;
  if (!(key in fields)) fields[key] = candidate;
}

function priceFromOffers(offers) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  const prices = [];
  let currency = null;
  let url = null;
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const p = Number(o.price ?? o.lowPrice ?? o.highPrice);
    if (Number.isFinite(p)) prices.push(p);
    if (Number.isFinite(Number(o.lowPrice))) prices.push(Number(o.lowPrice));
    if (Number.isFinite(Number(o.highPrice))) prices.push(Number(o.highPrice));
    currency =
      currency ??
      (typeof o.priceCurrency === "string" ? o.priceCurrency : null);
    url = url ?? (typeof o.url === "string" ? o.url : null);
  }
  if (!prices.length)
    return { priceMin: null, priceMax: null, currency, ticketUrl: url };
  return {
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    currency,
    ticketUrl: url,
  };
}

/**
 * @param {import("../contracts.js").EventSourceDocument} doc
 * @returns {{ fields: Record<string, any>, raw: object }}
 */
export function extractStructured(doc) {
  const html = doc.html ?? "";
  const fields = {};
  const raw = {};

  // 1. JSON-LD schema.org/Event — the strongest signal.
  const ev = jsonLdEvent(html);
  if (ev) {
    raw.jsonLd = ev;
    set(fields, "title", fv(normalizeText(ev.name, 300), "json_ld"));
    set(
      fields,
      "description",
      fv(normalizeText(ev.description, 4000), "json_ld"),
    );
    set(
      fields,
      "startAt",
      fv(
        typeof ev.startDate === "string" ? ev.startDate : null,
        "json_ld",
        undefined,
        ev.startDate,
      ),
    );
    set(
      fields,
      "endAt",
      fv(
        typeof ev.endDate === "string" ? ev.endDate : null,
        "json_ld",
        undefined,
        ev.endDate,
      ),
    );
    set(fields, "imageUrl", fv(imageUrl(ev.image), "json_ld"));
    const loc = schemaLocation(ev.location);
    set(
      fields,
      "venueName",
      fv(normalizeText(ev.location?.name, 200) ?? loc, "json_ld"),
    );
    const addr = schemaAddressParts(ev.location);
    for (const [k, v] of Object.entries(addr)) set(fields, k, fv(v, "json_ld"));
    if (ev.location?.geo) {
      const lat = Number(ev.location.geo.latitude);
      const lon = Number(ev.location.geo.longitude);
      if (Number.isFinite(lat)) set(fields, "latitude", fv(lat, "json_ld"));
      if (Number.isFinite(lon)) set(fields, "longitude", fv(lon, "json_ld"));
    }
    const organizer = Array.isArray(ev.organizer)
      ? ev.organizer[0]
      : ev.organizer;
    if (organizer) {
      set(
        fields,
        "organizerName",
        fv(normalizeText(organizer.name ?? organizer, 200), "json_ld"),
      );
      set(
        fields,
        "organizerUrl",
        fv(typeof organizer.url === "string" ? organizer.url : null, "json_ld"),
      );
    }
    const offers = priceFromOffers(ev.offers);
    set(fields, "priceMin", fv(offers.priceMin, "json_ld"));
    set(fields, "priceMax", fv(offers.priceMax, "json_ld"));
    set(fields, "currency", fv(offers.currency, "json_ld"));
    set(fields, "ticketUrl", fv(offers.ticketUrl, "json_ld"));
    if (typeof ev.eventStatus === "string") raw.eventStatus = ev.eventStatus;
    if (typeof ev.inLanguage === "string")
      set(fields, "language", fv(ev.inLanguage, "json_ld"));
  }

  // 2. Open Graph + standard meta.
  const meta = metaTags(html);
  if (Object.keys(meta).length) raw.meta = meta;
  set(fields, "title", fv(normalizeText(meta["og:title"], 300), "opengraph"));
  set(
    fields,
    "description",
    fv(
      normalizeText(meta["og:description"] ?? meta["description"], 4000),
      meta["og:description"] ? "opengraph" : "html_meta",
    ),
  );
  set(
    fields,
    "imageUrl",
    fv(meta["og:image"] ?? meta["twitter:image"], "opengraph"),
  );
  set(
    fields,
    "startAt",
    fv(
      meta["event:start_time"] ?? meta["og:event:start_time"] ?? null,
      "opengraph",
      undefined,
      meta["event:start_time"],
    ),
  );
  set(
    fields,
    "endAt",
    fv(
      meta["event:end_time"] ?? null,
      "opengraph",
      undefined,
      meta["event:end_time"],
    ),
  );
  set(fields, "language", fv(meta["og:locale"]?.split(/[_-]/)[0], "opengraph"));

  // 3. <title> as a last-resort title.
  set(fields, "title", fv(titleTag(html), "html_meta"));

  return { fields, raw };
}
