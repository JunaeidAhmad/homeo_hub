import { useSyncExternalStore } from "react";

/** A code that has been texted and not yet used. */
export type PendingCode = { verificationId: string; phone: string; resendAt: number };

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pendingFrom(sent: {
  verification_id: string;
  phone: string;
  resend_after: number;
}): PendingCode {
  return {
    verificationId: sent.verification_id,
    phone: sent.phone,
    resendAt: Date.now() + sent.resend_after * 1000,
  };
}

/**
 * Remembered for this tab, because switching to the SMS app can reload a phone's
 * browser tab. Never holds a password.
 */
export function usePendingCode(flow: string) {
  const key = `hh_pending_code_${flow}`;
  const stored = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(key),
    () => null,
  );
  const pending = stored ? (JSON.parse(stored) as PendingCode) : null;

  function save(next: PendingCode | null) {
    if (next) sessionStorage.setItem(key, JSON.stringify(next));
    else sessionStorage.removeItem(key);
    listeners.forEach((listener) => listener());
  }

  return [pending, save] as const;
}
