/**
 * Shared adapter helpers. Adapters stay thin: they define URL recognition and
 * platform-specific extraction; fetching goes through this helper.
 */

import { safeFetch } from "safe-fetch-guard";

/**
 * Fetch an event page, pinning the request to the adapter's own host family so
 * a redirect can't wander off-platform. `deps.fetchPage` is a trusted,
 * response-compatible transport seam for tests and deployments that already
 * provide an SSRF-safe fetcher. The default is safe-fetch-guard.
 *
 * @returns {Promise<import("../contracts.js").EventSourceDocument>}
 */
export async function fetchDocument(url, { allowUrl, deps = {} } = {}) {
  const fetchPage = deps.fetchPage ?? safeFetch;
  if (typeof fetchPage !== "function") {
    throw new TypeError("fetchPage must be a function");
  }
  const response = await fetchPage(url, deps.fetchOptions ?? {});
  const finalUrl = response.url || String(url);

  if (allowUrl && !allowUrl(finalUrl)) {
    await response.close?.();
    throw new Error("Redirected to disallowed URL");
  }

  const html = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  return {
    url,
    finalUrl,
    html,
    contentType,
    fetchedAt: deps.nowMs ?? 0,
  };
}

/** Same-registrable-domain predicate, e.g. keep partiful redirects on partiful.com. */
export function sameSiteAllow(hostSuffix) {
  return (candidate) => {
    try {
      const host = new URL(candidate).hostname.toLowerCase();
      return host === hostSuffix || host.endsWith(`.${hostSuffix}`);
    } catch {
      return false;
    }
  };
}
