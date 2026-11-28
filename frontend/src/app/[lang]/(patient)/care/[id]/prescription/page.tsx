import { Suspense } from "react";

import { PrescriptionPage } from "@/areas/patient/care/PrescriptionPage";

type Params = PageProps<"/[lang]/care/[id]/prescription">["params"];

// The id is read under Suspense so a navigation here can show the loading state at once.
async function Prescription({ params }: { params: Params }) {
  const { id } = await params;
  return <PrescriptionPage caseId={id} />;
}

export default function PatientPrescriptionPage({
  params,
}: PageProps<"/[lang]/care/[id]/prescription">) {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-ink-muted">…</p>}>
      <Prescription params={params} />
    </Suspense>
  );
}
