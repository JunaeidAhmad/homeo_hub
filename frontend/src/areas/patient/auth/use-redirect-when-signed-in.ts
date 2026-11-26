import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";

function safeNext(): string {
  if (typeof window === "undefined") return "/profile";
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return "/profile";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/profile";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return "/profile";
  return next;
}

/** Sign-up and sign-in return to `next` (when safe) or `/profile` once signed in. */
export function useRedirectWhenSignedIn() {
  const session = useSession();
  const router = useRouter();
  // "unavailable" with a session: signed in, but the account has not loaded yet.
  const signedIn =
    session.status === "signedIn" || (session.status === "unavailable" && session.hasSession);
  useEffect(() => {
    if (signedIn) router.replace(safeNext());
  }, [signedIn, router]);
}
