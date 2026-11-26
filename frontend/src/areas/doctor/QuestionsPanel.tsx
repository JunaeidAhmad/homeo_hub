"use client";

import { useEffect, useRef, useState } from "react";

import type { components } from "@/api/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert, TextAreaField, TextField } from "@/components/form/fields";
import { AnswerView } from "@/components/questions/AnswerView";
import { QuestionInput } from "@/components/questions/QuestionInput";
import type {
  DraftAnswerValue,
  QuestionData,
  QuestionSetData,
  QuestionType,
} from "@/components/questions/types";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { useDoctorSession } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

type CaseStatus = components["schemas"]["ConsultationStatusEnum"];
type CategoryTag = components["schemas"]["ConsultationCategory"];
type SuggestedTemplate = components["schemas"]["DoctorQuestionTemplate"];

const QUESTION_TYPES: readonly QuestionType[] = [
  "TEXT",
  "LONG_TEXT",
  "YES_NO",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "NUMBER",
  "SCALE",
  "PHOTO",
];

type QuestionDraftItem = {
  id: string;
  question_type: QuestionType;
  prompt: string;
  help_text: string;
  required: boolean;
  optionsText: string;
  scale_min: number;
  scale_max: number;
  template_id?: string | null;
};

type ComposerDraft = {
  title: string;
  note: string;
  items: QuestionDraftItem[];
};

const NEW_ITEM = (idx: number): QuestionDraftItem => ({
  id: `draft-${idx}-${Date.now()}`,
  question_type: "TEXT",
  prompt: "",
  help_text: "",
  required: true,
  optionsText: "",
  scale_min: 1,
  scale_max: 5,
  template_id: null,
});

const EMPTY_DRAFT = (): ComposerDraft => ({
  title: "",
  note: "",
  items: [NEW_ITEM(1)],
});

function readStoredDraft(storageKey: string): ComposerDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY_DRAFT();
    const parsed = JSON.parse(raw) as ComposerDraft;
    if (Array.isArray(parsed?.items) && parsed.items.length > 0) return parsed;
  } catch {
    // Ignore malformed draft.
  }
  return EMPTY_DRAFT();
}

function TemplateLibraryBody({
  templates,
  categories,
  query,
  onQueryChange,
  onAdd,
  t,
}: {
  templates: SuggestedTemplate[];
  categories: CategoryTag[];
  query: string;
  onQueryChange: (next: string) => void;
  onAdd: (tpl: SuggestedTemplate) => void;
  t: (key: keyof DoctorMessages) => string;
}) {
  const matching = templates.filter((item) => item.matches);
  const others = templates.filter((item) => !item.matches);
  const tagNames = categories.map((cat) => cat.name).join(", ");

  function renderRow(tpl: SuggestedTemplate) {
    return (
      <li
        key={tpl.id}
        className="flex items-start justify-between gap-2 rounded-control border border-line bg-surface p-2.5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{tpl.text}</p>
          <p className="text-xs text-ink-muted">{t(`doctor.q.type.${tpl.question_type}`)}</p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(tpl)}
          className="min-h-9 shrink-0 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-primary"
        >
          {t("doctor.q.addTemplate")}
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("doctor.q.searchTemplates")}
        aria-label={t("doctor.q.searchTemplates")}
        className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink"
      />

      {templates.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("doctor.q.noTemplates")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {matching.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-deep">
                  {t("doctor.q.matchesCase")}
                </h4>
                {tagNames && <span className="text-xs text-ink-muted">{tagNames}</span>}
              </div>
              <ul className="flex flex-col gap-2">{matching.map(renderRow)}</ul>
            </div>
          )}

          {others.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t("doctor.q.otherQuestions")}
              </h4>
              <ul className="flex flex-col gap-2">{others.map(renderRow)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionsPanel({
  caseId,
  caseStatus,
  categories,
  questionSets,
  onSent,
}: {
  caseId: string;
  caseStatus: CaseStatus;
  categories: CategoryTag[];
  questionSets: QuestionSetData[];
  onSent: (created: QuestionSetData) => void;
}) {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api } = useDoctorSession();
  const { pending, problems, submit } = useDoctorSubmit();
  const storageKey = `hh-qdraft-${caseId}`;

  const [draft, setDraft] = useState<ComposerDraft>(() => readStoredDraft(storageKey));
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, DraftAnswerValue>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [templates, setTemplates] = useState<SuggestedTemplate[]>([]);
  const [templateQuery, setTemplateQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);

  const canCompose =
    caseStatus === "IN_REVIEW" ||
    caseStatus === "AWAITING_PATIENT" ||
    caseStatus === "RESPONDED" ||
    caseStatus === "ASSIGNED";

  useEffect(() => {
    if (!canCompose) return;
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor/consultations/{id}/question-templates/", {
        params: {
          path: { id: caseId },
          query: { q: templateQuery.trim() || undefined },
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setTemplates(data);
      })
      .catch(() => {
        // Non-fatal; doctor can still write custom questions.
      });
    return () => controller.abort();
  }, [api, caseId, canCompose, templateQuery]);

  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (sheetOpen && !dialog.open) {
      dialog.showModal();
    } else if (!sheetOpen && dialog.open) {
      dialog.close();
    }
  }, [sheetOpen]);

  function updateDraft(next: ComposerDraft) {
    setDraft(next);
    setValidationError(null);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors.
    }
  }

  function updateItem(id: string, patch: Partial<QuestionDraftItem>) {
    updateDraft({
      ...draft,
      items: draft.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function addFromTemplate(tpl: SuggestedTemplate) {
    const nextItem: QuestionDraftItem = {
      id: `draft-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question_type: tpl.question_type,
      prompt: tpl.text,
      help_text: "",
      required: tpl.required,
      optionsText: tpl.options.join("\n"),
      scale_min: 1,
      scale_max: 5,
      template_id: tpl.id,
    };
    const isBlankDefault =
      draft.items.length === 1 &&
      draft.items[0].question_type === "TEXT" &&
      !draft.items[0].prompt.trim() &&
      !draft.items[0].help_text.trim() &&
      !draft.items[0].template_id;
    updateDraft({
      ...draft,
      items: isBlankDefault ? [nextItem] : [...draft.items, nextItem],
    });
    setPreview(false);
    setSheetOpen(false);
  }

  function validateAndOpenConfirm() {
    if (draft.items.length === 0) {
      setValidationError(t("doctor.q.needOneQuestion"));
      return;
    }
    for (const item of draft.items) {
      if (!item.prompt.trim()) {
        setValidationError(t("doctor.q.needPrompt"));
        return;
      }
      if (item.question_type === "SINGLE_CHOICE" || item.question_type === "MULTI_CHOICE") {
        const opts = item.optionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (new Set(opts).size < 2) {
          setValidationError(t("doctor.q.needOptions"));
          return;
        }
      }
    }
    setValidationError(null);
    setConfirmOpen(true);
  }

  function sendQuestions() {
    const payload = {
      title: draft.title.trim(),
      note: draft.note.trim(),
      questions: draft.items.map((item) => ({
        question_type: item.question_type,
        prompt: item.prompt.trim(),
        help_text: item.help_text.trim(),
        required: item.required,
        options:
          item.question_type === "SINGLE_CHOICE" || item.question_type === "MULTI_CHOICE"
            ? item.optionsText
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        scale_min: item.scale_min,
        scale_max: item.scale_max,
        template_id: item.template_id ?? null,
      })),
    };

    void submit(
      () =>
        api.POST("/api/v1/doctor/consultations/{id}/question-sets/", {
          params: { path: { id: caseId } },
          body: payload,
        }),
      (created) => {
        setConfirmOpen(false);
        setPreview(false);
        setPreviewAnswers({});
        const fresh = EMPTY_DRAFT();
        setDraft(fresh);
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Ignore.
        }
        onSent(created);
      },
    );
  }

  const nf = numberFormat(locale);
  const answerLabels = {
    yes: t("doctor.q.yes"),
    no: t("doctor.q.no"),
    viewPhoto: t("doctor.q.viewPhoto"),
    skipped: t("doctor.q.noAnswer"),
  };
  const previewLabels = {
    yes: t("doctor.q.yes"),
    no: t("doctor.q.no"),
    required: t("doctor.q.requiredLabel"),
    photoUpload: t("doctor.q.type.PHOTO"),
    photoSelected: "{name}",
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Sent rounds */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-ink">{t("doctor.q.roundsHeading")}</h3>
        {questionSets.length === 0 ? (
          <p className="rounded-panel border border-line bg-surface p-4 text-sm text-ink-muted">
            {t("doctor.q.noRounds")}
          </p>
        ) : (
          questionSets.map((qset) => (
            <div
              key={qset.id}
              className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {fill(t("doctor.q.roundTitle"), { round: nf.format(qset.round_number) })}
                  {qset.title ? ` · ${qset.title}` : ""}
                </p>
                <span
                  className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${
                    qset.answered_at
                      ? "bg-primary/15 text-primary-deep"
                      : "bg-amber-wash text-ink"
                  }`}
                >
                  {qset.answered_at
                    ? t("doctor.q.answeredBadge")
                    : t("doctor.q.waitingBadge")}
                </span>
              </div>
              {qset.note && <p className="text-sm text-ink-soft">{qset.note}</p>}
              <ol className="flex flex-col divide-y divide-line">
                {qset.questions.map((question) => (
                  <li key={question.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-ink">{question.prompt}</p>
                    <AnswerView question={question} labels={answerLabels} />
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>

      {/* Composer + Suggested questions */}
      {canCompose && (
        <div className="grid gap-4 desktop:grid-cols-[1.25fr_0.75fr] desktop:items-start">
          <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-ink">{t("doctor.q.composerTitle")}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="min-h-9 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-ink desktop:hidden"
                >
                  {t("doctor.q.addFromLibrary")}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview((now) => !now)}
                  className="min-h-9 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-primary"
                >
                  {preview ? t("doctor.q.editBtn") : t("doctor.q.previewBtn")}
                </button>
              </div>
            </div>

            {validationError && <FormAlert>{validationError}</FormAlert>}
            {problems.form && <FormAlert>{problems.form}</FormAlert>}

            {preview ? (
              <div className="flex flex-col gap-4 rounded-control border border-line bg-mist/40 p-3">
                {draft.title && <p className="font-semibold text-ink">{draft.title}</p>}
                {draft.note && <p className="text-sm text-ink-soft">{draft.note}</p>}
                {draft.items.map((item, idx) => {
                  const asQuestion: QuestionData = {
                    id: item.id,
                    sort_order: idx + 1,
                    question_type: item.question_type,
                    prompt:
                      item.prompt ||
                      fill(t("doctor.q.promptLabel"), { number: nf.format(idx + 1) }),
                    help_text: item.help_text,
                    required: item.required,
                    options: item.optionsText
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    scale_min: item.scale_min,
                    scale_max: item.scale_max,
                    answer: null,
                  };
                  return (
                    <QuestionInput
                      key={item.id}
                      question={asQuestion}
                      value={previewAnswers[item.id] ?? null}
                      onChange={(next) =>
                        setPreviewAnswers((now) => ({ ...now, [item.id]: next }))
                      }
                      labels={previewLabels}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <TextField
                  label={t("doctor.q.titleLabel")}
                  value={draft.title}
                  onChange={(event) => updateDraft({ ...draft, title: event.target.value })}
                  maxLength={160}
                />
                <TextAreaField
                  label={t("doctor.q.noteLabel")}
                  value={draft.note}
                  onChange={(event) => updateDraft({ ...draft, note: event.target.value })}
                  maxLength={1000}
                />

                {draft.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-control border border-line bg-mist/30 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {fill(t("doctor.q.promptLabel"), { number: nf.format(idx + 1) })}
                        </span>
                        {item.template_id && (
                          <span className="rounded-control bg-mist px-2 py-0.5 text-xs text-ink-muted">
                            {t("doctor.q.fromLibrary")}
                          </span>
                        )}
                      </div>
                      {draft.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft({
                              ...draft,
                              items: draft.items.filter((row) => row.id !== item.id),
                            })
                          }
                          className="text-xs font-semibold text-danger underline"
                        >
                          {t("doctor.q.removeQuestion")}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`qtype-${item.id}`}
                        className="text-xs font-semibold text-ink-muted"
                      >
                        {t("doctor.q.typeLabel")}
                      </label>
                      <select
                        id={`qtype-${item.id}`}
                        value={item.question_type}
                        onChange={(event) =>
                          updateItem(item.id, {
                            question_type: event.target.value as QuestionType,
                          })
                        }
                        className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
                      >
                        {QUESTION_TYPES.map((qtype) => (
                          <option key={qtype} value={qtype}>
                            {t(`doctor.q.type.${qtype}`)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <TextField
                      label={fill(t("doctor.q.promptLabel"), { number: nf.format(idx + 1) })}
                      value={item.prompt}
                      onChange={(event) => updateItem(item.id, { prompt: event.target.value })}
                      maxLength={1000}
                    />
                    <TextField
                      label={t("doctor.q.helpLabel")}
                      value={item.help_text}
                      onChange={(event) => updateItem(item.id, { help_text: event.target.value })}
                      maxLength={300}
                    />

                    {(item.question_type === "SINGLE_CHOICE" ||
                      item.question_type === "MULTI_CHOICE") && (
                      <TextAreaField
                        label={t("doctor.q.optionsLabel")}
                        value={item.optionsText}
                        onChange={(event) =>
                          updateItem(item.id, { optionsText: event.target.value })
                        }
                      />
                    )}

                    {item.question_type === "SCALE" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`smin-${item.id}`} className="text-xs font-semibold">
                            {t("doctor.q.scaleMin")}
                          </label>
                          <input
                            id={`smin-${item.id}`}
                            type="number"
                            min={1}
                            max={9}
                            value={item.scale_min}
                            onChange={(event) =>
                              updateItem(item.id, { scale_min: Number(event.target.value) || 1 })
                            }
                            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`smax-${item.id}`} className="text-xs font-semibold">
                            {t("doctor.q.scaleMax")}
                          </label>
                          <input
                            id={`smax-${item.id}`}
                            type="number"
                            min={2}
                            max={10}
                            value={item.scale_max}
                            onChange={(event) =>
                              updateItem(item.id, { scale_max: Number(event.target.value) || 5 })
                            }
                            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-sm font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(event) => updateItem(item.id, { required: event.target.checked })}
                        className="size-4 accent-primary"
                      />
                      <span>{t("doctor.q.requiredLabel")}</span>
                    </label>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    updateDraft({
                      ...draft,
                      items: [...draft.items, NEW_ITEM(draft.items.length + 1)],
                    })
                  }
                  className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
                >
                  + {t("doctor.q.addQuestion")}
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={pending}
              onClick={validateAndOpenConfirm}
              className="min-h-12 rounded-control bg-primary px-5 text-base font-bold text-surface disabled:opacity-60"
            >
              {t("doctor.q.sendBtn")}
            </button>
          </section>

          {/* Desktop side panel: Suggested questions */}
          <aside className="hidden flex-col gap-3 rounded-panel border border-line bg-mist p-4 desktop:flex">
            <h3 className="text-base font-semibold text-ink">{t("doctor.q.suggestedHeading")}</h3>
            <TemplateLibraryBody
              templates={templates}
              categories={categories}
              query={templateQuery}
              onQueryChange={setTemplateQuery}
              onAdd={addFromTemplate}
              t={t}
            />
          </aside>
        </div>
      )}

      {/* Mobile bottom sheet: Suggested questions */}
      <dialog
        ref={sheetRef}
        onCancel={(event) => {
          event.preventDefault();
          setSheetOpen(false);
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-panel border-t border-line bg-surface p-4 text-ink backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-ink">{t("doctor.q.suggestedHeading")}</h3>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold"
            >
              {t("doctor.q.closeLibrary")}
            </button>
          </div>
          <TemplateLibraryBody
            templates={templates}
            categories={categories}
            query={templateQuery}
            onQueryChange={setTemplateQuery}
            onAdd={addFromTemplate}
            t={t}
          />
        </div>
      </dialog>

      <ConfirmDialog
        open={confirmOpen}
        title={fill(t("doctor.q.confirmSendTitle"), {
          count: nf.format(draft.items.length),
        })}
        body={t("doctor.q.confirmSendBody")}
        confirmLabel={t("doctor.q.confirmSendBtn")}
        cancelLabel={t("doctor.q.cancel")}
        pending={pending}
        error={problems.form}
        onConfirm={sendQuestions}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
