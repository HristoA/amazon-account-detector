import { describe, expect, it } from 'vitest';
import { LOCALES, resolveLocale } from './locales';
import { countryCodeToFlag } from './flags';

describe('resolveLocale', () => {
  it('prefers stored locale when supported', () => {
    expect(resolveLocale('ar', 'en-US')).toBe('ar');
  });

  it('maps browser language base tag', () => {
    expect(resolveLocale(null, 'de-DE')).toBe('de');
    expect(resolveLocale(null, 'ja-JP')).toBe('ja');
  });

  it('falls back to English', () => {
    expect(resolveLocale(null, 'zh-CN')).toBe('en');
    expect(resolveLocale('xx', 'xx-YY')).toBe('en');
  });

  it('marks Arabic as RTL and uses planned flags for en/pt', () => {
    const ar = LOCALES.find((l) => l.code === 'ar')!;
    const en = LOCALES.find((l) => l.code === 'en')!;
    const pt = LOCALES.find((l) => l.code === 'pt')!;
    expect(ar.rtl).toBe(true);
    expect(en.flagCountryCode).toBe('US');
    expect(pt.flagCountryCode).toBe('PT');
    expect(countryCodeToFlag(en.flagCountryCode)).toBe('🇺🇸');
    expect(countryCodeToFlag(pt.flagCountryCode)).toBe('🇵🇹');
  });

  it('lists languages by total speaker population (highest first)', () => {
    expect(LOCALES.map((l) => l.code)).toEqual([
      'en',
      'hi',
      'es',
      'ar',
      'fr',
      'pt',
      'de',
      'ja',
      'tr',
      'it',
      'pl',
      'nl',
      'sv',
    ]);
  });
});
