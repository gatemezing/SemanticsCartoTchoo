import { LRUCache } from "lru-cache";
import { CACHE_TTL_MS } from "../config.js";

// Values are wrapped in { v } so any T (including primitives/arrays) can be
// stored regardless of lru-cache's `V extends {}` constraint.
const store = new LRUCache<string, { v: unknown }>({
  max: 100,
  ttl: CACHE_TTL_MS,
});

/** In-flight requests per key, so concurrent cache misses (e.g. several
 *  browser tabs loading the map while the cache is cold) share a single
 *  ~30-40s upstream SPARQL fetch instead of each starting their own. */
const inFlight = new Map<string, Promise<unknown>>();

export async function getOrLoad<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const cached = store.get(key);
  if (cached !== undefined) return cached.v as T;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      store.set(key, { v: value });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
