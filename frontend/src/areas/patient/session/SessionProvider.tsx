"use client";

import type { components } from "@/api/schema";
import { WEB_CLIENT } from "@/lib/session/auth-session";
import { createSession } from "@/lib/session/create-session";

export type { Transport } from "@/lib/session/auth-session";

type Patient = components["schemas"]["Patient"];

const patientSession = createSession<Patient>({
  lock: "hh-patient-session",
  refresh: (api) => api.POST("/api/v1/auth/refresh/", WEB_CLIENT),
  logout: (api) => api.POST("/api/v1/auth/logout/", WEB_CLIENT),
  loadAccount: (api) => api.GET("/api/v1/me/"),
});

/** Keeps the patient signed in across the patient pages. */
export const SessionProvider = patientSession.Provider;

type PatientState =
  | { status: "loading"; patient: null }
  | { status: "signedOut"; patient: null }
  | { status: "signedIn"; patient: Patient }
  | { status: "unavailable"; patient: null; hasSession: boolean };

export function useSession() {
  const { state, actions } = patientSession.useAuthSession();
  const { account, ...rest } = state;
  return { ...actions, ...({ ...rest, patient: account } as PatientState) };
}
