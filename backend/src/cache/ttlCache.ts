import { LRUCache } from "lru-cache";
import { CACHE_TTL_MS } from "../config.js";

interface CacheOptions {
  max: number;
  /** Optional cap on the total JSON size of cached values. */
  maxSizeBytes?: number;
}

/** LRU cache with TTL and in-flight request deduplication: concurrent
 *  cache misses on one key (e.g. several browser tabs loading the map
 *  while the cache is cold) share a single upstream fetch instead of each
 *  starting their own. */
export class TtlCache {
  // Values are wrapped in { v } so any T (including primitives/arrays) can
  // be stored regardless of lru-cache's `V extends {}` constraint.
  private readonly store: LRUCache<string, { v: unknown }>;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor({ max, maxSizeBytes }: CacheOptions) {
    this.store = new LRUCache<string, { v: unknown }>({
      max,
      ttl: CACHE_TTL_MS,
      ...(maxSizeBytes && {
        maxSize: maxSizeBytes,
        sizeCalculation: (entry) => JSON.stringify(entry.v ?? null).length || 1,
      }),
    });
  }

  async getOrLoad<T>(
    key: string,
    load: () => Promise<T>,
    /** Overrides the default TTL for this entry — e.g. Wikidata data
     *  changes slowly and its query service rate-limits aggressively, so
     *  it's worth caching longer than RINF's own 6h default. */
    ttlMs?: number,
  ): Promise<T> {
    const cached = this.store.get(key);
    if (cached !== undefined) return cached.v as T;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = load()
      .then((value) => {
        this.store.set(key, { v: value }, ttlMs ? { ttl: ttlMs } : undefined);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

/** Whole-country layers, Wikidata enrichment, the dataset list and other
 *  per-country rollups. Every key here is derived from the server's own
 *  registries (countries × fixed layer/parameter ids, never free-form
 *  input), so the key space is bounded by construction and `max` sits
 *  above it, so nothing here is ever evicted before its TTL. That
 *  matters: one cold country load can take 2-3 minutes upstream
 *  (Germany). DATASET_CACHE_KEYS_PER_COUNTRY counts the keys per country
 *  — keep it in step when adding a per-country endpoint. */
export const DATASET_CACHE_KEYS_PER_COUNTRY =
  5 /* op, sol, tunnels, primary locations, wikidata */ +
  4 /* infrastructure layers */ +
  1 /* provider graphs */ +
  4 /* track parameters */ +
  1; /* national lines */
export const datasetCache = new TtlCache({ max: 500 });

/** Per-entity lookups keyed by user input (uopid detail, describe). Kept
 *  separate so that a flood of unique keys can only churn this cache,
 *  never evict the expensive country data above; capped by total size
 *  too, since one describe result can hold up to 1000 triples. */
export const lookupCache = new TtlCache({
  max: 2000,
  maxSizeBytes: 64 * 1024 * 1024,
});
