import { Suspense } from "react";

import { PrescriptionPage } from "@/areas/patient/care/PrescriptionPage";

export default async function PatientPrescriptionPage({
  params,
}: PageProps<"/[lang]/care/[id]/prescription">) {
  const { id } = await params;
  return (
    <Suspense fallback={<p role="status" className="p-6 text-ink-muted">…</p>}>
      <PrescriptionPage caseId={id} />
    </Suspense>
  );
}
