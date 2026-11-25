import { TaskScreen } from "@/areas/patient/TaskScreen";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";

/** Task-page shell example: back arrow, title and a pinned action. Real cart arrives in ticket 09. */
export default async function CartPage() {
  const { t } = await getTranslator(common, patient);
  return (
    <TaskScreen
      title={t("patient.cart.title")}
      backHref="/"
      action={
        <button
          type="button"
          disabled
          className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary text-[17px] font-bold text-surface disabled:opacity-50"
        >
          {t("patient.cart.checkout")}
        </button>
      }
    >
      <PlaceholderPage area={patient} titleKey="patient.cart.title" />
    </TaskScreen>
  );
}
