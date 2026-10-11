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
}

export type AuthByMarketplace = Record<string, AuthCacheEntry>;
