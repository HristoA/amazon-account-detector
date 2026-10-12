import ar from '../../locales/ar.json';
import de from '../../locales/de.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import hi from '../../locales/hi.json';
import it from '../../locales/it.json';
import ja from '../../locales/ja.json';
import nl from '../../locales/nl.json';
import pl from '../../locales/pl.json';
import pt from '../../locales/pt.json';
import sv from '../../locales/sv.json';
import tr from '../../locales/tr.json';
import { DEFAULT_LOCALE, isSupportedLocale } from './locales';

export type MessageKey = keyof typeof en;

type Catalog = Record<MessageKey, string>;

const catalogs: Record<string, Catalog> = {
  en,
  de,
  ja,
  fr,
  es,
  it,
  pt,
  nl,
  pl,
  sv,
  tr,
  ar,
  hi,
};

let activeLocale = DEFAULT_LOCALE;

export function setActiveLocale(locale: string): void {
  activeLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getActiveLocale(): string {
  return activeLocale;
}

export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const catalog = catalogs[activeLocale] ?? catalogs[DEFAULT_LOCALE]!;
  let message = catalog[key] ?? catalogs[DEFAULT_LOCALE]![key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
  }
  return message;
}

export function formatCheckedAt(
  checkedAt: number | undefined,
  locale: string,
  lastKnown = false,
  nowMs: number = Date.now(),
): string {
  if (!checkedAt) {
    return t('neverChecked');
  }
  const whenDate = new Date(checkedAt);
  const now = new Date(nowMs);
  // Same local calendar day → time only; else short date + time (always with seconds).
  const sameDay =
    whenDate.getFullYear() === now.getFullYear() &&
    whenDate.getMonth() === now.getMonth() &&
    whenDate.getDate() === now.getDate();
  const when = sameDay
    ? whenDate.toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : whenDate.toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      });
  if (lastKnown) {
    return t('lastKnownChecked', { when });
  }
  return when;
}
