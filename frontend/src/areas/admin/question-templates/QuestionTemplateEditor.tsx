"use client";

import { useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import {
  FieldError,
  FormAlert,
  SegmentedChoice,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import { QuestionInput } from "@/components/questions/QuestionInput";
import type { DraftAnswerValue, QuestionData, QuestionType } from "@/components/questions/types";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

export type AdminQuestionTemplate = components["schemas"]["AdminQuestionTemplate"];
type CategoryOption = components["schemas"]["AdminIllnessCategory"];
type TemplateStatus = components["schemas"]["QuestionTemplateStatusEnum"];

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

type OptionPair = { id: string; en: string; bn: string };

function initialOptionPairs(template?: AdminQuestionTemplate): OptionPair[] {
  if (template && template.options_en.length > 0) {
    return template.options_en.map((en, idx) => ({
      id: `opt-${idx}-${en}`,
      en,
      bn: template.options_bn[idx] ?? "",
    }));
  }
  return [
    { id: "opt-0", en: "", bn: "" },
    { id: "opt-1", en: "", bn: "" },
  ];
}

export function QuestionTemplateEditor({
  template,
  categories,
  onCancel,
  onSaved,
}: {
  template?: AdminQuestionTemplate;
  categories: CategoryOption[];
  onCancel: () => void;
  onSaved: (saved: AdminQuestionTemplate, created: boolean) => void;
}) {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();

  const [textEn, setTextEn] = useState(template?.text_en ?? "");
  const [textBn, setTextBn] = useState(template?.text_bn ?? "");
  const [questionType, setQuestionType] = useState<QuestionType>(
    template?.question_type ?? "TEXT",
  );
  const [options, setOptions] = useState<OptionPair[]>(() => initialOptionPairs(template));
  const [required, setRequired] = useState(template?.required ?? true);
  const [status, setStatus] = useState<TemplateStatus>(template?.status ?? "ACTIVE");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    () => template?.categories.map((c) => c.id) ?? [],
  );
  const [previewAnswer, setPreviewAnswer] = useState<DraftAnswerValue>(null);

  const isChoice = questionType === "SINGLE_CHOICE" || questionType === "MULTI_CHOICE";

  function toggleCategory(id: string) {
    setSelectedCategories((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function addOptionRow() {
    setOptions((current) => [...current, { id: `opt-${Date.now()}`, en: "", bn: "" }]);
  }

  function updateOption(id: string, patch: Partial<OptionPair>) {
    setOptions((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeOption(id: string) {
    setOptions((current) =>
      current.length > 2 ? current.filter((row) => row.id !== id) : current,
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!textEn.trim()) fields.text_en = t("admin.error.required");

    const cleanedPairs = isChoice
      ? options.filter((row) => row.en.trim().length > 0)
      : [];
    if (isChoice && new Set(cleanedPairs.map((r) => r.en.trim())).size < 2) {
      fields.options_en = t("admin.qt.needOptions");
    }

    if (Object.keys(fields).length > 0) {
      setProblems({ fields });
      return;
    }

    const body = {
      text_en: textEn.trim(),
      text_bn: textBn.trim(),
      question_type: questionType,
      options_en: cleanedPairs.map((row) => row.en.trim()),
      options_bn: cleanedPairs.map((row) => row.bn.trim()),
      required,
      status,
      category_ids: selectedCategories,
    };

    if (template) {
      void submit(
        () =>
          api.PATCH("/api/v1/admin/question-templates/{id}/", {
            params: { path: { id: template.id } },
            body,
          }),
        (saved) => onSaved(saved, false),
      );
      return;
    }

    void submit(
      () =>
        api.POST("/api/v1/admin/question-templates/", {
          body,
        }),
      (saved) => onSaved(saved, true),
    );
  }

  const previewPrompt =
    (locale === "bn" ? textBn.trim() || textEn.trim() : textEn.trim()) ||
    t("admin.qt.textEn");
  const previewOptions = isChoice
    ? options
        .filter((row) => row.en.trim())
        .map((row) => (locale === "bn" ? row.bn.trim() || row.en.trim() : row.en.trim()))
    : [];

  const previewQuestion: QuestionData = {
    id: "template-preview",
    sort_order: 1,
    question_type: questionType,
    prompt: previewPrompt,
    help_text: "",
    required,
    options: previewOptions,
    scale_min: 1,
    scale_max: 5,
    answer: null,
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5"
      >
        <h2 className="font-display text-2xl font-normal text-ink">
          {t(template ? "admin.qt.editTitle" : "admin.qt.createTitle")}
        </h2>
        {problems.form && <FormAlert>{problems.form}</FormAlert>}

        <div className="grid gap-4 desktop:grid-cols-2">
          <TextAreaField
            label={t("admin.qt.textEn")}
            error={problems.fields.text_en}
            value={textEn}
            onChange={(event) => setTextEn(event.target.value)}
            maxLength={1000}
          />
          <TextAreaField
            label={t("admin.qt.textBn")}
            error={problems.fields.text_bn}
            value={textBn}
            onChange={(event) => setTextBn(event.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="grid gap-4 desktop:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">{t("admin.qt.typeLabel")}</span>
            <select
              value={questionType}
              onChange={(event) => {
                setQuestionType(event.target.value as QuestionType);
                setPreviewAnswer(null);
              }}
              className="min-h-12 rounded-control border border-line-strong bg-surface px-3.5 text-base"
            >
              {QUESTION_TYPES.map((qtype) => (
                <option key={qtype} value={qtype}>
                  {t(`admin.qt.type.${qtype}`)}
                </option>
              ))}
            </select>
          </label>

          <SegmentedChoice
            legend={t("admin.qt.statusLabel")}
            name="template_status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "ACTIVE", label: t("admin.qt.status.ACTIVE") },
              { value: "RETIRED", label: t("admin.qt.status.RETIRED") },
            ]}
          />
        </div>

        {isChoice && (
          <div className="flex flex-col gap-3 rounded-control border border-line bg-mist p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{t("admin.qt.optionsHeading")}</span>
              <button
                type="button"
                onClick={addOptionRow}
                className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold"
              >
                + {t("admin.qt.addOption")}
              </button>
            </div>
            {problems.fields.options_en && <FieldError>{problems.fields.options_en}</FieldError>}
            {problems.fields.options_bn && <FieldError>{problems.fields.options_bn}</FieldError>}

            <div className="flex flex-col gap-2">
              {options.map((row) => (
                <div
                  key={row.id}
                  className="grid items-end gap-2 desktop:grid-cols-[1fr_1fr_auto]"
                >
                  <TextField
                    label={t("admin.qt.optionEn")}
                    value={row.en}
                    onChange={(event) => updateOption(row.id, { en: event.target.value })}
                    maxLength={200}
                  />
                  <TextField
                    label={t("admin.qt.optionBn")}
                    value={row.bn}
                    onChange={(event) => updateOption(row.id, { bn: event.target.value })}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    disabled={options.length <= 2}
                    onClick={() => removeOption(row.id)}
                    className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-danger disabled:opacity-40"
                  >
                    {t("admin.qt.removeOption")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
            className="size-5 accent-primary"
          />
          <span>{t("admin.qt.required")}</span>
        </label>

        {categories.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-ink">{t("admin.qt.categories")}</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const active = selectedCategories.includes(cat.id);
                const label = locale === "bn" ? cat.name_bn || cat.name_en : cat.name_en;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCategory(cat.id)}
                    className={`min-h-10 rounded-control border border-line-strong px-3 text-xs font-semibold ${
                      active ? "bg-ink text-surface" : "bg-surface text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 rounded-control bg-primary px-5 font-bold text-surface disabled:opacity-60"
          >
            {t("admin.qt.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-control border border-line-strong bg-surface px-4 font-semibold"
          >
            {t("admin.qt.cancel")}
          </button>
        </div>
      </form>

      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink-muted">{t("admin.qt.preview")}</h3>
        <QuestionInput
          question={previewQuestion}
          value={previewAnswer}
          onChange={setPreviewAnswer}
          labels={{
            yes: t("admin.qt.previewYes"),
            no: t("admin.qt.previewNo"),
            required: t("admin.qt.required"),
            photoUpload: t("admin.qt.previewPhoto"),
            photoSelected: "{name}",
          }}
        />
      </section>
    </div>
  );
}
