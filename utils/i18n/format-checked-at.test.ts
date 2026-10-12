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

  it('formats same-day checks as time only with seconds', () => {
    const now = new Date(2023, 9, 27, 18, 0, 0).getTime();
    const checkedAt = new Date(2023, 9, 27, 0, 1, 45).getTime();
    const label = formatCheckedAt(checkedAt, 'en-US', false, now);
    expect(label).toMatch(/12:01:45/);
    expect(label).not.toMatch(/Oct|2023/);
  });

  it('formats other-day checks as short date and time with seconds', () => {
    const now = new Date(2023, 9, 13, 12, 0, 0).getTime();
    const checkedAt = new Date(2023, 9, 12, 21, 7, 8).getTime();
    const label = formatCheckedAt(checkedAt, 'en-US', false, now);
    expect(label).toMatch(/Oct/);
    expect(label).toMatch(/12/);
    expect(label).toMatch(/9:07:08/);
    expect(label).not.toMatch(/2023/);
  });

  it('prefixes last-known when requested', () => {
    const now = new Date(2023, 9, 27, 18, 0, 0).getTime();
    const checkedAt = new Date(2023, 9, 27, 14, 30, 15).getTime();
    const label = formatCheckedAt(checkedAt, 'en-US', true, now);
    expect(label.startsWith('Last known · ')).toBe(true);
    expect(label).toMatch(/2:30:15|14:30:15/);
  });
});
