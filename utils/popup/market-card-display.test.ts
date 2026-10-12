import { describe, expect, it } from 'vitest';
import {
  displayMarketEmail,
  renderMarketStatusMark,
} from './market-card-display';

describe('displayMarketEmail', () => {
  it('returns the email when logged in with an email', () => {
    expect(
      displayMarketEmail({
        status: 'logged_in',
        email: 'user@example.com',
        checkedAt: 1,
      }),
    ).toBe('user@example.com');
  });

  it('returns empty when logged in without an email', () => {
    expect(displayMarketEmail({ status: 'logged_in', checkedAt: 1 })).toBe('');
  });

  it('returns empty when logged out, unknown, or missing', () => {
    expect(displayMarketEmail({ status: 'logged_out', checkedAt: 1 })).toBe('');
    expect(displayMarketEmail({ status: 'unknown', checkedAt: 1 })).toBe('');
    expect(displayMarketEmail(undefined)).toBe('');
  });
});

describe('renderMarketStatusMark', () => {
  it('renders a check mark for ok', () => {
    const html = renderMarketStatusMark('ok');
    expect(html).toContain('market-status-mark ok');
    expect(html).toContain('<svg');
  });

  it('renders an orange warn mark for last-known signed-in', () => {
    const html = renderMarketStatusMark('ok', false, true);
    expect(html).toContain('market-status-mark last-known');
    expect(html).toContain('<svg');
    expect(html).not.toContain('market-status-mark ok');
  });

  it('renders a warn mark for unknown', () => {
    const html = renderMarketStatusMark('unknown');
    expect(html).toContain('market-status-mark unknown');
    expect(html).toContain('<svg');
  });

  it('renders a spinner mark when updating, regardless of status', () => {
    const html = renderMarketStatusMark('ok', true);
    expect(html).toContain('market-status-mark checking');
    expect(html).toContain('market-status-spinner');
    expect(html).not.toContain('market-status-mark ok');
  });

  it('renders a gray minus mark for logged-out / out when not updating', () => {
    const html = renderMarketStatusMark('out');
    expect(html).toContain('market-status-mark out');
    expect(html).toContain('<svg');
  });

  it('renders a spinner for logged-out when updating', () => {
    expect(renderMarketStatusMark('out', true)).toContain(
      'market-status-spinner',
    );
  });
});
