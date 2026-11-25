import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import { useMessages } from "@/i18n/provider";
import type { ApiProblem, Problems } from "@/lib/api-problem";

type FieldDetails = Record<string, { code: string }[]>;

/**
 * Turns the API's error codes into messages in the page's language, using the keys
 * `<area>.error.<CODE>` of that area's catalog. `fieldKey` may pick a message for a field.
 */
export function useDescribeErrorWith(
  area: string,
  fieldKey?: (field: string, code: string) => string | undefined,
) {
  const { t, locale } = useMessages();
  const number = numberFormat(locale);

  const known = (key: string): string | undefined => {
    const text = t(key);
    return text === key ? undefined : text;
  };
  const generic = () => t(`${area}.error.generic`);

  function fieldMessage(field: string, code: string): string {
    const special = fieldKey?.(field, code);
    if (special) return t(special);
    if (code === "blank" || code === "required") return t(`${area}.error.required`);
    return known(`${area}.error.${code}`) ?? generic();
  }

  /** `undefined` means the request never got an answer. */
  return function describe(problem: ApiProblem | undefined): Problems {
    const error = problem?.error;
    if (!error) return { form: generic(), fields: {} };

    if (error.code === "VALIDATION_ERROR") {
      const fields = Object.fromEntries(
        Object.entries(error.details as FieldDetails)
          .filter(([field, found]) => field !== "non_field_errors" && found[0])
          .map(([field, found]) => [field, fieldMessage(field, found[0].code)]),
      );
      const form = Object.keys(fields).length ? undefined : generic();
      return { code: error.code, form, fields };
    }

    const details = error.details as { retry_after?: number; attempts_left?: number };
    const message = known(`${area}.error.${error.code}`) ?? generic();
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
