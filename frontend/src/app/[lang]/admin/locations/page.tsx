import { LocationsTable } from "@/areas/admin/LocationsTable";
import { admin } from "@/i18n/messages/admin";
import { common } from "@/i18n/messages/common";
import { getTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getTranslator(common, admin);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("admin.locations.title")}
      </h1>
      <LocationsTable />
    </section>
  );
}
