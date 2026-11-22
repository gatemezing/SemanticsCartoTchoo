/** Memoises `enrich(base, extra)` on the identity of both inputs. Both are
 *  cache entries (a RINF layer, a Wikidata index) that stay the same object
 *  until they expire, so this runs the join once per pair instead of on
 *  every request, and lets go of a result when either input is dropped. */
const memo = new WeakMap<object, WeakMap<object, unknown>>();

export function enrichOnce<B extends object, E extends object, R>(
  base: B,
  extra: E,
  enrich: (base: B, extra: E) => R,
): R {
  let byExtra = memo.get(base);
  if (!byExtra) {
    byExtra = new WeakMap();
    memo.set(base, byExtra);
  }
  if (byExtra.has(extra)) return byExtra.get(extra) as R;
  const result = enrich(base, extra);
  byExtra.set(extra, result);
  return result;
}
