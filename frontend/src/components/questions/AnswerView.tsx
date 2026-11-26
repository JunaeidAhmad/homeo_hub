"use client";

import { numberFormat } from "@/i18n/format";
import { useMessages } from "@/i18n/provider";

import type { QuestionData } from "./types";

export type AnswerViewLabels = {
  yes: string;
  no: string;
  viewPhoto: string;
  skipped: string;
};

export function AnswerView({
  question,
  labels,
}: {
  question: QuestionData;
  labels: AnswerViewLabels;
}) {
  const { locale } = useMessages();
  const nf = numberFormat(locale);
  const answer = question.answer;

  if (!answer) {
    return <p className="text-sm italic text-ink-muted">{labels.skipped}</p>;
  }

  if (question.question_type === "PHOTO") {
    return answer.file_url ? (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={answer.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded-control border border-line-strong bg-surface px-3.5 text-sm font-semibold text-primary underline"
        >
          {labels.viewPhoto}
        </a>
        {answer.file_name && <span className="text-xs text-ink-muted">{answer.file_name}</span>}
      </div>
    ) : (
      <p className="text-sm italic text-ink-muted">{labels.skipped}</p>
    );
  }

  const raw = answer.value;

  if (question.question_type === "YES_NO") {
    return (
      <p className="text-sm font-semibold text-ink">
        {raw === true ? labels.yes : labels.no}
      </p>
    );
  }

  if (question.question_type === "MULTI_CHOICE" && Array.isArray(raw)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {raw.map((item) => (
          <span
            key={String(item)}
            className="rounded-control bg-mist px-2.5 py-0.5 text-sm font-medium text-ink"
          >
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (question.question_type === "SCALE" && typeof raw === "number") {
    return (
      <p className="text-sm font-semibold text-primary-deep">
        {nf.format(raw)} / {nf.format(question.scale_max ?? 5)}
      </p>
    );
  }

  if (question.question_type === "NUMBER" && typeof raw === "number") {
    return <p className="text-sm font-semibold text-ink">{nf.format(raw)}</p>;
  }

  return <p className="whitespace-pre-line text-sm text-ink">{String(raw ?? "")}</p>;
}
