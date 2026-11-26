import { common } from "@/i18n/messages/common";
import { getTranslator } from "@/i18n/server";

/**
 * Shown while a page waits for its address. A route such as /orders/[id] doesn't know
 * its id at build time, so anything reading the URL needs a Suspense boundary above it
 * (Cache Components: the build fails without one).
 */
export async function PageLoading() {
  const { t } = await getTranslator(common);
  return (
    <p role="status" className="p-6 text-center text-ink-muted">
      {t("table.loading")}
    </p>
  );
}
