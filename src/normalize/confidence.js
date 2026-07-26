/**
 * Field + overall confidence. Confidence is provenance-driven: it comes from the
 * extraction source (json_ld > embedded_state > opengraph > …) and is lowered
 * when a downstream step had to guess (e.g. an ambiguous date).
 */

/** Flatten a FieldValue map to a plain { field: confidence } record. */
export function fieldConfidenceMap(fields) {
  const out = {};
  for (const [key, fvalue] of Object.entries(fields)) {
    if (fvalue?.value != null && fvalue.value !== "") {
      out[key] = +(fvalue.confidence ?? 0).toFixed(3);
    }
  }
  return out;
}

/**
 * Overall confidence: mean of the core-field confidences, floored by the
 * extraction confidence, penalised for each field flagged for confirmation.
 */
export function overallConfidence({
  extractionConfidence,
  fieldConfidence,
  confirmFields,
}) {
  const core = ["title", "startAt", "venueName"]
    .map((k) => fieldConfidence[k])
    .filter((n) => typeof n === "number");
  const mean = core.length ? core.reduce((s, n) => s + n, 0) / core.length : 0;
  const base = Math.max(mean, extractionConfidence ?? 0);
  const penalty = Math.min(0.6, (confirmFields?.length ?? 0) * 0.2);
  return Math.max(0, +(base * (1 - penalty)).toFixed(3));
}
