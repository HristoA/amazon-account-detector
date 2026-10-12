import { describe, expect, it } from 'vitest';
import { countryCodeToFlag, formatFlagLabel } from './flags.ts';

const LRE = '\u202A';
const PDF = '\u202C';

describe('formatFlagLabel', () => {
  const flag = countryCodeToFlag('SA');
  const us = countryCodeToFlag('US');

  it('puts the flag before the label in LTR UI', () => {
    expect(formatFlagLabel(us, 'English', false)).toBe(`${us} English`);
    expect(formatFlagLabel(flag, 'العربية', false)).toBe(`${flag} العربية`);
  });

  it('LTR-embeds text-then-flag in RTL UI for Latin and Arabic labels', () => {
    expect(formatFlagLabel(us, 'English', true)).toBe(
      `${LRE}English ${us}${PDF}`,
    );
    expect(formatFlagLabel(flag, 'العربية', true)).toBe(
      `${LRE}العربية ${flag}${PDF}`,
    );
    expect(formatFlagLabel('🏳️', 'الكل', true)).toBe(`${LRE}الكل 🏳️${PDF}`);
  });
});
