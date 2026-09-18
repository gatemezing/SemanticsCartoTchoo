/** Builds a flag emoji from an ISO 3166-1 alpha-2 code (regional indicator
 *  symbols — no image assets needed). RINF's own uopid prefix for Greece is
 *  "EL", which isn't a real ISO2 code and wouldn't render as a flag, so it's
 *  mapped to "GR" here for display purposes only (the data-query code stays
 *  "EL" everywhere else in the app). */
const FLAG_ISO2_OVERRIDES: Record<string, string> = { EL: "GR" };

export function countryFlagEmoji(code: string): string {
  const iso2 = FLAG_ISO2_OVERRIDES[code] ?? code;
  const points = [...iso2.toUpperCase()].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65,
  );
  return String.fromCodePoint(...points);
}
