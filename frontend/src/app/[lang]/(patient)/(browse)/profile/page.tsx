import { AreaField } from "@/areas/patient/AreaField";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { patient } from "@/i18n/messages/patient";

export default function Page() {
  return (
    <div className="flex flex-col gap-8 desktop:max-w-xl">
      <PlaceholderPage area={patient} titleKey="patient.profile.title" />
      <AreaField />
    </div>
  );
}
