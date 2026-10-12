import { countryCodeToFlag } from '../marketplace/flags';

export interface LocaleDefinition {
  code: string;
  /** Native / English label for the language picker. */
  label: string;
  rtl: boolean;
  flagCountryCode: string;
}

export const DEFAULT_LOCALE = 'en';

/**
 * UI languages ordered by estimated total speakers (L1+L2), highest first.
 * Approx. Ethnologue totals (millions): en 1500, hi 610, es 560, ar 335,
 * fr 310, pt 270, de 134, ja 126, tr 91, it 66, pl ~40, nl ~25, sv ~10.
 * Dropdown consumes this list as-is — do not re-sort at render time.
 */
export const LOCALES: readonly LocaleDefinition[] = [
  { code: 'en', label: 'English', rtl: false, flagCountryCode: 'US' },
  { code: 'hi', label: 'हिन्दी', rtl: false, flagCountryCode: 'IN' },
  { code: 'es', label: 'Español', rtl: false, flagCountryCode: 'ES' },
  { code: 'ar', label: 'العربية', rtl: true, flagCountryCode: 'SA' },
  { code: 'fr', label: 'Français', rtl: false, flagCountryCode: 'FR' },
  { code: 'pt', label: 'Português', rtl: false, flagCountryCode: 'PT' },
  { code: 'de', label: 'Deutsch', rtl: false, flagCountryCode: 'DE' },
  { code: 'ja', label: '日本語', rtl: false, flagCountryCode: 'JP' },
  { code: 'tr', label: 'Türkçe', rtl: false, flagCountryCode: 'TR' },
  { code: 'it', label: 'Italiano', rtl: false, flagCountryCode: 'IT' },
  { code: 'pl', label: 'Polski', rtl: false, flagCountryCode: 'PL' },
  { code: 'nl', label: 'Nederlands', rtl: false, flagCountryCode: 'NL' },
  { code: 'sv', label: 'Svenska', rtl: false, flagCountryCode: 'SE' },
] as const;

const localeByCode = new Map(LOCALES.map((l) => [l.code, l]));

export function getLocale(code: string): LocaleDefinition | undefined {
  return localeByCode.get(code);
}

export function isSupportedLocale(code: string): boolean {
  return localeByCode.has(code);
}

export function localeFlag(locale: LocaleDefinition): string {
  return countryCodeToFlag(locale.flagCountryCode);
}

/** Map browser UI language (e.g. en-US) to a supported locale code. */
export function resolveLocale(
  stored: string | null | undefined,
  browserLanguage: string,
): string {
  if (stored && isSupportedLocale(stored)) {
    return stored;
  }
  const base = browserLanguage.toLowerCase().split('-')[0] ?? '';
  if (isSupportedLocale(base)) {
    return base;
  }
  return DEFAULT_LOCALE;
}

export function applyDocumentLocale(localeCode: string): void {
  const locale = getLocale(localeCode) ?? getLocale(DEFAULT_LOCALE)!;
  document.documentElement.lang = locale.code;
  document.documentElement.dir = locale.rtl ? 'rtl' : 'ltr';
}
