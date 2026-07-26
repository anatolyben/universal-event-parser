/**
 * FacebookEventAdapter — facebook.com/events/:id (and m.facebook.com, fb.me/e/:id).
 *
 * Facebook event pages are login-walled and JS-heavy, but PUBLIC events still
 * expose Open Graph + (sometimes) JSON-LD in the server-rendered HTML. We read
 * ONLY that public structured metadata — we never authenticate, bypass the
 * login wall, or scrape private events (the security contract). When a page is
 * gated, extraction simply comes back with missing core fields and the agent
 * asks for confirmation instead of inventing data.
 */
import { fetchDocument } from "./base.js";
import { extractStructured } from "../extract/structured.js";
import { buildExtractionResult } from "../extract/result.js";

const HOSTS = new Set([
  "facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.me",
]);

function host(u) {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

export const FacebookEventAdapter = {
  id: "facebook",

  canHandle(url) {
    try {
      const u = url instanceof URL ? url : new URL(url);
      return HOSTS.has(host(u));
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
    const h = host(u);
    if (!HOSTS.has(h)) return null;
    const path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");

    // fb.me/e/<shortcode>
    if (h === "fb.me") {
      const m = path.match(/^\/e\/([A-Za-z0-9_-]+)$/);
      return m
        ? { canonicalUrl: `https://fb.me/e/${m[1]}`, externalId: m[1] }
        : null;
    }
    // facebook.com/events/<id>  (id is numeric or a slug segment)
    const m = path.match(/^\/events\/([A-Za-z0-9._-]+)/);
    if (!m) return null;
    return {
      canonicalUrl: `https://www.facebook.com/events/${m[1]}`,
      externalId: m[1],
    };
  },

  async fetchSource(url, deps = {}) {
    // Keep redirects on Facebook's own hosts.
    return fetchDocument(url, {
      allowUrl: (candidate) => {
        try {
          return HOSTS.has(host(new URL(candidate)));
        } catch {
          return false;
        }
      },
      deps,
    });
  },

  extractEvent(doc) {
    const { fields, raw } = extractStructured(doc);
    const warnings = [];
    if (!raw.jsonLd) warnings.push("no_json_ld_event");
    // A public FB event page carries a startDate (JSON-LD/OG). Its absence means
    // the page was gated (login wall) or isn't a real event — warn rather than
    // invent. A login-looking title distinguishes the wall from a sparse event.
    if (fields.startAt?.value == null) {
      const titleVal = String(fields.title?.value ?? "").toLowerCase();
      warnings.push(
        /log\s*in.*facebook|facebook.*log\s*in/.test(titleVal)
          ? "facebook_login_wall_suspected"
          : "facebook_event_unavailable",
      );
    }
    const recognized = FacebookEventAdapter.recognize(doc.finalUrl ?? doc.url);
    return buildExtractionResult(fields, {
      sourcePlatform: "facebook",
      canonicalSourceUrl: recognized?.canonicalUrl ?? doc.finalUrl ?? doc.url,
      sourceExternalId: recognized?.externalId ?? null,
      raw,
      warnings,
    });
  },
};
