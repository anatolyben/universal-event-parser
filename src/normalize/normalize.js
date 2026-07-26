/**
 * Normalize an EventExtractionResult into a canonical EventRecord + the lists of
 * missing / confirmation-needed fields.
 *
 * Clock-free: the caller passes `nowMs` (for the already-ended check) so the
 * function stays deterministic and testable. The server timezone is never used.
 *
 * Confirmation policy (material problems only — do not nag for minor gaps):
 *   missing title · missing/ambiguous date · missing timezone · private event ·
 *   low overall confidence · event already ended.
 */
import { resolveInstant, hasEnded, isValidTimezone } from "./dates.js";
import { fieldConfidenceMap, overallConfidence } from "./confidence.js";

const LOW_CONFIDENCE = 0.55;

function val(fields, key) {
  const f = fields[key];
  return f && f.value != null && f.value !== "" ? f.value : undefined;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {import("../contracts.js").EventExtractionResult} extraction
 * @param {object} opts
 * @param {number} opts.nowMs current time (epoch ms) for the ended check
 * @param {string} [opts.sourceUrl] the exact URL the user provided
 * @param {string} [opts.defaultTimezone] group default, used ONLY to interpret an
 *   otherwise-ambiguous wall time (never silently; recorded as a confirm hint)
 * @returns {import("../contracts.js").NormalizationResult}
 */
export function normalizeEvent(extraction, opts) {
  const { nowMs, sourceUrl, defaultTimezone } = opts;
  const fields = extraction.fields ?? {};
  const warnings = [...(extraction.warnings ?? [])];
  const confirmFields = [];
  const missingFields = [];

  // ── Timezone: explicit page data first, then group default (flagged). ──────
  const pageTz = val(fields, "timezone");
  let timezone = isValidTimezone(pageTz) ? pageTz : null;
  let tzFromDefault = false;
  if (!timezone && defaultTimezone && isValidTimezone(defaultTimezone)) {
    timezone = defaultTimezone;
    tzFromDefault = true;
  }

  // ── Dates ──────────────────────────────────────────────────────────────────
  const startRaw = fields.startAt?.raw ?? val(fields, "startAt");
  const start = resolveInstant(startRaw, { timezone });
  const endRaw = fields.endAt?.raw ?? val(fields, "endAt");
  const end = endRaw ? resolveInstant(endRaw, { timezone }) : null;

  if (start.usedTimezone && !timezone) timezone = start.usedTimezone;

  if (!startRaw) {
    missingFields.push("startAt");
    confirmFields.push("startAt");
  } else if (start.ambiguous || !start.iso) {
    confirmFields.push("startAt");
    warnings.push(`ambiguous_start:${start.reason ?? "unknown"}`);
  }
  // Timezone confirmation only matters when the instant isn't already pinned by
  // an explicit offset. A start with its own offset is unambiguous without IANA.
  if (!timezone && start.iso && start.ambiguous === false) {
    // pinned by offset — fine
  } else if (!timezone) {
    confirmFields.push("timezone");
    missingFields.push("timezone");
  } else if (tzFromDefault) {
    warnings.push("timezone_from_group_default");
  }

  // ── Title ────────────────────────────────────────────────────────────────
  const title = val(fields, "title");
  if (!title) {
    missingFields.push("title");
    confirmFields.push("title");
  }

  // ── Status / visibility from raw signals ───────────────────────────────────
  let status = "draft";
  const rawStatus = String(extraction.raw?.eventStatus ?? "").toLowerCase();
  if (rawStatus.includes("cancel")) status = "cancelled";
  else if (rawStatus.includes("postpon")) status = "postponed";

  let visibility = "public";
  const rawVis = String(extraction.raw?.visibility ?? "").toLowerCase();
  if (rawVis && rawVis !== "public") {
    visibility = rawVis === "unlisted" ? "unlisted" : "private";
    if (visibility === "private") confirmFields.push("visibility");
  }

  // ── Ended check ────────────────────────────────────────────────────────────
  if (start.iso && hasEnded({ startAt: start.iso, endAt: end?.iso }, nowMs)) {
    if (status === "draft") status = "completed";
    warnings.push("event_ended");
    confirmFields.push("ended");
  }

  // ── Price / free ───────────────────────────────────────────────────────────
  const priceMin = num(val(fields, "priceMin"));
  const priceMax = num(val(fields, "priceMax"));
  const isFree =
    priceMin === 0 && (priceMax === 0 || priceMax === undefined)
      ? true
      : undefined;

  const fieldConfidence = fieldConfidenceMap(fields);
  if (start.iso)
    fieldConfidence.startAt =
      fields.startAt?.confidence ?? fieldConfidence.startAt ?? 0.7;

  /** @type {import("../contracts.js").EventRecord} */
  const event = {
    title: title ?? null,
    summary: undefined,
    description: val(fields, "description"),
    startAt: start.iso ?? null,
    endAt: end?.iso ?? undefined,
    timezone: timezone ?? null,
    venueName: val(fields, "venueName"),
    address: val(fields, "address"),
    city: val(fields, "city"),
    region: val(fields, "region"),
    postalCode: val(fields, "postalCode"),
    country: val(fields, "country"),
    latitude: num(val(fields, "latitude")),
    longitude: num(val(fields, "longitude")),
    organizerName: val(fields, "organizerName"),
    organizerUrl: val(fields, "organizerUrl"),
    sourcePlatform: extraction.sourcePlatform,
    sourceUrl: sourceUrl ?? extraction.canonicalSourceUrl,
    canonicalSourceUrl: extraction.canonicalSourceUrl,
    sourceExternalId: extraction.sourceExternalId ?? undefined,
    imageUrl: val(fields, "imageUrl"),
    ticketUrl: val(fields, "ticketUrl"),
    priceMin,
    priceMax,
    currency: val(fields, "currency"),
    isFree,
    capacity: num(val(fields, "capacity")),
    ageRestriction: val(fields, "ageRestriction"),
    categories: [],
    tags: [],
    language: val(fields, "language"),
    visibility,
    status,
    extractionConfidence: extraction.extractionConfidence ?? 0,
    fieldConfidence,
    originalStartText: typeof startRaw === "string" ? startRaw : undefined,
    allDay: start.allDay || undefined,
  };

  const dedupedConfirm = [...new Set(confirmFields)];
  const overall = overallConfidence({
    extractionConfidence: event.extractionConfidence,
    fieldConfidence,
    confirmFields: dedupedConfirm,
  });
  event.extractionConfidence = overall;
  if (overall < LOW_CONFIDENCE && !dedupedConfirm.includes("low_confidence")) {
    dedupedConfirm.push("low_confidence");
  }

  return {
    event,
    warnings: [...new Set(warnings)],
    missingFields: [...new Set(missingFields)],
    confirmFields: dedupedConfirm,
  };
}
