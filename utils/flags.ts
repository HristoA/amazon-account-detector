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
