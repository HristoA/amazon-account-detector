import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml(`a <b> & "c" 'd'`)).toBe(
      'a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#39;',
    );
  });
});
