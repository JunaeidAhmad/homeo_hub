import { CaseDetail } from "@/areas/admin/cases/CaseDetail";

export default async function CaseDetailPage({
  params,
}: PageProps<"/[lang]/admin/cases/[id]">) {
  const { id } = await params;
  return <CaseDetail caseId={id} />;
}
