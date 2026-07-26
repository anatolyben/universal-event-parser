/**
 * Platform-agnostic event-page ingestion.
 *
 * The public surface covers URL detection, source adapters, deterministic
 * structured extraction, normalization, timezone resolution, and confidence
 * scoring. Storage, scheduling, transport, and user-interface concerns stay in
 * the host application.
 */

// High-level API
export { parseEvent } from "./src/api.js";

// Contracts (types only)
export * from "./src/contracts.js";

// Detection
export {
  detectEventLinks,
  extractCandidateUrls,
} from "./src/detect/EventLinkDetector.js";

// Adapters + registry
export {
  SourceAdapterRegistry,
  createDefaultRegistry,
} from "./src/adapters/SourceAdapterRegistry.js";
export { PartifulAdapter } from "./src/adapters/PartifulAdapter.js";
export { LumaAdapter } from "./src/adapters/LumaAdapter.js";
export { FacebookEventAdapter } from "./src/adapters/FacebookEventAdapter.js";
export { GenericEventPageAdapter } from "./src/adapters/GenericEventPageAdapter.js";

// Source-of-truth provider interface (detect / fetch / normalize / sync)
export { toProvider, providersFromRegistry } from "./src/adapters/provider.js";

// Extraction
export {
  extractStructured,
  SOURCE_CONFIDENCE,
} from "./src/extract/structured.js";
export { buildExtractionResult, CORE_FIELDS } from "./src/extract/result.js";

// Normalization
export { normalizeEvent } from "./src/normalize/normalize.js";
export {
  resolveInstant,
  isValidTimezone,
  hasEnded,
  crossesMidnight,
  zonedWallTimeToUtcMs,
  timezoneOffsetMs,
} from "./src/normalize/dates.js";
export {
  fieldConfidenceMap,
  overallConfidence,
} from "./src/normalize/confidence.js";


// HTML/metadata helpers (adapter authors)
export * as html from "./src/util/html.js";
