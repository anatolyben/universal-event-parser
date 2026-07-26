/**
 * HTML / structured-metadata parsing helpers shared by all adapters.
 *
 * Untrusted-input contract: every function here treats the HTML as inert data.
 * Nothing is executed; <script> bodies are only ever JSON-parsed (JSON-LD,
 * __NEXT_DATA__) or ignored. Callers must not feed extracted text back into any
 * eval/templating path.
 *
 * The JSON-LD / __NEXT_DATA__ / decode / normalize helpers are adapted from the
 * proven apps/api event-import parser so behaviour matches what already ships.
 */

export function decodeHtml(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

export function normalizeText(value, maxLength = 4000) {
  if (typeof value !== "string") return null;
  const text = decodeHtml(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

/** Extract every <script>…</script> with its attributes + trimmed body. */
export function scriptBodies(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html))) {
    scripts.push({ attributes: match[1], body: match[2].trim() });
  }
  return scripts;
}

export function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(decodeHtml(body));
    } catch {
      return null;
    }
  }
}

/** The Next.js __NEXT_DATA__ blob, if present. */
export function nextData(html) {
  for (const script of scriptBodies(html)) {
    if (/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(script.attributes)) {
      return parseJson(script.body);
    }
  }
  return null;
}

function typeMatchesEvent(value) {
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    (type) =>
      typeof type === "string" &&
      (type === "Event" || /Event$/.test(type.replace(/^.*[/:#]/, ""))),
  );
}

/** Depth-first search for the first schema.org Event object in a JSON graph. */
export function findEventObject(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (typeMatchesEvent(value["@type"])) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findEventObject(entry, seen);
      if (found) return found;
    }
    return null;
  }
  for (const entry of Object.values(value)) {
    const found = findEventObject(entry, seen);
    if (found) return found;
  }
  return null;
}

/** Every JSON-LD block on the page, parsed (nulls dropped). */
export function jsonLdBlocks(html) {
  const blocks = [];
  for (const script of scriptBodies(html)) {
    if (!/type\s*=\s*["']application\/ld\+json["']/i.test(script.attributes)) {
      continue;
    }
    const parsed = parseJson(script.body);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

/** First schema.org/Event found across all JSON-LD blocks. */
export function jsonLdEvent(html) {
  for (const block of jsonLdBlocks(html)) {
    const event = findEventObject(block);
    if (event) return event;
  }
  return null;
}

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = tag.match(re);
  return m ? decodeHtml(m[2] ?? m[3] ?? "") : null;
}

/**
 * All <meta> tags as { key: content } where key is the property/name attribute.
 * Captures Open Graph (og:*), Twitter (twitter:*) and standard meta.
 */
export function metaTags(html) {
  const out = {};
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = (attr(tag, "property") || attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content != null && !(key in out)) out[key] = content;
  }
  return out;
}

/** The <title> text, if any. */
export function titleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  return m ? normalizeText(m[1], 300) : null;
}

/**
 * A rough visible-text projection: strip script/style/head, tags → spaces,
 * collapse whitespace. Only used as a last-resort extraction signal and as LLM
 * input; never trusted structurally.
 */
export function visibleText(html, maxLength = 8000) {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return normalizeText(stripped, maxLength);
}

/** Resolve an image field that may be a string, array, or schema.org object. */
export function imageUrl(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = imageUrl(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    return value.url ?? value.contentUrl ?? value.cdn_url ?? null;
  }
  return null;
}

function uniqueParts(parts) {
  const out = [];
  for (const part of parts) {
    const normalized = normalizeText(part, 500);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

/** Flatten a schema.org location (string | Place | PostalAddress) to a string. */
export function schemaLocation(location) {
  if (typeof location === "string") return normalizeText(location, 500);
  if (!location || typeof location !== "object") return null;
  const address = location.address;
  const addressParts =
    typeof address === "string"
      ? [address]
      : address && typeof address === "object"
        ? [
            address.name,
            address.streetAddress,
            address.addressLocality,
            address.addressRegion,
            address.postalCode,
            address.addressCountry,
          ]
        : [];
  const parts = uniqueParts([location.name, ...addressParts]);
  return parts.length ? parts.join(", ").slice(0, 500) : null;
}

/** Pull structured address components out of a schema.org location, if present. */
export function schemaAddressParts(location) {
  if (!location || typeof location !== "object") return {};
  const a = location.address;
  if (!a || typeof a !== "object") return {};
  return {
    venueName: normalizeText(location.name, 200),
    address: normalizeText(a.streetAddress, 300),
    city: normalizeText(a.addressLocality, 120),
    region: normalizeText(a.addressRegion, 120),
    postalCode: normalizeText(a.postalCode, 40),
    country: normalizeText(
      typeof a.addressCountry === "object"
        ? a.addressCountry?.name
        : a.addressCountry,
      120,
    ),
  };
}
