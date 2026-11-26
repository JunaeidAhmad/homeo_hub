import { ProfileSectionForm } from "@/areas/patient/profile/ProfileSectionForm";

export default async function ProfileSectionPage({
  params,
}: PageProps<"/[lang]/profile/[section]">) {
  const { section } = await params;
  return <ProfileSectionForm section={section} />;
}
