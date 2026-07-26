/**
 * EventSourceProvider — the uniform, source-of-truth provider contract every
 * event platform exposes:
 *
 *   detect(url)              -> { canonicalUrl, externalId, sourcePlatform } | null
 *   fetch(url, deps)         -> EventSourceDocument      (the raw public source)
 *   normalize(doc, opts)     -> NormalizationResult      (our canonical event)
 *   sync(stored, opts, deps) -> { fresh, changes, conflicts, severity, ... }
 *
 * A new platform is added by providing an adapter (URL recognition + extraction)
 * and wrapping it with toProvider — nothing else in the Event Agent changes.
 * `sync` is the refresh capability: the external platform stays authoritative,
 * so an imported event can be re-fetched and reconciled against its source.
 *
 * This is a thin facade over the low-level adapter (canHandle/recognize/
 * fetchSource/extractEvent), which stays the well-tested implementation detail.
 *
 * @typedef {Object} EventSourceProvider
 * @property {string} id
 * @property {(url: string|URL) => ({canonicalUrl:string,externalId:string|null,sourcePlatform:string}|null)} detect
 * @property {(url: string, deps?: object) => Promise<object>} fetch
 * @property {(doc: object, opts?: object) => object} normalize
 * @property {(stored: object, opts?: object, deps?: object) => Promise<object>} sync
 * @property {object} adapter the underlying low-level adapter
 */
import { normalizeEvent } from "../normalize/normalize.js";

/**
 * Wrap a low-level adapter as an EventSourceProvider.
 * @param {import("../contracts.js").EventSourceAdapter} adapter
 * @returns {EventSourceProvider}
 */
export function toProvider(adapter) {
  const provider = {
    id: adapter.id,
    adapter,

    detect(url) {
      if (!adapter.canHandle(url)) return null;
      const recognized = adapter.recognize(url);
      if (!recognized) return null;
      return { ...recognized, sourcePlatform: adapter.id };
    },

    fetch(url, deps = {}) {
      return adapter.fetchSource(url, deps);
    },

    // Extract (deterministic-first) then normalize to the canonical event.
    normalize(doc, opts = {}) {
      const extraction = adapter.extractEvent(doc);
      return normalizeEvent(extraction, {
        nowMs: opts.nowMs ?? 0,
        sourceUrl: opts.sourceUrl ?? doc.finalUrl ?? doc.url,
        defaultTimezone: opts.defaultTimezone,
      });
    },


  };
  return provider;
}

/** Wrap every adapter in a registry as providers, keyed by id. */
export function providersFromRegistry(registry) {
  const map = {};
  for (const adapter of registry.adapters)
    map[adapter.id] = toProvider(adapter);
  return map;
}
