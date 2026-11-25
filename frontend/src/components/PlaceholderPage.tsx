import { common } from "@/i18n/messages/common";
import type { Catalog } from "@/i18n/catalog";
import { getTranslator } from "@/i18n/server";

/** Stand-in content for a page until its ticket is built. */
export async function PlaceholderPage<C extends Catalog>({
  area,
  titleKey,
}: {
  area: C;
  titleKey: keyof C["en"] & string;
}) {
  const { t } = await getTranslator(common, area as Catalog);
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t(titleKey)}
      </h1>
      <p className="text-base text-ink-muted">{t("placeholder.comingSoon")}</p>
    </section>
  );
}
