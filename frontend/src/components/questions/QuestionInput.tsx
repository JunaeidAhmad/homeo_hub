"use client";

import type { ChangeEvent } from "react";

import { FieldError } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";

import type { DraftAnswerValue, QuestionData } from "./types";

export type QuestionInputLabels = {
  yes: string;
  no: string;
  required: string;
  photoUpload: string;
  photoSelected: string;
};

export function QuestionInput({
  question,
  value,
  fileName,
  onChange,
  onFileChange,
  error,
  disabled = false,
  labels,
}: {
  question: QuestionData;
  value: DraftAnswerValue;
  fileName?: string;
  onChange: (next: DraftAnswerValue) => void;
  onFileChange?: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
  labels: QuestionInputLabels;
}) {
  const { locale } = useMessages();
  const nf = numberFormat(locale);
  const inputId = `q-input-${question.id}`;

  const qtype = question.question_type;

  function renderControl() {
    if (qtype === "TEXT") {
      return (
        <input
          id={inputId}
          type="text"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          maxLength={500}
          className={`min-h-12 w-full rounded-control border bg-surface px-3.5 text-base ${
            error ? "border-danger" : "border-line-strong"
          }`}
        />
      );
    }

    if (qtype === "LONG_TEXT") {
      return (
        <textarea
          id={inputId}
          rows={4}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          maxLength={4000}
          className={`w-full rounded-control border bg-surface px-3.5 py-2.5 text-base leading-relaxed ${
            error ? "border-danger" : "border-line-strong"
          }`}
        />
      );
    }

    if (qtype === "YES_NO") {
      return (
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: true, label: labels.yes },
            { val: false, label: labels.no },
          ].map((opt) => {
            const active = value === opt.val;
            return (
              <button
                key={opt.label}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(opt.val)}
                className={`min-h-12 rounded-control border px-4 text-base font-semibold ${
                  active
                    ? "border-primary bg-primary text-surface"
                    : "border-line-strong bg-surface text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (qtype === "SINGLE_CHOICE") {
      return (
        <div className="flex flex-col gap-2">
          {question.options.map((option) => {
            const checked = value === option;
            return (
              <label
                key={option}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-2.5 text-base ${
                  checked
                    ? "border-primary bg-mist font-semibold text-primary-deep"
                    : "border-line-strong bg-surface text-ink"
                }`}
              >
                <input
                  type="radio"
                  name={inputId}
                  disabled={disabled}
                  checked={checked}
                  onChange={() => onChange(option)}
                  className="size-4 accent-primary"
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (qtype === "MULTI_CHOICE") {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (option: string) => {
        if (selected.includes(option)) {
          onChange(selected.filter((item) => item !== option));
        } else {
          onChange([...selected, option]);
        }
      };
      return (
        <div className="flex flex-col gap-2">
          {question.options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-2.5 text-base ${
                  checked
                    ? "border-primary bg-mist font-semibold text-primary-deep"
                    : "border-line-strong bg-surface text-ink"
                }`}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="size-4 accent-primary"
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (qtype === "NUMBER") {
      return (
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={value !== null && value !== undefined ? String(value) : ""}
          onChange={(event) => {
            const raw = toAsciiDigits(event.target.value);
            onChange(raw);
          }}
          maxLength={24}
          className={`min-h-12 w-full rounded-control border bg-surface px-3.5 text-base ${
            error ? "border-danger" : "border-line-strong"
          }`}
        />
      );
    }

    if (qtype === "SCALE") {
      const min = question.scale_min ?? 1;
      const max = question.scale_max ?? 5;
      const scores: number[] = [];
      for (let i = min; i <= max; i++) scores.push(i);

      return (
        <div className="flex flex-wrap gap-2">
          {scores.map((score) => {
            const active = value === score;
            return (
              <button
                key={score}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(score)}
                className={`min-h-11 min-w-11 flex-1 rounded-control border px-2 text-base font-semibold ${
                  active
                    ? "border-primary bg-primary text-surface"
                    : "border-line-strong bg-surface text-ink"
                }`}
              >
                {nf.format(score)}
              </button>
            );
          })}
        </div>
      );
    }

    // PHOTO
    const onFile = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      onFileChange?.(file);
    };

    return (
      <div className="flex flex-col items-start gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink">
          {labels.photoUpload}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={onFile}
            className="sr-only"
          />
        </label>
        {fileName && (
          <p className="text-sm font-medium text-primary-deep">
            {fill(labels.photoSelected, { name: fileName })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div id={`q-${question.id}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-base font-semibold text-ink">
          {question.prompt}
        </label>
        {question.required && (
          <span className="text-xs font-semibold text-amber">{labels.required}</span>
        )}
      </div>
      {question.help_text && <p className="text-sm text-ink-muted">{question.help_text}</p>}
      {renderControl()}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
