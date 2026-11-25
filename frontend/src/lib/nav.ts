/**
 * Whether `href` is the page being viewed or a section containing it.
 * "/" matches only itself; "/care" matches "/care" and "/care/42" but not "/care-guide".
 */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Of several nav items, the one that is current: the most specific href that contains the page. */
export function currentHref(
  pathname: string,
  hrefs: readonly string[],
): string | undefined {
  return hrefs
    .filter((href) => isCurrentPath(pathname, href))
    .sort((a, b) => b.length - a.length)[0];
}
