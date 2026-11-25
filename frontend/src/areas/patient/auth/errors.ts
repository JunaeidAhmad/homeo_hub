import { useDescribeErrorWith } from "@/hooks/use-describe-error";

const FIELD_MESSAGES: Record<string, string> = {
  age: "auth.error.age",
  location_id: "auth.error.location",
};

/** The patient auth screens' wording for the API's errors. */
export function useDescribeError() {
  return useDescribeErrorWith("auth", (field) => FIELD_MESSAGES[field]);
}
