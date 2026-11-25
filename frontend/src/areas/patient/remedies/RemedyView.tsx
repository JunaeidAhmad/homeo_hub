import Image from "next/image";

import type { components } from "@/api/schema";
import { RemedyVial } from "@/components/RemedyVial";
import type { PatientMessages } from "@/i18n/messages/patient";

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

/** The remedy page: picture or vial, name, when to use, description, do's and don'ts. */
export function RemedyView({
  remedy,
  t,
}: {
  remedy: Remedy;
  t: (key: keyof PatientMessages) => string;
}) {
  return (
    <article className="flex flex-col gap-6">
      <div className="-mx-4 -mt-6 flex flex-col bg-surface desktop:mx-0 desktop:mt-0 desktop:flex-row desktop:overflow-hidden desktop:rounded-panel desktop:border desktop:border-line">
        <div className="flex items-center justify-center bg-mist px-4 py-7 desktop:flex-1">
          {remedy.picture_url ? (
            <Image
              unoptimized
              src={remedy.picture_url}
              alt={remedy.name}
              width={600}
              height={600}
              className="h-auto max-h-96 w-full object-contain"
            />
          ) : (
            <RemedyVial name={remedy.name} nameBn={remedy.name_bn} />
          )}
        </div>
        <div className="flex flex-col gap-4 px-4 py-6 desktop:flex-1 desktop:p-9">
          <div className="flex flex-col gap-1">
            <h1
              lang="la"
              className="font-display text-[38px] leading-tight font-normal italic desktop:text-[52px]"
            >
              {remedy.name}
            </h1>
            {remedy.name_bn && (
              <span lang="bn" className="font-display text-[19px] text-ink-muted">
                {remedy.name_bn}
              </span>
            )}
          </div>
          <p className="text-base leading-relaxed whitespace-pre-line text-ink-soft">
            {remedy.indication}
          </p>
        </div>
      </div>

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
    </article>
  );
}
