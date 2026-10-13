import { describe, expect, it } from 'vitest';
import { getMarketplace } from '@/utils/marketplace/marketplaces';
import { renderMarketCardHtml } from './render-market-card';

describe('renderMarketCardHtml', () => {
  it('escapes the action href for attribute safety', () => {
    const marketplace = getMarketplace('amazon.com')!;
    const html = renderMarketCardHtml({
      marketplace,
      row: {
        status: 'Signed out',
        statusClass: 'is-out',
        email: '',
        checkedLabel: 'Never checked',
        tooltip: 'Open Amazon',
        linkStatus: 'logged_out',
        updating: false,
        lastKnown: false,
      },
      forAllList: false,
      statusFilter: 'all',
      checkingLabel: 'Checking…',
    });

    expect(html).toContain('href="https://www.amazon.com/');
    expect(html).not.toContain('href="https://www.amazon.com/" onclick=');
  });
});
