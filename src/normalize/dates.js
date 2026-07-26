/**
 * Date + timezone resolution. Dates are the highest-risk field, so this module
 * is deterministic, clock-free (callers pass `nowMs`), and never silently uses
 * the server timezone.
 *
 * Guarantees:
 *  - an ISO string carrying an explicit offset (`...Z` / `+04:00`) is converted
 *    to UTC exactly, with no timezone guessing;
 *  - a wall-clock string WITHOUT an offset is only converted when an explicit
 *    IANA timezone is supplied — otherwise it is flagged `ambiguous` and left
 *    un-converted (never coerced through the server's local zone);
 *  - the original source text is always preserved for auditing.
 */

/** True if `tz` is a valid IANA timezone the runtime understands. */
export function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Does the string carry an explicit UTC offset (Z or ±HH:MM)? */
export function hasExplicitOffset(value) {
  return (
    typeof value === "string" && /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim())
  );
}

/** Is this a bare calendar date (YYYY-MM-DD, no time) → all-day candidate. */
export function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Offset (ms) of `timeZone` at the given absolute instant. Positive means the
 * zone is ahead of UTC. Uses the standard Intl formatToParts technique — no tz
 * database dependency.
 */
export function timezoneOffsetMs(instantMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(instantMs));
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instantMs;
}

/**
 * Interpret a wall-clock time (no offset, e.g. "2026-08-07T18:00:00") as local
 * time in `timeZone`, returning the corresponding UTC epoch ms. Iterates twice
 * so DST transitions resolve correctly.
 */
export function zonedWallTimeToUtcMs(wallIsoNoOffset, timeZone) {
  const m = String(wallIsoNoOffset)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, hh = "0", mm = "0", ss = "0"] = m;
  // First guess: pretend the wall time is UTC.
  let utcGuess = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss);
  for (let i = 0; i < 2; i++) {
    const offset = timezoneOffsetMs(utcGuess, timeZone);
    const corrected = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss) - offset;
    if (corrected === utcGuess) break;
    utcGuess = corrected;
  }
  return utcGuess;
}

/**
 * Resolve a raw date value to a UTC ISO instant.
 *
 * @param {string} raw the original source date string (preserved by the caller)
 * @param {object} [opts]
 * @param {string|null} [opts.timezone] explicit IANA tz to interpret an
 *   offset-less wall time. Ignored (not needed) when `raw` has its own offset.
 * @returns {{ iso: string|null, allDay: boolean, ambiguous: boolean,
 *   usedTimezone: string|null, reason?: string }}
 */
export function resolveInstant(raw, opts = {}) {
  const timezone =
    opts.timezone && isValidTimezone(opts.timezone) ? opts.timezone : null;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      iso: null,
      allDay: false,
      ambiguous: false,
      usedTimezone: null,
      reason: "empty",
    };
  }
  const text = raw.trim();

  // Bare calendar date → all-day. Anchor at local midnight of the given tz when
  // known, else leave ambiguous (do NOT assume server midnight).
  if (isDateOnly(text)) {
    if (!timezone) {
      return {
        iso: null,
        allDay: true,
        ambiguous: true,
        usedTimezone: null,
        reason: "all_day_needs_tz",
      };
    }
    const ms = zonedWallTimeToUtcMs(`${text}T00:00:00`, timezone);
    return {
      iso: new Date(ms).toISOString(),
      allDay: true,
      ambiguous: false,
      usedTimezone: timezone,
    };
  }

  // Explicit offset → unambiguous, convert directly. No tz guessing.
  if (hasExplicitOffset(text)) {
    const ms = Date.parse(text);
    if (Number.isNaN(ms)) {
      return {
        iso: null,
        allDay: false,
        ambiguous: true,
        usedTimezone: null,
        reason: "unparseable",
      };
    }
    return {
      iso: new Date(ms).toISOString(),
      allDay: false,
      ambiguous: false,
      usedTimezone: null,
    };
  }

  // Wall-clock time without an offset. Only safe to convert with an explicit tz.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) {
    if (!timezone) {
      return {
        iso: null,
        allDay: false,
        ambiguous: true,
        usedTimezone: null,
        reason: "wall_time_needs_tz",
      };
    }
    const ms = zonedWallTimeToUtcMs(text, timezone);
    if (ms == null) {
      return {
        iso: null,
        allDay: false,
        ambiguous: true,
        usedTimezone: null,
        reason: "unparseable",
      };
    }
    return {
      iso: new Date(ms).toISOString(),
      allDay: false,
      ambiguous: false,
      usedTimezone: timezone,
    };
  }

  // Anything else (free-form like "August 7, 6pm"): do NOT trust Date's local
  // parsing. Flag ambiguous so the caller routes it to LLM/confirmation.
  return {
    iso: null,
    allDay: false,
    ambiguous: true,
    usedTimezone: null,
    reason: "freeform",
  };
}

/** Has the event already ended, relative to the supplied clock? */
export function hasEnded({ startAt, endAt }, nowMs) {
  const end = endAt ? Date.parse(endAt) : startAt ? Date.parse(startAt) : NaN;
  if (Number.isNaN(end)) return false;
  return end < nowMs;
}

/** Does the event span local midnight in its timezone? */
export function crossesMidnight({ startAt, endAt, timezone }) {
  if (!startAt || !endAt || !isValidTimezone(timezone)) return false;
  const dayOf = (iso) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
    return parts;
  };
  return dayOf(startAt) !== dayOf(endAt);
}
