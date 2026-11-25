import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";

/** Sign-up and sign-in have nothing to show once you are signed in. */
export function useRedirectWhenSignedIn() {
  const session = useSession();
  const router = useRouter();
  // "unavailable" with a session: signed in, but the account has not loaded yet.
  const signedIn =
    session.status === "signedIn" || (session.status === "unavailable" && session.hasSession);
  useEffect(() => {
    if (signedIn) router.replace("/profile");
  }, [signedIn, router]);
}
