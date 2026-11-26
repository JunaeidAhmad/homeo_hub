"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { FormAlert, SubmitBar } from "@/components/form/fields";
import { AnswerView } from "@/components/questions/AnswerView";
import { QuestionInput } from "@/components/questions/QuestionInput";
import type {
  DraftAnswerValue,
  QuestionData,
  QuestionSetData,
} from "@/components/questions/types";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

function readDraft(storageKey: string): Record<string, DraftAnswerValue> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DraftAnswerValue>;
  } catch {
    return {};
  }
}

function isAnswered(
  question: QuestionData,
  value: DraftAnswerValue,
  file: File | undefined,
): boolean {
  if (question.question_type === "PHOTO") return Boolean(file);
  if (question.question_type === "YES_NO") return value === true || value === false;
  if (question.question_type === "SCALE") return typeof value === "number";
  if (question.question_type === "MULTI_CHOICE") {
    return Array.isArray(value) && value.length > 0;
  }
  if (question.question_type === "NUMBER") {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function AnswerForm({ caseId, setId }: { caseId: string; setId: string }) {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const router = useRouter();
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);

  const storageKey = `hh-ansdraft-${caseId}-${setId}`;
  const [questionSet, setQuestionSet] = useState<QuestionSetData | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [values, setValues] = useState<Record<string, DraftAnswerValue>>(() =>
    readDraft(storageKey),
  );
  const [files, setFiles] = useState<Record<string, File>>({});

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/consultations/{id}/question-sets/{set_pk}/", {
        params: { path: { id: caseId, set_pk: setId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setQuestionSet(data);
          setLoadStatus("ready");
        } else {
          setLoadStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, caseId, setId, session.status]);

  if (isGuest) {
    return (
      <TaskScreen title={t("patient.care.title")} backHref={`/care/${caseId}`}>
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href={`/signin?next=/care/${caseId}/questions/${setId}`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  if (loadStatus === "loading" || !questionSet) {
    return (
      <TaskScreen title={t("patient.care.title")} backHref={`/care/${caseId}`}>
        {loadStatus === "error" ? (
          <FormAlert>{t("patient.care.notFound")}</FormAlert>
        ) : (
          <p role="status" className="text-ink-muted">
            …
          </p>
        )}
      </TaskScreen>
    );
  }

  const nf = numberFormat(locale);
  const pageTitle = fill(t("patient.care.questionSetRound"), {
    round: nf.format(questionSet.round_number),
  });

  if (questionSet.answered_at) {
    return (
      <TaskScreen title={pageTitle} backHref={`/care/${caseId}`}>
        <div className="rounded-panel border border-primary/40 bg-mist p-4 text-sm font-semibold text-primary-deep">
          {t("patient.care.answeredLabel")}
        </div>
        <ol className="flex flex-col gap-3">
          {questionSet.questions.map((question) => (
            <li
              key={question.id}
              className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4"
            >
              <p className="font-semibold text-ink">{question.prompt}</p>
              <AnswerView
                question={question}
                labels={{
                  yes: t("patient.care.yes"),
                  no: t("patient.care.no"),
                  viewPhoto: t("patient.care.viewPhoto"),
                  skipped: t("patient.care.noAnswer"),
                }}
              />
            </li>
          ))}
        </ol>
      </TaskScreen>
    );
  }

  function updateValue(qid: string, next: DraftAnswerValue) {
    setValues((now) => {
      const updated = { ...now, [qid]: next };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // Ignore quota errors.
      }
      return updated;
    });
  }

  const answeredCount = questionSet.questions.filter((q) =>
    isAnswered(q, values[q.id] ?? null, files[q.id]),
  ).length;

  function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!questionSet) return;

    const fieldErrors: Record<string, string> = {};
    let firstMissingId: string | null = null;

    for (const q of questionSet.questions) {
      const answered = isAnswered(q, values[q.id] ?? null, files[q.id]);
      if (q.required && !answered) {
        fieldErrors[q.id] = t("patient.error.required");
        if (!firstMissingId) firstMissingId = q.id;
      }
    }

    if (firstMissingId) {
      setProblems({ form: t("patient.care.missingRequired"), fields: fieldErrors });
      document
        .getElementById(`q-${firstMissingId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const answersList = questionSet.questions
      .filter((q) => q.question_type !== "PHOTO")
      .map((q) => ({
        question_id: q.id,
        value: values[q.id] ?? null,
      }));

    void submit(
      () =>
        api.POST("/api/v1/consultations/{id}/question-sets/{set_pk}/answers/", {
          params: { path: { id: caseId, set_pk: setId } },
          body: { answers: answersList } as never,
          bodySerializer: () => {
            const form = new FormData();
            form.append("answers", JSON.stringify(answersList));
            for (const [qid, file] of Object.entries(files)) {
              form.append(`file_${qid}`, file);
            }
            return form;
          },
        }),
      () => {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Ignore.
        }
        router.replace(`/care/${caseId}`);
      },
    );
  }

  const inputLabels = {
    yes: t("patient.care.yes"),
    no: t("patient.care.no"),
    required: t("patient.care.requiredMark"),
    photoUpload: t("patient.care.photoUpload"),
    photoSelected: t("patient.care.photoSelected"),
  };

  return (
    <TaskScreen title={pageTitle} backHref={`/care/${caseId}`}>
      {questionSet.title && (
        <h2 className="font-display text-2xl text-ink">{questionSet.title}</h2>
      )}
      {questionSet.note && <p className="text-base text-ink-soft">{questionSet.note}</p>}

      <p className="text-sm font-semibold text-primary-deep">
        {fill(t("patient.care.progressHint"), {
          answered: nf.format(answeredCount),
          total: nf.format(questionSet.questions.length),
        })}
      </p>

      <form onSubmit={submitForm} noValidate className="flex flex-1 flex-col gap-5">
        {problems.form && <FormAlert>{problems.form}</FormAlert>}

        {questionSet.questions.map((question) => (
          <div
            key={question.id}
            className="rounded-panel border border-line bg-surface p-4"
          >
            <QuestionInput
              question={question}
              value={values[question.id] ?? null}
              fileName={files[question.id]?.name}
              onChange={(next) => updateValue(question.id, next)}
              onFileChange={(file) =>
                setFiles((now) => {
                  const copy = { ...now };
                  if (file) copy[question.id] = file;
                  else delete copy[question.id];
                  return copy;
                })
              }
              error={problems.fields[question.id]}
              labels={inputLabels}
            />
          </div>
        ))}

        <SubmitBar pending={pending}>{t("patient.care.submitAnswers")}</SubmitBar>
      </form>
    </TaskScreen>
  );
}
