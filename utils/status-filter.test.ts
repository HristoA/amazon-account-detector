import { describe, expect, it } from 'vitest';
import {
  isStatusFilter,
  matchesStatusFilter,
  resolveFilterStatus,
} from './status-filter';

describe('resolveFilterStatus', () => {
  it('keeps logged_in and logged_out', () => {
    expect(resolveFilterStatus('logged_in')).toBe('logged_in');
    expect(resolveFilterStatus('logged_out')).toBe('logged_out');
  });

  it('maps unknown and missing to unknown', () => {
    expect(resolveFilterStatus('unknown')).toBe('unknown');
    expect(resolveFilterStatus(undefined)).toBe('unknown');
  });
});

describe('matchesStatusFilter', () => {
  it('matches everything when filter is all', () => {
    expect(matchesStatusFilter('all', 'logged_in')).toBe(true);
    expect(matchesStatusFilter('all', 'logged_out')).toBe(true);
    expect(matchesStatusFilter('all', undefined)).toBe(true);
  });

  it('filters by resolved status', () => {
    expect(matchesStatusFilter('logged_in', 'logged_in')).toBe(true);
    expect(matchesStatusFilter('logged_in', 'logged_out')).toBe(false);
    expect(matchesStatusFilter('logged_out', 'logged_out')).toBe(true);
    expect(matchesStatusFilter('unknown', undefined)).toBe(true);
    expect(matchesStatusFilter('unknown', 'unknown')).toBe(true);
    expect(matchesStatusFilter('unknown', 'logged_in')).toBe(false);
  });
});

describe('isStatusFilter', () => {
  it('accepts known filter values only', () => {
    expect(isStatusFilter('all')).toBe(true);
    expect(isStatusFilter('logged_in')).toBe(true);
    expect(isStatusFilter('checking')).toBe(false);
  });
});
