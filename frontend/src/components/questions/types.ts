import type { components } from "@/api/schema";

export type QuestionType = components["schemas"]["QuestionTypeEnum"];
export type QuestionData = components["schemas"]["Question"];
export type QuestionSetData = components["schemas"]["QuestionSet"];
export type QuestionAnswerData = components["schemas"]["Answer"];

export type DraftAnswerValue = string | boolean | string[] | number | null;
