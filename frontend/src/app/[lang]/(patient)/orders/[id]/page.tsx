import { Suspense } from "react";

import { OrderDetail } from "@/areas/patient/orders/OrderDetail";
import { common } from "@/i18n/messages/common";
import { getTranslator } from "@/i18n/server";

type Params = PageProps<"/[lang]/orders/[id]">["params"];

// The id is read under Suspense so a navigation here can show the loading state at once.
async function Detail({ params }: { params: Params }) {
  const { id } = await params;
  return <OrderDetail orderId={id} />;
}

export default async function Page({ params }: PageProps<"/[lang]/orders/[id]">) {
  const { t } = await getTranslator(common);
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-ink-muted">
          {t("table.loading")}
        </p>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}
