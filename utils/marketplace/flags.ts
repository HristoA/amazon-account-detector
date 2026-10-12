/** Convert ISO 3166-1 alpha-2 country code to a flag emoji. */
export function countryCodeToFlag(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return '';
  }
  return String.fromCodePoint(
    ...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
  );
}

/** U+202A LEFT-TO-RIGHT EMBEDDING … U+202C POP DIRECTIONAL FORMATTING */
const LRE = '\u202A';
const PDF = '\u202C';

/**
 * Flag + label for native `<option>` / plain text.
 *
 * LTR UI: `🇺🇸 Name`.
 * RTL UI: wrap `Name 🇺🇸` in an LTR embedding so the flag stays on the visual
 * right for both Latin and Arabic labels (plain source order is not enough).
 */
export function formatFlagLabel(
  flag: string,
  text: string,
  uiRtl: boolean,
): string {
  if (!uiRtl) {
    return `${flag} ${text}`;
  }
  return `${LRE}${text} ${flag}${PDF}`;
}
