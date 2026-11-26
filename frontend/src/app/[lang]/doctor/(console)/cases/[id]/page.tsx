import { CaseWorkspace } from "@/areas/doctor/CaseWorkspace";

export default async function DoctorCasePage({
  params,
}: PageProps<"/[lang]/doctor/cases/[id]">) {
  const { id } = await params;
  return <CaseWorkspace caseId={id} />;
}
