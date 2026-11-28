import { Suspense } from "react";

import { RescheduleRequestPage } from "@/areas/patient/care/RescheduleRequestPage";
import { PageLoading } from "@/components/shell/PageLoading";

type Params = PageProps<"/[lang]/care/[id]/appointments/[apptId]/reschedule">["params"];

// The ids are read under Suspense so a navigation here can show the loading state at once.
async function Reschedule({ params }: { params: Params }) {
  const { id, apptId } = await params;
  return <RescheduleRequestPage caseId={id} apptId={apptId} />;
}

export default function Page({
  params,
}: PageProps<"/[lang]/care/[id]/appointments/[apptId]/reschedule">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Reschedule params={params} />
    </Suspense>
  );
}
