import { DoctorReview } from "@/areas/admin/doctors/DoctorReview";

export default async function DoctorReviewPage({
  params,
}: PageProps<"/[lang]/admin/doctors/[id]">) {
  const { id } = await params;
  return <DoctorReview doctorId={id} />;
}
