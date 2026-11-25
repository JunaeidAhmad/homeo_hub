"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { apiBaseUrl } from "@/api/client";
import { useMessages } from "@/i18n/provider";

import { PatientSession, type Transport } from "./patient-session";

export type { Transport } from "./patient-session";

const SessionContext = createContext<PatientSession | null>(null);

/** Keeps the patient signed in across the patient pages. */
export function SessionProvider({
  children,
  transport,
}: {
  children: ReactNode;
  transport?: Transport;
}) {
  const { locale } = useMessages();
  const [session] = useState(
    () =>
      new PatientSession(
        locale,
        transport ?? { baseUrl: apiBaseUrl(), fetch: (request) => fetch(request) },
      ),
  );
  useEffect(() => {
    void session.start();
  }, [session]);

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside a SessionProvider");
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getServerState);
  return {
    ...state,
    api: session.api,
    publicApi: session.publicApi,
    completeSignIn: session.complete.bind(session),
    signOut: session.signOut.bind(session),
    retry: session.retry,
  };
}
