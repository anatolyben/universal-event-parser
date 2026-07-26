/**
 * Assemble a validated EventExtractionResult from a field map. Computes the
 * overall extraction confidence and lists the fields an adapter could not fill.
 */

// Fields an import cannot proceed without (timezone is resolved downstream from
// startAt's offset or the venue, so it is not required at extraction time).
export const CORE_FIELDS = ["title", "startAt"];

/**
 * @param {Record<string, import("../contracts.js").FieldValue<any>>} fields
 * @param {object} meta { sourcePlatform, canonicalSourceUrl, sourceExternalId, raw, warnings? }
 * @returns {import("../contracts.js").EventExtractionResult}
 */
export function buildExtractionResult(fields, meta) {
  const warnings = [...(meta.warnings ?? [])];
  const missingFields = [];
  for (const key of CORE_FIELDS) {
    if (fields[key]?.value == null || fields[key]?.value === "") {
      missingFields.push(key);
    }
  }

  // Overall confidence = mean confidence of the core fields present, penalised
  // for each missing core field.
  const present = CORE_FIELDS.map((k) => fields[k]).filter(
    (f) => f?.value != null,
  );
  const mean = present.length
    ? present.reduce((s, f) => s + (f.confidence ?? 0), 0) / present.length
    : 0;
  const penalty = missingFields.length / CORE_FIELDS.length;
  const extractionConfidence = Math.max(0, +(mean * (1 - penalty)).toFixed(3));

  return {
    sourcePlatform: meta.sourcePlatform,
    canonicalSourceUrl: meta.canonicalSourceUrl,
    sourceExternalId: meta.sourceExternalId ?? null,
    fields,
    warnings,
    missingFields,
    extractionConfidence,
    raw: meta.raw ?? {},
  };
}
