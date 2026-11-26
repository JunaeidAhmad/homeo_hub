import type { components } from "@/api/schema";
import type { PatientMessages } from "@/i18n/messages/patient";

import { RemedyPurchase } from "./RemedyPurchase";

type Remedy = components["schemas"]["RemedyDetail"];

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex max-w-[640px] flex-col gap-1.5">
      <h3 className="text-[17px] font-bold text-primary-deep">{title}</h3>
      <p className="text-base leading-relaxed whitespace-pre-line text-ink-soft">{text}</p>
    </div>
  );
}

function Advice({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 pt-4">
      <h3 className={`text-[17px] font-bold ${tone}`}>{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-base leading-normal text-ink-soft">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** The remedy page: picture or vial, name, pickers, when to use, description, do's and don'ts. */
export function RemedyView({
  remedy,
  illnessSlug,
  t,
}: {
  remedy: Remedy;
  illnessSlug?: string;
  t: (key: keyof PatientMessages) => string;
}) {
  return (
    <RemedyPurchase remedy={remedy} illnessSlug={illnessSlug}>
      <section
        aria-labelledby="about-remedy"
        className="flex flex-col gap-5 rounded-panel border border-line bg-surface px-4 py-5 desktop:p-9"
      >
        <h2 id="about-remedy" className="font-display text-[26px] font-normal">
          {t("patient.remedy.about")}
        </h2>
        <Section title={t("patient.remedy.whenToUse")} text={remedy.indication} />
        <Section title={t("patient.remedy.description")} text={remedy.description} />
        <div className="grid gap-x-5 border-t border-line desktop:grid-cols-2">
          <Advice
            title={t("patient.remedy.do")}
            items={remedy.advice_do}
            tone="text-primary-deep"
          />
          <Advice title={t("patient.remedy.dont")} items={remedy.advice_dont} tone="text-danger" />
        </div>
      </section>
    </RemedyPurchase>
  );
}
