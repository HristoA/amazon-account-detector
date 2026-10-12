import { beforeEach, describe, expect, it } from 'vitest';
import { formatCheckedAt, setActiveLocale } from './i18n';

describe('formatCheckedAt', () => {
  beforeEach(() => {
    setActiveLocale('en');
  });

  it('returns never-checked copy when timestamp is missing or zero', () => {
    expect(formatCheckedAt(undefined, 'en')).toBe('Never checked');
    expect(formatCheckedAt(0, 'en')).toBe('Never checked');
  });

  it('formats a local datetime string that includes seconds', () => {
    const checkedAt = Date.UTC(2023, 9, 27, 14, 30, 45);
    const label = formatCheckedAt(checkedAt, 'en-US');
    expect(label).toMatch(/\d/);
    expect(label).toMatch(/30/);
    expect(label).toMatch(/45/);
  });
});
