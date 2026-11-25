import { AccountPanel } from "@/areas/patient/auth/AccountPanel";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getTranslator(common, patient);
  return (
    <section className="flex flex-col gap-6 desktop:max-w-xl">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("patient.profile.title")}
      </h1>
      <AccountPanel />
    </section>
  );
}
