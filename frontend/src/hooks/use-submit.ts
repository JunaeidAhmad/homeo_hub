import { useState } from "react";

import { NO_PROBLEMS, type ApiProblem, type Problems } from "@/lib/api-problem";

/** Shared form state: one request at a time, with its problems ready to show. */
export function useSubmitWith(describe: (problem: ApiProblem | undefined) => Problems) {
  const [pending, setPending] = useState(false);
  const [problems, setProblems] = useState<Problems>(NO_PROBLEMS);

  /**
   * Runs `send`; on success calls `then` with the answer. `intercept` may handle a
   * particular error itself by returning true.
   */
  async function submit<T>(
    send: () => Promise<{ data?: T; error?: unknown; response: Response }>,
    then: (data: T) => void | Promise<void>,
    intercept?: (problem: ApiProblem) => boolean,
  ) {
    if (pending) return;
    setPending(true);
    setProblems(NO_PROBLEMS);
    try {
      const { data, error, response } = await send();
      if (response.ok) await then(data as T);
      else if (!intercept?.(error as ApiProblem)) setProblems(describe(error as ApiProblem));
    } catch {
      setProblems(describe(undefined));
    } finally {
      setPending(false);
    }
  }

  return { pending, problems, setProblems, submit };
}
