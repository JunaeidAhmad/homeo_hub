import { PrescriptionPage } from "@/areas/patient/care/PrescriptionPage";

export default async function PatientPrescriptionPage({
  params,
}: PageProps<"/[lang]/care/[id]/prescription">) {
  const { id } = await params;
  return <PrescriptionPage caseId={id} />;
}
