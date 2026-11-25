import { useSubmitWith } from "@/hooks/use-submit";

import { useDescribeError } from "./errors";

/** Form state for the patient auth screens. */
export function useSubmit() {
  return useSubmitWith(useDescribeError());
}
