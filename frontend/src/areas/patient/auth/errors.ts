import type { components } from "@/api/schema";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

export type ApiProblem = components["schemas"]["Error"];
export type Problems = { form?: string; code?: string; fields: Record<string, string> };

export const NO_PROBLEMS: Problems = { fields: {} };

type FieldDetails = Record<string, { code: string }[]>;

/** Turns the API's error codes into messages in the page's language. */
export function useDescribeError() {
  const { t, locale } = useMessages<AuthMessages>();
  const number = numberFormat(locale);

  const known = (key: string): string | undefined => {
    const text = t(key as keyof AuthMessages);
    return text === key ? undefined : text;
  };

  function fieldMessage(field: string, code: string): string {
    if (field === "age") return t("auth.error.age");
    if (field === "location_id") return t("auth.error.location");
    if (code === "blank" || code === "required") return t("auth.error.required");
    return known(`auth.error.${code}`) ?? t("auth.error.generic");
  }

  /** `undefined` means the request never got an answer. */
  return function describe(problem: ApiProblem | undefined): Problems {
    const error = problem?.error;
    if (!error) return { form: t("auth.error.generic"), fields: {} };

    if (error.code === "VALIDATION_ERROR") {
      const fields = Object.fromEntries(
        Object.entries(error.details as FieldDetails)
          .filter(([field, found]) => field !== "non_field_errors" && found[0])
          .map(([field, found]) => [field, fieldMessage(field, found[0].code)]),
      );
      const form = Object.keys(fields).length ? undefined : t("auth.error.generic");
      return { code: error.code, form, fields };
    }

    const details = error.details as { retry_after?: number; attempts_left?: number };
    const message = known(`auth.error.${error.code}`) ?? t("auth.error.generic");
    return {
      code: error.code,
      form: fill(message, {
        minutes: number.format(Math.max(1, Math.ceil((details.retry_after ?? 60) / 60))),
        count: number.format(details.attempts_left ?? 0),
      }),
      fields: {},
    };
  };
}
