import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getStoredStatusFilter,
  normalizeStatusFilter,
  setStoredStatusFilter,
} from './status-filter-preference';

describe('normalizeStatusFilter', () => {
  it('returns All when value is missing or invalid', () => {
    expect(normalizeStatusFilter(undefined)).toBe('all');
    expect(normalizeStatusFilter(null)).toBe('all');
    expect(normalizeStatusFilter('')).toBe('all');
    expect(normalizeStatusFilter('checking')).toBe('all');
  });

  it('keeps known status filters', () => {
    expect(normalizeStatusFilter('all')).toBe('all');
    expect(normalizeStatusFilter('logged_in')).toBe('logged_in');
    expect(normalizeStatusFilter('logged_out')).toBe('logged_out');
    expect(normalizeStatusFilter('unknown')).toBe('unknown');
  });
});

describe('status filter preference storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('defaults to All when nothing is stored', async () => {
    expect(await getStoredStatusFilter()).toBe('all');
  });

  it('persists the selected status filter across reads', async () => {
    await setStoredStatusFilter('logged_in');
    expect(await getStoredStatusFilter()).toBe('logged_in');

    await setStoredStatusFilter('logged_out');
    expect(await getStoredStatusFilter()).toBe('logged_out');
  });
});
