import { describe, expect, it, vi } from 'vitest';
import { syncMarketStatusMark } from './sync-market-status-mark';

type FakeMark = {
  classList: { contains(token: string): boolean };
  remove: () => void;
};

function markClassFromHtml(html: string): string {
  const match = html.match(/market-status-mark\s+([\w-]+)/);
  return match?.[1] ?? '';
}

function createFakeCodeWrap(initialMark: FakeMark | null = null) {
  let mark = initialMark;
  const insertAdjacentHTML = vi.fn((_position: string, html: string) => {
    const className = markClassFromHtml(html);
    mark = {
      classList: {
        contains(token: string) {
          return token === className;
        },
      },
      remove: vi.fn(() => {
        mark = null;
      }),
    };
  });

  const codeWrap = {
    querySelector(selector: string) {
      if (selector !== '.market-status-mark') return null;
      return mark;
    },
    insertAdjacentHTML: insertAdjacentHTML as (
      position: InsertPosition,
      html: string,
    ) => void,
  };

  return {
    codeWrap,
    insertAdjacentHTML,
    getMark: () => mark,
  };
}

describe('syncMarketStatusMark', () => {
  it('adds a checking spinner when updating starts', () => {
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap();

    syncMarketStatusMark(codeWrap, 'ok', true, false);

    expect(insertAdjacentHTML).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML.mock.calls[0]?.[1]).toContain(
      'market-status-spinner',
    );
  });

  it('does not remount an existing spinner while still updating', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'checking';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'ok', true, false);
    syncMarketStatusMark(codeWrap, 'out', true, false);

    expect(insertAdjacentHTML).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('replaces the spinner when updating stops', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'checking';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'ok', false, false);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML.mock.calls[0]?.[1]).toContain(
      'market-status-mark ok',
    );
  });

  it('replaces a non-spinner mark when the status class changes', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'ok';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'out', false, false);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML.mock.calls[0]?.[1]).toContain(
      'market-status-mark out',
    );
  });

  it('does not remount when the non-spinner mark already matches', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'ok';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'ok', false, false);

    expect(insertAdjacentHTML).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not remount an existing last-known mark while still last-known', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'last-known';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'ok', false, true);

    expect(insertAdjacentHTML).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('replaces last-known with ok when freshness recovers', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'last-known';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'ok', false, false);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML.mock.calls[0]?.[1]).toContain(
      'market-status-mark ok',
    );
  });

  it('replaces ok with last-known when cache becomes stale', () => {
    const remove = vi.fn();
    const existing: FakeMark = {
      classList: {
        contains(token: string) {
          return token === 'ok';
        },
      },
      remove,
    };
    const { codeWrap, insertAdjacentHTML } = createFakeCodeWrap(existing);

    syncMarketStatusMark(codeWrap, 'ok', false, true);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML).toHaveBeenCalledTimes(1);
    expect(insertAdjacentHTML.mock.calls[0]?.[1]).toContain(
      'market-status-mark last-known',
    );
  });
});
