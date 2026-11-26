"use client";

import type { components } from "@/api/schema";
import { WEB_CLIENT } from "@/lib/session/auth-session";
import { createSession } from "@/lib/session/create-session";

export type DoctorAccount = components["schemas"]["DoctorMe"];

const doctorSession = createSession<DoctorAccount>({
  lock: "hh-doctor-session",
  refresh: (api) => api.POST("/api/v1/auth/doctor/refresh/", WEB_CLIENT),
  logout: (api) => api.POST("/api/v1/auth/doctor/logout/", WEB_CLIENT),
  loadAccount: (api) => api.GET("/api/v1/doctor/me/"),
});

/** Keeps the doctor signed in across the doctor pages. */
export const DoctorSessionProvider = doctorSession.Provider;

type DoctorState =
  | { status: "loading"; doctor: null }
  | { status: "signedOut"; doctor: null }
  | { status: "signedIn"; doctor: DoctorAccount }
  | { status: "unavailable"; doctor: null; hasSession: boolean };

export function useDoctorSession() {
  const { state, actions } = doctorSession.useAuthSession();
  const { account, ...rest } = state;
  return { ...actions, ...({ ...rest, doctor: account } as DoctorState) };
}
