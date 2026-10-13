import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHtml } from './dom-escape';

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml(`a <b> & "c" 'd'`)).toBe(
      'a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#39;',
    );
  });
});

describe('escapeAttr', () => {
  it('escapes quotes and ampersands', () => {
    expect(escapeAttr('a "b" & <c>')).toBe('a &quot;b&quot; &amp; &lt;c&gt;');
  });
});
