"use client";

import type { components } from "@/api/schema";
import { WEB_CLIENT } from "@/lib/session/auth-session";
import { createSession } from "@/lib/session/create-session";

export type StaffAccount = components["schemas"]["AdminMe"];

const staffSession = createSession<StaffAccount>({
  lock: "hh-staff-session",
  refresh: (api) => api.POST("/api/v1/auth/staff/refresh/", WEB_CLIENT),
  logout: (api) => api.POST("/api/v1/auth/staff/logout/", WEB_CLIENT),
  loadAccount: (api) => api.GET("/api/v1/admin/me/"),
});

/** Keeps the staff member signed in across the admin pages. */
export const StaffSessionProvider = staffSession.Provider;

type StaffState =
  | { status: "loading"; staff: null }
  | { status: "signedOut"; staff: null }
  | { status: "signedIn"; staff: StaffAccount }
  | { status: "unavailable"; staff: null; hasSession: boolean };

export function useStaffSession() {
  const { state, actions } = staffSession.useAuthSession();
  const { account, ...rest } = state;
  return { ...actions, ...({ ...rest, staff: account } as StaffState) };
}
