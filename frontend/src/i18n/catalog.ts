import type { Locale } from "./config";

export type Messages = Record<string, string>;

/** English and Bangla text for one area. Bangla must define every English key. */
export type Catalog<E extends Messages = Messages> = {
  en: E;
  bn: { [K in keyof E]: string };
};

export function defineCatalog<const E extends Messages>(
  catalog: Catalog<E>,
): Catalog<E> {
  return catalog;
}

/** Every message key defined by a list of catalogs (e.g. common + one area). */
export type KeysOf<C extends readonly Catalog[]> = C[number] extends infer X
  ? X extends Catalog
    ? keyof X["en"] & string
    : never
  : never;

/**
 * The text of one or more catalogs in one language, merged for a layout to hand to
 * the provider. A Bangla message left blank shows the English text, never a raw key.
 */
export function messagesFor(locale: Locale, ...catalogs: Catalog[]): Messages {
  const merged: Messages = {};
  for (const catalog of catalogs) {
    for (const [key, english] of Object.entries(catalog.en)) {
      const text = catalog[locale][key];
      merged[key] = text?.trim() ? text : english;
    }
  }
  return merged;
}

/** Fill `{name}` placeholders in a message: fill("Page {page}", { page: 2 }) → "Page 2". */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
