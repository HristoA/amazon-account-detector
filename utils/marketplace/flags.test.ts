import { afterEach, describe, expect, it } from 'vitest';
import {
  countryCodeToFlag,
  formatFlagLabel,
  resetFlagEmojiSupportCacheForTests,
  setFlagEmojiSupportForTests,
  supportsFlagEmoji,
} from './flags';

const LRE = '\u202A';
const PDF = '\u202C';

afterEach(() => {
  resetFlagEmojiSupportCacheForTests();
});

describe('supportsFlagEmoji', () => {
  it('returns false in Node (no canvas rendering)', () => {
    expect(supportsFlagEmoji()).toBe(false);
  });

  it('honors an explicit test override', () => {
    setFlagEmojiSupportForTests(true);
    expect(supportsFlagEmoji()).toBe(true);
    setFlagEmojiSupportForTests(false);
    expect(supportsFlagEmoji()).toBe(false);
  });
});

describe('formatFlagLabel', () => {
  const flag = countryCodeToFlag('SA');
  const us = countryCodeToFlag('US');

  it('puts the flag before the label in LTR UI when flags are supported', () => {
    setFlagEmojiSupportForTests(true);
    expect(formatFlagLabel(us, 'English', false)).toBe(`${us} English`);
    expect(formatFlagLabel(flag, 'العربية', false)).toBe(`${flag} العربية`);
  });

  it('LTR-embeds text-then-flag in RTL UI when flags are supported', () => {
    setFlagEmojiSupportForTests(true);
    expect(formatFlagLabel(us, 'English', true)).toBe(
      `${LRE}English ${us}${PDF}`,
    );
    expect(formatFlagLabel(flag, 'العربية', true)).toBe(
      `${LRE}العربية ${flag}${PDF}`,
    );
    expect(formatFlagLabel('🌐', 'الكل', true)).toBe(`${LRE}الكل 🌐${PDF}`);
  });

  it('omits the flag when the OS does not support flag emoji', () => {
    setFlagEmojiSupportForTests(false);
    expect(formatFlagLabel(us, 'English', false)).toBe('English');
    expect(formatFlagLabel(us, 'English', true)).toBe('English');
    expect(formatFlagLabel('🌐', 'All', false)).toBe('All');
    expect(formatFlagLabel(flag, 'العربية', true)).toBe('العربية');
  });

  it('omits the flag when the flag string is empty', () => {
    setFlagEmojiSupportForTests(true);
    expect(formatFlagLabel('', 'English', false)).toBe('English');
    expect(formatFlagLabel('', 'English', true)).toBe('English');
  });
});
