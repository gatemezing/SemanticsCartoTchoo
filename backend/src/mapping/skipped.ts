/** Records whose geometry can't be used are left out of a layer rather
 *  than failing the whole country (one bad Norwegian record used to turn
 *  every Norwegian operational-points request into a 500). The count is
 *  logged so the gap stays visible. */
export function warnSkipped(layer: string, skipped: number): void {
  if (skipped > 0) console.warn(`${layer}: ${skipped} record(s) without usable geometry left out`);
}
