import type { components } from "@/api/schema";

/** The API's one error shape. */
export type ApiProblem = components["schemas"]["Error"];

/** What a form shows: one message for the whole form and one per field. */
export type Problems = { form?: string; code?: string; fields: Record<string, string> };

export const NO_PROBLEMS: Problems = { fields: {} };
