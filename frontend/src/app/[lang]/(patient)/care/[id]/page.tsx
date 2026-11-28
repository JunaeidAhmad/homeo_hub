import { Suspense } from "react";

import { ConsultationDetail } from "@/areas/patient/care/ConsultationDetail";
import { PageLoading } from "@/components/shell/PageLoading";

type Params = PageProps<"/[lang]/care/[id]">["params"];

// The id is read under Suspense so a navigation here can show the loading state at once.
async function Detail({ params }: { params: Params }) {
  const { id } = await params;
  return <ConsultationDetail caseId={id} />;
}

export default function ConsultationDetailPage({ params }: PageProps<"/[lang]/care/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Detail params={params} />
    </Suspense>
  );
}
