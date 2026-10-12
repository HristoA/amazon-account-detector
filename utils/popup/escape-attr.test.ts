import { describe, expect, it } from 'vitest';
import { escapeAttr } from './escape-attr';

describe('escapeAttr', () => {
  it('escapes quotes and ampersands', () => {
    expect(escapeAttr('a "b" & <c>')).toBe('a &quot;b&quot; &amp; &lt;c&gt;');
  });
});
