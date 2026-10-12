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
): string {
  if (!checkedAt) {
    return t('neverChecked');
  }
  // Local datetime string with seconds (e.g. "10/27/2023, 2:30:45 PM").
  return new Date(checkedAt).toLocaleString(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}
