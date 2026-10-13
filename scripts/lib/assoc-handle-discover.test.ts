import { describe, expect, it } from 'vitest';
import {
  classifyAssocHandleProbe,
  diffAssocHandles,
  extractAssocHandleFromHtml,
  formatAssocHandleDiffReport,
  needsBrowserWafFallback,
  summarizeAssocHandleDiff,
} from './assoc-handle-discover';

describe('extractAssocHandleFromHtml', () => {
  it('extracts openid.assoc_handle from a sign-in href', () => {
    const html = `
      <a href="https://www.amazon.de/ap/signin?openid.assoc_handle=deflex&openid.mode=checkid_setup">
        Sign in
      </a>
    `;
    expect(extractAssocHandleFromHtml(html)).toBe('deflex');
  });

  it('decodes percent-encoded assoc_handle query params', () => {
    const html = `
      <a href="/ap/signin?openid.assoc_handle%3Dgbflex%26openid.ns%3Dhttp">UK</a>
    `;
    expect(extractAssocHandleFromHtml(html)).toBe('gbflex');
  });

  it('decodes HTML-entity-encoded = separators (&#061;)', () => {
    // Amazon captcha / soft-block pages escape = in hidden return URLs.
    const html = `
      <input name="amzn-r" value="&#047;ap&#047;signin?openid.assoc_handle&#061;deflex&amp;openid.mode&#061;checkid_setup" />
    `;
    expect(extractAssocHandleFromHtml(html)).toBe('deflex');
  });

  it('decodes HTML-entity-encoded percent (%3D via &#037;)', () => {
    const html = `
      <input value="openid.assoc_handle&#037;3Dgbflex&#037;26openid.ns&#037;3Dhttp" />
    `;
    expect(extractAssocHandleFromHtml(html)).toBe('gbflex');
  });

  it('extracts handles from claim form actions with &amp; separators', () => {
    const html = `
      <form action="/ax/claim?openid.assoc_handle=usflex&amp;openid.mode=checkid_setup">
    `;
    expect(extractAssocHandleFromHtml(html)).toBe('usflex');
  });

  it('prefers the most common *flex handle when several appear', () => {
    const html = `
      <a href="?openid.assoc_handle=usflex">a</a>
      <a href="?openid.assoc_handle=usflex">b</a>
      <a href="?openid.assoc_handle=otherflex">c</a>
      <a href="?openid.assoc_handle=usflex">d</a>
    `;
    expect(extractAssocHandleFromHtml(html)).toBe('usflex');
  });

  it('returns undefined when no handle is present', () => {
    expect(extractAssocHandleFromHtml('<html><body>nope</body></html>')).toBe(
      undefined,
    );
  });

  it('returns undefined for AWS WAF challenge HTML without a handle', () => {
    const html = `
      <html><script src="https://example.awswaf.com/challenge.js"></script>
      <div id="challenge-container"></div></html>
    `;
    expect(extractAssocHandleFromHtml(html)).toBeUndefined();
  });
});

/** Sign-in markup with the handle (may appear only once — Amazon’s current pages). */
function htmlWithHandle(handle: string): string {
  return `
    <form id="ap_login_form">
      <input id="ap_email" name="email" />
      <a href="?openid.assoc_handle=${handle}">a</a>
    </form>
  `;
}

describe('classifyAssocHandleProbe', () => {
  it('matches when the expected handle appears on a real sign-in page', () => {
    expect(
      classifyAssocHandleProbe('deflex', {
        httpStatus: 200,
        html: htmlWithHandle('deflex'),
      }),
    ).toEqual({ discovered: 'deflex', status: 'match' });
  });

  it('matches a single probe-URL echo when auth UI is present', () => {
    expect(
      classifyAssocHandleProbe('usflex', {
        httpStatus: 200,
        html: `
          <form id="ap_login_form">
            <input id="ap_email" name="email" />
            <input type="hidden" value="openid.assoc_handle&#061;usflex" />
          </form>
        `,
      }),
    ).toEqual({ discovered: 'usflex', status: 'match' });
  });

  it('does not treat a bare probe-URL echo without auth UI as a match', () => {
    expect(
      classifyAssocHandleProbe('usflex', {
        httpStatus: 200,
        html: '<a href="?openid.assoc_handle=usflex">only once</a>',
      }),
    ).toEqual({ discovered: null, status: 'missing' });
  });

  it('mismatches when a different handle is embedded', () => {
    expect(
      classifyAssocHandleProbe('deflex', {
        httpStatus: 200,
        html: htmlWithHandle('usflex'),
      }),
    ).toEqual({ discovered: 'usflex', status: 'mismatch' });
  });

  it('marks 404 as rejected', () => {
    expect(
      classifyAssocHandleProbe('usflex', {
        httpStatus: 404,
        html: 'Not Found',
      }),
    ).toEqual({ discovered: null, status: 'rejected' });
  });

  it('marks WAF HTML / 202 / 5xx / captcha soft-blocks as blocked', () => {
    expect(
      classifyAssocHandleProbe('usflex', {
        httpStatus: 202,
        html: '<html><script>window.gokuProps={}</script></html>',
      }),
    ).toEqual({ discovered: null, status: 'blocked' });
    expect(
      classifyAssocHandleProbe('brflex', {
        httpStatus: 503,
        html: 'Service Unavailable',
      }),
    ).toEqual({ discovered: null, status: 'blocked' });
    expect(
      classifyAssocHandleProbe('usflex', {
        httpStatus: 200,
        html: `
          <form action="/errors_page/validateCaptcha">
            <input name="amzn-r" value="openid.assoc_handle&#061;usflex" />
          </form>
        `,
      }),
    ).toEqual({ discovered: null, status: 'blocked' });
  });

  it('marks failed requests as missing', () => {
    expect(
      classifyAssocHandleProbe('usflex', { httpStatus: null, html: null }),
    ).toEqual({ discovered: null, status: 'missing' });
  });
});

describe('diffAssocHandles', () => {
  const marketplaces = [
    { id: 'amazon.com', assocHandle: 'usflex' },
    { id: 'amazon.co.uk', assocHandle: 'gbflex' },
    { id: 'amazon.de', assocHandle: 'deflex' },
  ] as const;

  it('classifies probes per marketplace', () => {
    const probes = new Map([
      [
        'amazon.com',
        {
          httpStatus: 200,
          html: htmlWithHandle('usflex'),
        },
      ],
      [
        'amazon.co.uk',
        {
          httpStatus: 200,
          html: htmlWithHandle('wrongflex'),
        },
      ],
      ['amazon.de', { httpStatus: 404, html: 'Not Found' }],
    ]);

    expect(diffAssocHandles(marketplaces, probes)).toEqual([
      {
        marketplaceId: 'amazon.com',
        expected: 'usflex',
        discovered: 'usflex',
        status: 'match',
      },
      {
        marketplaceId: 'amazon.co.uk',
        expected: 'gbflex',
        discovered: 'wrongflex',
        status: 'mismatch',
      },
      {
        marketplaceId: 'amazon.de',
        expected: 'deflex',
        discovered: null,
        status: 'rejected',
      },
    ]);
  });

  it('treats absent probes as missing', () => {
    const probes = new Map([
      [
        'amazon.com',
        {
          httpStatus: 200,
          html: htmlWithHandle('usflex'),
        },
      ],
    ]);

    const rows = diffAssocHandles(marketplaces, probes);
    expect(rows.find((r) => r.marketplaceId === 'amazon.de')?.status).toBe(
      'missing',
    );
  });

  it('summarizes counts and ok only when all match', () => {
    const rows = diffAssocHandles(
      marketplaces,
      new Map([
        [
          'amazon.com',
          {
            httpStatus: 200,
            html: htmlWithHandle('usflex'),
          },
        ],
        [
          'amazon.co.uk',
          {
            httpStatus: 200,
            html: htmlWithHandle('wrongflex'),
          },
        ],
        ['amazon.de', { httpStatus: 202, html: 'gokuProps' }],
      ]),
    );
    expect(summarizeAssocHandleDiff(rows)).toEqual({
      matches: 1,
      mismatches: 1,
      missing: 0,
      blocked: 1,
      rejected: 0,
      ok: false,
    });
    expect(
      summarizeAssocHandleDiff(
        diffAssocHandles(
          marketplaces,
          new Map([
            [
              'amazon.com',
              {
                httpStatus: 200,
                html: htmlWithHandle('usflex'),
              },
            ],
            [
              'amazon.co.uk',
              {
                httpStatus: 200,
                html: htmlWithHandle('gbflex'),
              },
            ],
            [
              'amazon.de',
              {
                httpStatus: 200,
                html: htmlWithHandle('deflex'),
              },
            ],
          ]),
        ),
      ).ok,
    ).toBe(true);
  });

  it('formats a tab-separated report', () => {
    const report = formatAssocHandleDiffReport([
      {
        marketplaceId: 'amazon.com',
        expected: 'usflex',
        discovered: 'usflex',
        status: 'match',
      },
      {
        marketplaceId: 'amazon.de',
        expected: 'deflex',
        discovered: null,
        status: 'missing',
      },
    ]);
    expect(report).toContain('status\tmarketplace\texpected\tdiscovered');
    expect(report).toContain('match\tamazon.com\tusflex\tusflex');
    expect(report).toContain('missing\tamazon.de\tdeflex\t(none)');
  });

  it('flags blocked and missing rows for Chromium fallback', () => {
    expect(needsBrowserWafFallback('blocked')).toBe(true);
    expect(needsBrowserWafFallback('missing')).toBe(true);
    expect(needsBrowserWafFallback('match')).toBe(false);
    expect(needsBrowserWafFallback('mismatch')).toBe(false);
    expect(needsBrowserWafFallback('rejected')).toBe(false);
  });
});
