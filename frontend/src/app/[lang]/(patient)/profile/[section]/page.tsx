import { Suspense } from "react";

import { ProfileSectionForm } from "@/areas/patient/profile/ProfileSectionForm";
import { PageLoading } from "@/components/shell/PageLoading";

type Params = PageProps<"/[lang]/profile/[section]">["params"];

// The section is read under Suspense so a navigation here can show the loading state at once.
async function Section({ params }: { params: Params }) {
  const { section } = await params;
  return <ProfileSectionForm section={section} />;
}

export default function ProfileSectionPage({ params }: PageProps<"/[lang]/profile/[section]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Section params={params} />
    </Suspense>
  );
}
