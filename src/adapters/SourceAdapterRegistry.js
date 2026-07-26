/**
 * SourceAdapterRegistry — ordered list of EventSourceAdapters. Platform adapters
 * are matched first (most specific); the generic adapter is the last resort.
 * New platforms are added by registering an adapter — no core changes.
 */
import { PartifulAdapter } from "./PartifulAdapter.js";
import { LumaAdapter } from "./LumaAdapter.js";
import { FacebookEventAdapter } from "./FacebookEventAdapter.js";
import { GenericEventPageAdapter } from "./GenericEventPageAdapter.js";

export class SourceAdapterRegistry {
  constructor(adapters) {
    /** @type {import("../contracts.js").EventSourceAdapter[]} */
    this.adapters = adapters ?? [];
  }

  register(adapter) {
    this.adapters.push(adapter);
    return this;
  }

  /** First adapter whose canHandle matches. */
  find(url) {
    let parsed;
    try {
      parsed = url instanceof URL ? url : new URL(url);
    } catch {
      return null;
    }
    return this.adapters.find((a) => a.canHandle(parsed)) ?? null;
  }

  /** The adapter + recognition for a URL, or null if none (incl. generic) claims it. */
  recognize(url) {
    const adapter = this.find(url);
    if (!adapter) return null;
    const recognized = adapter.recognize(url);
    if (!recognized) return null;
    return { adapter, ...recognized, sourcePlatform: adapter.id };
  }
}

/**
 * The default registry: named platform adapters first, generic LAST so it only
 * catches URLs no platform adapter claimed.
 */
export function createDefaultRegistry(extra = []) {
  return new SourceAdapterRegistry([
    PartifulAdapter,
    LumaAdapter,
    FacebookEventAdapter,
    ...extra,
    GenericEventPageAdapter,
  ]);
}
