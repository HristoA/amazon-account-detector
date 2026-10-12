/** Convert ISO 3166-1 alpha-2 country code to a flag emoji. */
export function countryCodeToFlag(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return '';
  }
  return String.fromCodePoint(
    ...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
  );
}

/** U+202A LEFT-TO-RIGHT EMBEDDING … U+202C POP DIRECTIONAL FORMATTING */
const LRE = '\u202A';
const PDF = '\u202C';

/** Cached result of country-flag emoji support detection. */
let flagEmojiSupported: boolean | undefined;

/**
 * Whether the OS/browser renders regional-indicator flag emoji as color glyphs.
 *
 * Unsupported platforms (notably Windows/Chromium) often show two letters
 * instead; we hide flags in that case.
 */
export function supportsFlagEmoji(): boolean {
  if (flagEmojiSupported !== undefined) {
    return flagEmojiSupported;
  }
  flagEmojiSupported = detectFlagEmojiSupport();
  return flagEmojiSupported;
}

/** @internal — reset cache between tests. */
export function resetFlagEmojiSupportCacheForTests(): void {
  flagEmojiSupported = undefined;
}

/** @internal — force support on/off in unit tests. */
export function setFlagEmojiSupportForTests(value: boolean): void {
  flagEmojiSupported = value;
}

/**
 * Color-pixel probe: a real flag emoji has R≠G≠B channels; letter fallbacks
 * (e.g. "GB" on Windows) are typically greyscale.
 */
function detectFlagEmojiSupport(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.height = 10;
    canvas.width = canvas.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return false;
    }
    ctx.font = `${canvas.height}px Arial, sans-serif`;
    ctx.fillText('🇬🇧', 0, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! !== data[i + 1]! || data[i]! !== data[i + 2]!) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Flag + label for native `<option>` / plain text.
 *
 * LTR UI: `🇺🇸 Name`.
 * RTL UI: wrap `Name 🇺🇸` in an LTR embedding so the flag stays on the visual
 * right for both Latin and Arabic labels (plain source order is not enough).
 *
 * When the OS cannot render flag emoji (or `flag` is empty), returns `text` only.
 */
export function formatFlagLabel(
  flag: string,
  text: string,
  uiRtl: boolean,
): string {
  if (!flag || !supportsFlagEmoji()) {
    return text;
  }
  if (!uiRtl) {
    return `${flag} ${text}`;
  }
  return `${LRE}${text} ${flag}${PDF}`;
}
