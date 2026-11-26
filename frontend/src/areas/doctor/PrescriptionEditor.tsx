"use client";

import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RemedySearch, type RemedyOption } from "@/components/RemedySearch";
import {
  FormAlert,
  SegmentedChoice,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import { PrescriptionSheet } from "@/components/prescription/PrescriptionSheet";
import type {
  AdviceKind,
  Potency,
  PrescriptionSheetData,
  PrescriptionSheetLabels,
  RemedyForm,
} from "@/components/prescription/types";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { useDoctorSession } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

type CaseStatus = components["schemas"]["ConsultationStatusEnum"];
type WorkspaceData = components["schemas"]["DoctorPrescriptionWorkspace"];
type DoctorRxDetail = components["schemas"]["DoctorPrescriptionDetail"];

const POTENCIES: Potency[] = ["6C", "30C", "200C", "1M"];
const FORMS: RemedyForm[] = ["PILL", "LIQUID"];
const DOSAGE_CHIPS = ["4 pills", "5 drops", "2 globules"];
const FREQUENCY_CHIPS = ["3 times a day", "Twice a day", "Once daily"];
const DURATION_CHIPS = ["7 days", "14 days", "30 days"];

type DraftLine = {
  id: string;
  remedy_id: string | null;
  remedy_slug: string | null;
  remedy_name: string;
  remedy_name_bn: string;
  potency: Potency;
  form: RemedyForm;
  dosage: string;
  frequency: string;
  duration: string;
};

type DraftAdvice = {
  id: string;
  kind: AdviceKind;
  text: string;
};

type RxDraft = {
  items: DraftLine[];
  advice: DraftAdvice[];
  report_after_date: string;
  doctor_notes: string;
};

function newLine(seed = 1): DraftLine {
  return {
    id: `rx-${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    remedy_id: null,
    remedy_slug: null,
    remedy_name: "",
    remedy_name_bn: "",
    potency: "30C",
    form: "PILL",
    dosage: "",
    frequency: "",
    duration: "",
  };
}

function emptyDraft(): RxDraft {
  return {
    items: [newLine(1)],
    advice: [],
    report_after_date: "",
    doctor_notes: "",
  };
}

function draftFromIssued(rx: DoctorRxDetail): RxDraft {
  return {
    items: rx.items.map((item, idx) => ({
      id: item.id || `corr-${idx}-${Date.now()}`,
      remedy_id: item.remedy_id,
      remedy_slug: null,
      remedy_name: item.remedy_name,
      remedy_name_bn: item.remedy_name_bn,
      potency: item.potency,
      form: item.form,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
    })),
    advice: rx.advice.map((entry, idx) => ({
      id: entry.id || `adv-${idx}-${Date.now()}`,
      kind: entry.kind,
      text: entry.text,
    })),
    report_after_date: rx.report_after_date ?? "",
    doctor_notes: rx.doctor_notes ?? "",
  };
}

function readStoredDraft(storageKey: string): RxDraft {
  if (typeof window === "undefined") return emptyDraft();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as RxDraft;
    if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
      return {
        items: parsed.items,
        advice: Array.isArray(parsed.advice) ? parsed.advice : [],
        report_after_date: parsed.report_after_date ?? "",
        doctor_notes: parsed.doctor_notes ?? "",
      };
    }
  } catch {
    // Ignore malformed draft.
  }
  return emptyDraft();
}

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

export function PrescriptionEditor({
  caseId,
  caseStatus,
  onStatusChange,
}: {
  caseId: string;
  caseStatus: CaseStatus;
  onStatusChange: (nextStatus: CaseStatus) => void;
}) {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api } = useDoctorSession();
  const { pending, problems, submit } = useDoctorSubmit();
  const storageKey = `hh-rxdraft-${caseId}`;
  const nf = numberFormat(locale);

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState<RxDraft>(() => readStoredDraft(storageKey));
  const [composingCorrection, setComposingCorrection] = useState(false);
  const [preview, setPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor/consultations/{id}/prescription/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!data) {
          setLoadStatus("error");
          return;
        }
        setWorkspace(data);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, caseId]);

  const sheetLabels: PrescriptionSheetLabels = {
    formLabel: {
      PILL: t("doctor.rx.form.PILL"),
      LIQUID: t("doctor.rx.form.LIQUID"),
    },
    notSoldHere: t("doctor.rx.notSoldHere"),
    currentlyUnavailable: t("doctor.rx.currentlyUnavailable"),
    doTitle: t("doctor.rx.doTitle"),
    dontTitle: t("doctor.rx.dontTitle"),
    reportAfter: (date) => fill(t("doctor.rx.reportAfterSheet"), { date }),
    versionLabel: (version) =>
      fill(t("doctor.rx.versionCurrent"), {
        version: nf.format(version),
        date: "",
      }).replace(/,\s*$/, ""),
    regNoPrefix: t("doctor.rx.regNoPrefix"),
    signatureLabel: t("doctor.rx.signatureLabel"),
  };

  function persistDraft(next: RxDraft) {
    setDraft(next);
    setValidationError(null);
    setStatusNotice(null);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors.
    }
  }

  function updateLine(id: string, patch: Partial<DraftLine>) {
    persistDraft({
      ...draft,
      items: draft.items.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  }

  async function pickCatalogRemedy(lineId: string, remedy: RemedyOption) {
    setDraft((current) => {
      const next: RxDraft = {
        ...current,
        items: current.items.map((line) =>
          line.id === lineId
            ? {
                ...line,
                remedy_id: remedy.id,
                remedy_slug: remedy.slug,
                remedy_name: remedy.name,
                remedy_name_bn: remedy.name_bn ?? "",
              }
            : line,
        ),
      };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
    setValidationError(null);

    try {
      const { data } = await api.GET("/api/v1/remedies/{slug}/", {
        params: { path: { slug: remedy.slug } },
      });
      if (!data) return;
      setDraft((current) => {
        const existingKeys = new Set(
          current.advice.map((entry) => `${entry.kind}:${entry.text.trim().toLowerCase()}`),
        );
        const added: DraftAdvice[] = [];
        for (const text of data.advice_do ?? []) {
          const clean = text.trim();
          const key = `DO:${clean.toLowerCase()}`;
          if (clean && !existingKeys.has(key)) {
            existingKeys.add(key);
            added.push({
              id: `adv-do-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind: "DO",
              text: clean,
            });
          }
        }
        for (const text of data.advice_dont ?? []) {
          const clean = text.trim();
          const key = `DONT:${clean.toLowerCase()}`;
          if (clean && !existingKeys.has(key)) {
            existingKeys.add(key);
            added.push({
              id: `adv-dont-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind: "DONT",
              text: clean,
            });
          }
        }
        if (added.length === 0) return current;
        const next: RxDraft = { ...current, advice: [...current.advice, ...added] };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore.
        }
        return next;
      });
    } catch {
      // Advice pre-fill is optional; ignore lookup failures.
    }
  }

  function addAdviceRow(kind: AdviceKind) {
    persistDraft({
      ...draft,
      advice: [
        ...draft.advice,
        {
          id: `adv-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          text: "",
        },
      ],
    });
  }

  function validateAndConfirm() {
    if (draft.items.length === 0) {
      setValidationError(t("doctor.rx.needOneRemedy"));
      return;
    }
    for (let i = 0; i < draft.items.length; i += 1) {
      const line = draft.items[i];
      const num = nf.format(i + 1);
      if (!line.remedy_id && !line.remedy_name.trim()) {
        setValidationError(fill(t("doctor.rx.needRemedyName"), { number: num }));
        return;
      }
      if (!line.dosage.trim() || !line.frequency.trim() || !line.duration.trim()) {
        setValidationError(fill(t("doctor.rx.needDirections"), { number: num }));
        return;
      }
    }
    setValidationError(null);
    setConfirmOpen(true);
  }

  function submitPrescription() {
    const payload = {
      items: draft.items.map((line) => ({
        remedy_id: line.remedy_id,
        remedy_name: line.remedy_name.trim(),
        potency: line.potency,
        form: line.form,
        dosage: line.dosage.trim(),
        frequency: line.frequency.trim(),
        duration: line.duration.trim(),
      })),
      advice: draft.advice
        .map((entry) => ({ kind: entry.kind, text: entry.text.trim() }))
        .filter((entry) => entry.text !== ""),
      report_after_date: draft.report_after_date.trim() || null,
      doctor_notes: draft.doctor_notes.trim(),
    };

    void submit(
      () =>
        api.POST("/api/v1/doctor/consultations/{id}/prescription/", {
          params: { path: { id: caseId } },
          body: payload,
        }),
      (updated) => {
        setConfirmOpen(false);
        setComposingCorrection(false);
        setPreview(false);
        setWorkspace(updated);
        setStatusNotice(t("doctor.rx.issuedNotice"));
        onStatusChange(updated.consultation_status);
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Ignore.
        }
      },
    );
  }

  if (loadStatus === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("doctor.loading")}
      </p>
    );
  }

  if (loadStatus === "error" || !workspace) {
    return <FormAlert>{t("doctor.error.generic")}</FormAlert>;
  }

  const latest = workspace.latest;
  const canCorrect = caseStatus === "PRESCRIBED" || caseStatus === "COMPLETED";
  const canFirstIssue =
    caseStatus === "ASSIGNED" ||
    caseStatus === "IN_REVIEW" ||
    caseStatus === "AWAITING_PATIENT" ||
    caseStatus === "RESPONDED";

  const showEditor = latest ? composingCorrection : canFirstIssue;

  if (!showEditor && !latest) {
    return (
      <div className="rounded-panel border border-line bg-surface p-4 text-sm text-ink-soft">
        {t("doctor.rx.cannotIssueNow")}
      </div>
    );
  }

  if (latest && !composingCorrection) {
    const sheetData: PrescriptionSheetData = {
      doctor: workspace.doctor,
      version: latest.version,
      issued_at: latest.issued_at,
      report_after_date: latest.report_after_date,
      items: latest.items.map((item) => ({
        id: item.id,
        remedy_name: item.remedy_name,
        remedy_name_bn: item.remedy_name_bn,
        is_catalog: item.is_catalog,
        potency: item.potency,
        form: item.form,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
      })),
      advice: latest.advice,
    };

    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-semibold text-primary-deep empty:hidden">
          {statusNotice}
        </p>

        <PrescriptionSheet prescription={sheetData} labels={sheetLabels} locale={locale} />

        {latest.doctor_notes && (
          <section className="rounded-panel border border-line bg-mist/60 p-4">
            <h3 className="text-xs font-semibold text-ink-muted">{t("doctor.rx.doctorNotes")}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{latest.doctor_notes}</p>
            <p className="mt-1 text-xs text-ink-muted">{t("doctor.rx.doctorNotesHint")}</p>
          </section>
        )}

        {canCorrect && (
          <button
            type="button"
            onClick={() => {
              persistDraft(draftFromIssued(latest));
              setPreview(false);
              setComposingCorrection(true);
            }}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
          >
            {t("doctor.rx.correctBtn")}
          </button>
        )}

        {workspace.versions.length > 0 && (
          <section className="rounded-panel border border-line bg-surface p-4">
            <h3 className="pb-2 text-sm font-semibold text-ink">
              {t("doctor.rx.versionsHeading")}
            </h3>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {workspace.versions.map((ver) => (
                <li key={ver.id} className="py-2 first:pt-0 last:pb-0">
                  {ver.previous_version
                    ? fill(t("doctor.rx.versionReplaces"), {
                        version: nf.format(ver.version),
                        date: formatDate(locale, ver.issued_at),
                        previous: nf.format(ver.previous_version),
                      })
                    : fill(t("doctor.rx.versionCurrent"), {
                        version: nf.format(ver.version),
                        date: formatDate(locale, ver.issued_at),
                      })}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const doRows = draft.advice.filter((entry) => entry.kind === "DO");
  const dontRows = draft.advice.filter((entry) => entry.kind === "DONT");

  const previewData: PrescriptionSheetData = {
    doctor: workspace.doctor,
    version: latest ? latest.version + 1 : 1,
    issued_at: new Date().toISOString(),
    report_after_date: draft.report_after_date || null,
    items: draft.items.map((line) => ({
      id: line.id,
      remedy_name: line.remedy_name || "—",
      remedy_name_bn: line.remedy_name_bn,
      is_catalog: Boolean(line.remedy_id),
      potency: line.potency,
      form: line.form,
      dosage: line.dosage || "—",
      frequency: line.frequency || "—",
      duration: line.duration || "—",
    })),
    advice: draft.advice
      .filter((entry) => entry.text.trim() !== "")
      .map((entry) => ({ kind: entry.kind, text: entry.text.trim() })),
  };

  return (
    <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{t("doctor.rx.title")}</h3>
        <div className="flex items-center gap-2">
          {composingCorrection && (
            <button
              type="button"
              onClick={() => {
                setComposingCorrection(false);
                setPreview(false);
              }}
              className="min-h-9 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-ink-soft"
            >
              {t("doctor.rx.cancelCorrect")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreview((now) => !now)}
            className="min-h-9 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-primary"
          >
            {preview ? t("doctor.rx.edit") : t("doctor.rx.preview")}
          </button>
        </div>
      </div>

      {validationError && <FormAlert>{validationError}</FormAlert>}
      {problems.form && <FormAlert>{problems.form}</FormAlert>}

      {preview ? (
        <PrescriptionSheet prescription={previewData} labels={sheetLabels} locale={locale} />
      ) : (
        <div className="flex flex-col gap-4">
          {draft.items.map((line, idx) => (
            <div
              key={line.id}
              className="flex flex-col gap-3 rounded-control border border-line bg-mist/30 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {fill(t("doctor.rx.remedyLine"), { number: nf.format(idx + 1) })}
                </span>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        persistDraft({ ...draft, items: moveItem(draft.items, idx, idx - 1) })
                      }
                      className="text-ink-soft underline"
                    >
                      {t("doctor.rx.moveUp")}
                    </button>
                  )}
                  {idx < draft.items.length - 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        persistDraft({ ...draft, items: moveItem(draft.items, idx, idx + 1) })
                      }
                      className="text-ink-soft underline"
                    >
                      {t("doctor.rx.moveDown")}
                    </button>
                  )}
                  {draft.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        persistDraft({
                          ...draft,
                          items: draft.items.filter((row) => row.id !== line.id),
                        })
                      }
                      className="text-danger underline"
                    >
                      {t("doctor.rx.remove")}
                    </button>
                  )}
                </div>
              </div>

              {line.remedy_name ? (
                <div className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <p
                      className={
                        line.remedy_id
                          ? "font-display text-lg text-ink italic"
                          : "text-base font-medium text-ink"
                      }
                    >
                      {line.remedy_name}
                    </p>
                    {locale === "bn" && line.remedy_name_bn && (
                      <p lang="bn" className="text-xs text-ink-muted">
                        {line.remedy_name_bn}
                      </p>
                    )}
                    {!line.remedy_id && (
                      <p className="text-xs text-ink-muted">{t("doctor.rx.typedNote")}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateLine(line.id, {
                        remedy_id: null,
                        remedy_slug: null,
                        remedy_name: "",
                        remedy_name_bn: "",
                      })
                    }
                    className="text-xs font-semibold text-primary underline"
                  >
                    {t("doctor.rx.changeRemedy")}
                  </button>
                </div>
              ) : (
                <RemedySearch
                  label={t("doctor.rx.remedySearch")}
                  hint={t("doctor.rx.remedyHint")}
                  client={api}
                  onPick={(remedy) => void pickCatalogRemedy(line.id, remedy)}
                  onPickCustom={(name) =>
                    updateLine(line.id, {
                      remedy_id: null,
                      remedy_slug: null,
                      remedy_name: name,
                      remedy_name_bn: "",
                    })
                  }
                  customOptionLabel={(name) => fill(t("doctor.rx.useTyped"), { name })}
                />
              )}

              <div className="grid gap-3 desktop:grid-cols-[120px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`potency-${line.id}`} className="text-[15px] font-semibold">
                    {t("doctor.rx.potency")}
                  </label>
                  <select
                    id={`potency-${line.id}`}
                    value={line.potency}
                    onChange={(event) =>
                      updateLine(line.id, { potency: event.target.value as Potency })
                    }
                    className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-base font-semibold"
                  >
                    {POTENCIES.map((potency) => (
                      <option key={potency} value={potency}>
                        {potency}
                      </option>
                    ))}
                  </select>
                </div>

                <SegmentedChoice<RemedyForm>
                  legend={t("doctor.rx.form")}
                  name={`rx-form-${line.id}`}
                  value={line.form}
                  onChange={(form) => updateLine(line.id, { form })}
                  options={FORMS.map((form) => ({
                    value: form,
                    label: t(`doctor.rx.form.${form}`),
                  }))}
                />
              </div>

              <div>
                <TextField
                  label={t("doctor.rx.dosage")}
                  value={line.dosage}
                  onChange={(event) => updateLine(line.id, { dosage: event.target.value })}
                  maxLength={100}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DOSAGE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => updateLine(line.id, { dosage: chip })}
                      className="rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-mist"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <TextField
                  label={t("doctor.rx.frequency")}
                  value={line.frequency}
                  onChange={(event) => updateLine(line.id, { frequency: event.target.value })}
                  maxLength={100}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {FREQUENCY_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => updateLine(line.id, { frequency: chip })}
                      className="rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-mist"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <TextField
                  label={t("doctor.rx.duration")}
                  value={line.duration}
                  onChange={(event) => updateLine(line.id, { duration: event.target.value })}
                  maxLength={100}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DURATION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => updateLine(line.id, { duration: chip })}
                      className="rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-mist"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {draft.items.length < 15 && (
            <button
              type="button"
              onClick={() =>
                persistDraft({
                  ...draft,
                  items: [...draft.items, newLine(draft.items.length + 1)],
                })
              }
              className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
            >
              + {t("doctor.rx.addRemedy")}
            </button>
          )}

          {/* Do list */}
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h4 className="text-sm font-bold text-primary-deep">{t("doctor.rx.doTitle")}</h4>
            {doRows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.text}
                  placeholder={t("doctor.rx.advicePlaceholder")}
                  maxLength={300}
                  onChange={(event) =>
                    persistDraft({
                      ...draft,
                      advice: draft.advice.map((entry) =>
                        entry.id === row.id ? { ...entry, text: event.target.value } : entry,
                      ),
                    })
                  }
                  className="min-h-11 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    persistDraft({
                      ...draft,
                      advice: draft.advice.filter((entry) => entry.id !== row.id),
                    })
                  }
                  className="text-xs font-semibold text-danger underline"
                >
                  {t("doctor.rx.remove")}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addAdviceRow("DO")}
              className="self-start text-xs font-semibold text-primary underline"
            >
              + {t("doctor.rx.addDo")}
            </button>
          </div>

          {/* Don't list */}
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h4 className="text-sm font-bold text-danger">{t("doctor.rx.dontTitle")}</h4>
            {dontRows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.text}
                  placeholder={t("doctor.rx.advicePlaceholder")}
                  maxLength={300}
                  onChange={(event) =>
                    persistDraft({
                      ...draft,
                      advice: draft.advice.map((entry) =>
                        entry.id === row.id ? { ...entry, text: event.target.value } : entry,
                      ),
                    })
                  }
                  className="min-h-11 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    persistDraft({
                      ...draft,
                      advice: draft.advice.filter((entry) => entry.id !== row.id),
                    })
                  }
                  className="text-xs font-semibold text-danger underline"
                >
                  {t("doctor.rx.remove")}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addAdviceRow("DONT")}
              className="self-start text-xs font-semibold text-primary underline"
            >
              + {t("doctor.rx.addDont")}
            </button>
          </div>

          <TextField
            label={t("doctor.rx.reportAfter")}
            type="date"
            value={draft.report_after_date}
            onChange={(event) =>
              persistDraft({ ...draft, report_after_date: event.target.value })
            }
          />

          <TextAreaField
            label={t("doctor.rx.doctorNotes")}
            hint={t("doctor.rx.doctorNotesHint")}
            value={draft.doctor_notes}
            onChange={(event) => persistDraft({ ...draft, doctor_notes: event.target.value })}
            maxLength={5000}
          />
        </div>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={validateAndConfirm}
        className="min-h-12 rounded-control bg-primary px-5 text-base font-bold text-surface disabled:opacity-60"
      >
        {t("doctor.rx.issueBtn")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("doctor.rx.confirmTitle")}
        body={t("doctor.rx.confirmBody")}
        confirmLabel={t("doctor.rx.confirmBtn")}
        cancelLabel={t("doctor.rx.cancel")}
        pending={pending}
        error={problems.form}
        onConfirm={submitPrescription}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}
