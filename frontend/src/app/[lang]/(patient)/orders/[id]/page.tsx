import { Suspense } from "react";

import { OrderDetail } from "@/areas/patient/orders/OrderDetail";
import { common } from "@/i18n/messages/common";
import { getTranslator } from "@/i18n/server";

export default async function Page({ params }: PageProps<"/[lang]/orders/[id]">) {
  const [{ id }, { t }] = await Promise.all([params, getTranslator(common)]);
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-ink-muted">
          {t("table.loading")}
        </p>
      }
    >
      <OrderDetail orderId={id} />
    </Suspense>
  );
}
