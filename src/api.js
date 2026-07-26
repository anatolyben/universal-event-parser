import { createDefaultRegistry } from "./adapters/SourceAdapterRegistry.js";
import { providersFromRegistry } from "./adapters/provider.js";

/**
 * Parses an event URL, detecting the appropriate platform adapter, fetching the
 * source page, and normalizing the extracted data.
 *
 * @param {string|URL} url - The URL of the event to parse.
 * @param {object} [options] - Optional parsing options.
 * @param {object} [options.registry] - A custom SourceAdapterRegistry instance.
 * @param {number} [options.nowMs] - Current time in milliseconds (defaults to Date.now()).
 * @param {string} [options.defaultTimezone] - Fallback timezone if the source does not provide one.
 * @param {Function} [options.fetchPage] - Trusted response-compatible fetcher. It must enforce SSRF protections itself.
 * @returns {Promise<object>} The normalized event object.
 */
export async function parseEvent(url, options = {}) {
  const registry = options.registry ?? createDefaultRegistry();
  const providers = providersFromRegistry(registry);

  let match = null;
  let selectedProvider = null;

  for (const provider of Object.values(providers)) {
    match = provider.detect(url);
    if (match) {
      selectedProvider = provider;
      break;
    }
  }

  if (!selectedProvider) {
    throw new Error("No suitable adapter found for the given URL.");
  }

  const deps = {};
  if (options.fetchPage) deps.fetchPage = options.fetchPage;
  const nowMs = options.nowMs ?? Date.now();
  deps.nowMs = nowMs;

  let doc;
  if (options.html != null) {
    doc = {
      html: options.html,
      url: url.toString(),
      finalUrl: url.toString(),
      contentType: "text/html",
      fetchedAt: nowMs
    };
  } else {
    doc = await selectedProvider.fetch(url, deps);
  }
  const normalized = selectedProvider.normalize(doc, {
    nowMs,
    defaultTimezone: options.defaultTimezone,
    sourceUrl: doc.finalUrl ?? doc.url,
  });

  return normalized;
}
