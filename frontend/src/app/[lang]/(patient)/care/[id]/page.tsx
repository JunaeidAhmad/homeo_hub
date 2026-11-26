import { ConsultationDetail } from "@/areas/patient/care/ConsultationDetail";

export default async function ConsultationDetailPage({
  params,
}: PageProps<"/[lang]/care/[id]">) {
  const { id } = await params;
  return <ConsultationDetail caseId={id} />;
}
