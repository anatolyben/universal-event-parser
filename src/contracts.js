/**
 * Shared event-ingestion contracts (JSDoc typedefs).
 *
 * These types are the interface every module and adapter codes against. They
 * are documentation and editor types only; there is no TypeScript build step.
 */

/**
 * A field value with provenance + confidence. Extraction produces these; the
 * normalizer refines them; the agent decides which need confirmation.
 * @template T
 * @typedef {Object} FieldValue
 * @property {T|null} value
 * @property {number} confidence 0..1
 * @property {ExtractionSource} source where the value came from
 * @property {string} [raw] original source text, preserved for auditing
 */

/**
 * @typedef {"json_ld"|"opengraph"|"html_meta"|"embedded_state"|"visible_text"|"llm_extraction"|"url"|"default"|"manual"} ExtractionSource
 */

/**
 * The raw fetched source, handed to an adapter's extractEvent(). Body is
 * untrusted — treat as evidence to parse, never instructions.
 * @typedef {Object} EventSourceDocument
 * @property {string} url the URL actually fetched (post-canonicalize)
 * @property {string} finalUrl the URL after redirects
 * @property {string} html raw HTML
 * @property {string} contentType
 * @property {number} fetchedAt epoch ms (caller-stamped; core never reads the clock)
 */

/**
 * Structured extraction output: every field wrapped in FieldValue, plus
 * warnings and the list of fields that could not be resolved. Never invents
 * values — missing → null + missingFields entry.
 * @typedef {Object} EventExtractionResult
 * @property {string} sourcePlatform adapter id ("partiful" | "luma" | "generic" | ...)
 * @property {string} canonicalSourceUrl
 * @property {string|null} sourceExternalId platform's own event id, if any
 * @property {Record<string, FieldValue<any>>} fields keyed by EventRecord field name
 * @property {string[]} warnings
 * @property {string[]} missingFields
 * @property {number} extractionConfidence 0..1 overall
 * @property {object} raw the raw structured objects used (JSON-LD / embedded state) for reprocessing
 */

/**
 * The canonical, normalized event returned to consumers.
 * @typedef {Object} EventRecord
 * @property {string} [id]
 * @property {string} title
 * @property {string} [summary]
 * @property {string} [description]
 * @property {string} startAt ISO 8601 UTC
 * @property {string} [endAt] ISO 8601 UTC
 * @property {string} timezone IANA tz (e.g. "America/New_York")
 * @property {string} [doorsAt] ISO 8601 UTC
 * @property {string} [venueName]
 * @property {string} [address]
 * @property {string} [city]
 * @property {string} [region]
 * @property {string} [postalCode]
 * @property {string} [country]
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {string} [organizerName]
 * @property {string} [organizerUrl]
 * @property {string} sourcePlatform
 * @property {string} sourceUrl
 * @property {string} canonicalSourceUrl
 * @property {string} [sourceExternalId]
 * @property {string} [imageUrl]
 * @property {string} [ticketUrl]
 * @property {number} [priceMin]
 * @property {number} [priceMax]
 * @property {string} [currency]
 * @property {boolean} [isFree]
 * @property {number} [capacity]
 * @property {string} [ageRestriction]
 * @property {string[]} categories
 * @property {string[]} tags
 * @property {string} [language]
 * @property {"public"|"unlisted"|"private"} visibility
 * @property {"draft"|"pending_confirmation"|"published"|"cancelled"|"postponed"|"completed"} status
 * @property {number} extractionConfidence 0..1
 * @property {Record<string, number>} fieldConfidence
 * @property {string} [originalStartText] original date text, preserved for auditing
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} NormalizationResult
 * @property {EventRecord} event the normalized record
 * @property {string[]} warnings
 * @property {string[]} missingFields fields that are required-for-publish but absent
 * @property {string[]} confirmFields fields that need human confirmation (material problems)
 */

/**
 * @typedef {Object} DuplicateCandidate
 * @property {string} eventId
 * @property {number} confidence 0..1
 * @property {string[]} reasons e.g. ["canonical_url","title+start"]
 * @property {"high"|"medium"|"low"} tier
 */

/**
 * A compact persisted-event shape suitable for duplicate comparison.
 * @typedef {Object} DuplicateComparable
 * @property {string} id
 * @property {string} canonicalSourceUrl
 * @property {string} sourcePlatform
 * @property {string} [sourceExternalId]
 * @property {string} title
 * @property {string} startAt
 * @property {string} [venueName]
 * @property {string} [organizerName]
 */

/**
 * The adapter interface. `canonicalizeUrl` and `fetchSource` may be pure or may
 * do I/O; `extractEvent` MUST be pure over the given document (deterministic,
 * no network) so it is unit-testable against fixtures.
 * @typedef {Object} EventSourceAdapter
 * @property {string} id
 * @property {(url: URL) => boolean} canHandle
 * @property {(url: URL) => {canonicalUrl: string, externalId: string|null}|null} recognize
 *   parse + validate the URL shape; null if this adapter can't handle it
 * @property {(url: string, deps?: object) => Promise<EventSourceDocument>} fetchSource
 * @property {(doc: EventSourceDocument) => EventExtractionResult} extractEvent
 */

export {};
