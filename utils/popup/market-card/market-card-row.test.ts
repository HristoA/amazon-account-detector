import { describe, expect, it } from 'vitest';
import type { MessageKey } from '@/utils/i18n/i18n';
import { getMarketplace } from '@/utils/marketplace/marketplaces';
import { buildMarketCardRow, statusLabelForEntry } from './market-card-row';

const t = (key: MessageKey): string => key;

describe('statusLabelForEntry', () => {
  it('maps statuses to message keys', () => {
    expect(statusLabelForEntry(undefined, t)).toBe('unknown');
    expect(statusLabelForEntry({ status: 'logged_in', checkedAt: 1 }, t)).toBe(
      'loggedIn',
    );
    expect(statusLabelForEntry({ status: 'logged_out', checkedAt: 1 }, t)).toBe(
      'loggedOut',
    );
  });
});

describe('buildMarketCardRow', () => {
  it('builds display fields for a signed-in marketplace', () => {
    const marketplace = getMarketplace('amazon.com')!;
    const row = buildMarketCardRow({
      marketplace,
      entry: {
        status: 'logged_in',
        email: 'a@b.com',
        checkedAt: 1,
        lastKnown: true,
      },
      updating: false,
      locale: 'en',
      t,
    });

    expect(row.statusClass).toBe('ok');
    expect(row.email).toBe('a@b.com');
    expect(row.lastKnown).toBe(true);
    expect(row.tooltip).toContain('United States');
  });
});
