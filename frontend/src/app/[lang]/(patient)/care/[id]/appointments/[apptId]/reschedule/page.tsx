import { RescheduleRequestPage } from "@/areas/patient/care/RescheduleRequestPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; apptId: string }>;
}) {
  const { id, apptId } = await params;
  return <RescheduleRequestPage caseId={id} apptId={apptId} />;
}
