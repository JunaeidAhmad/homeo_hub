import { Suspense } from "react";

import { PaymentResult } from "@/areas/patient/orders/PaymentResult";
import { common } from "@/i18n/messages/common";
import { getTranslator } from "@/i18n/server";

export default async function PaymentResultPage() {
  const { t } = await getTranslator(common);
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-ink-muted">
          {t("table.loading")}
        </p>
      }
    >
      <PaymentResult />
    </Suspense>
  );
}
