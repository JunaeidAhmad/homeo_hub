import { OrderList } from "@/areas/patient/orders/OrderList";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getTranslator(common, patient);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("patient.orders.title")}
      </h1>
      <OrderList />
    </section>
  );
}
