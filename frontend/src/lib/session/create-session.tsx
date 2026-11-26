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

import { AuthSession, type SessionKind, type Transport } from "./auth-session";

/** A provider and hook that keep one kind of user signed in across their pages. */
export function createSession<Account>(kind: SessionKind<Account>) {
  const Context = createContext<AuthSession<Account> | null>(null);

  function Provider({ children, transport }: { children: ReactNode; transport?: Transport }) {
    const { locale } = useMessages();
    const [session] = useState(
      () =>
        new AuthSession(
          kind,
          locale,
          transport ?? { baseUrl: apiBaseUrl(), fetch: (request) => fetch(request) },
        ),
    );
    useEffect(() => {
      void session.start();
    }, [session]);

    return <Context value={session}>{children}</Context>;
  }

  function useAuthSession() {
    const session = useContext(Context);
    if (!session) throw new Error("This page must be inside its SessionProvider");
    const state = useSyncExternalStore(
      session.subscribe,
      session.getState,
      session.getServerState,
    );
    return {
      state,
      actions: {
        api: session.api,
        publicApi: session.publicApi,
        completeSignIn: session.complete.bind(session),
        reloadAccount: session.reloadAccount.bind(session),
        signOut: session.signOut.bind(session),
        retry: session.retry,
      },
    };
  }

  return { Provider, useAuthSession };
}
