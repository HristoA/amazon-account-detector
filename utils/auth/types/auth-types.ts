export type AuthStatus = 'logged_in' | 'logged_out' | 'unknown';

export type ParseResult =
  | { kind: 'logged_in'; email: string }
  | { kind: 'logged_out' }
  | { kind: 'indeterminate' };

export interface AuthCacheEntry {
  status: AuthStatus;
  email?: string;
  checkedAt: number;
  source?: 'fetch' | 'tab';
  /**
   * True when a later check returned `unknown` and we kept this definitive
   * status/email — UI should present it as last-known, not freshly verified.
   */
  lastKnown?: boolean;
}

export type AuthByMarketplace = Record<string, AuthCacheEntry>;
