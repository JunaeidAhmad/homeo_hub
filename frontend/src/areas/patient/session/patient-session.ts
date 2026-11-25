import { createApiClient, type ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import type { Locale } from "@/i18n/config";

export type Patient = components["schemas"]["Patient"];
export type SignedInSession = components["schemas"]["Session"];

/** How requests reach the API; tests swap in a pretend network. */
export type Transport = { baseUrl: string; fetch: (request: Request) => Promise<Response> };

export type SessionState =
  | { status: "loading"; patient: null }
  | { status: "signedOut"; patient: null }
  | { status: "signedIn"; patient: Patient }
  /** The API could not be asked. `hasSession`: we hold a token but not the account. */
  | { status: "unavailable"; patient: null; hasSession: boolean };

type Refreshed = "ok" | "ended" | "unavailable";

const LOADING: SessionState = { status: "loading", patient: null };
const SIGNED_OUT: SessionState = { status: "signedOut", patient: null };
/** Refresh this long before the access token actually expires. */
const EARLY_MS = 30_000;
const CLIENT = { params: { header: { "X-Client": "web" as const } } };

/**
 * The patient's sign-in on this browser. The access token is kept only in memory; the
 * refresh token is an httpOnly cookie, which is how a reload stays signed in.
 */
export class PatientSession {
  /** For calls made before signing in (sign-up, codes, password reset). */
  readonly publicApi: ApiClient;
  /** Adds the access token and renews it when needed. */
  readonly api: ApiClient;

  private state: SessionState = LOADING;
  private token: { value: string; renewAt: number } | null = null;
  private refreshing: Promise<Refreshed> | null = null;
  private started = false;
  private signingOut = false;
  /** Goes up on every sign-in and sign-out, so a slower, older answer is ignored. */
  private epoch = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    language: Locale,
    private readonly transport: Transport,
  ) {
    this.publicApi = createApiClient({ language, ...transport });
    this.api = createApiClient({
      language,
      baseUrl: transport.baseUrl,
      fetch: (request: Request) => this.authorizedFetch(request),
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  getServerState = () => LOADING;

  /** Pick up an existing session (once per page load). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const epoch = this.epoch;
    const outcome = await this.refresh();
    if (epoch !== this.epoch) return; // signed in or out while we were asking
    if (outcome === "ok") await this.loadPatient();
    else if (outcome === "ended") this.set(SIGNED_OUT);
    else this.set({ status: "unavailable", patient: null, hasSession: false });
  }

  /** Ask again after the API could not be reached. */
  retry = () => {
    this.started = false;
    this.set(LOADING);
    void this.start();
  };

  /** Called with the answer to a successful sign-in or code verification. */
  async complete(session: SignedInSession): Promise<void> {
    this.epoch += 1;
    this.keep(session);
    await this.loadPatient();
  }

  /** False if the API could not be told, in which case we are still signed in. */
  async signOut(): Promise<boolean> {
    this.signingOut = true; // no new refreshes
    try {
      await this.refreshing; // one already on its way would set the cookie again
      return await this.locked(async () => {
        const { response } = await this.publicApi.POST("/api/v1/auth/logout/", CLIENT);
        if (response.ok) this.end();
        return response.ok;
      });
    } catch {
      return false;
    } finally {
      this.signingOut = false;
    }
  }

  private set(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private end() {
    this.epoch += 1;
    this.token = null;
    this.set(SIGNED_OUT);
  }

  private keep(session: SignedInSession) {
    this.token = {
      value: session.access_token,
      renewAt: Date.now() + session.expires_in * 1000 - EARLY_MS,
    };
  }

  private async loadPatient() {
    const unknown = () =>
      this.set({ status: "unavailable", patient: null, hasSession: this.token !== null });
    try {
      const { data, response } = await this.api.GET("/api/v1/me/");
      if (data) this.set({ status: "signedIn", patient: data });
      else if (response.status === 401) this.end();
      else unknown();
    } catch {
      unknown();
    }
  }

  /** One refresh at a time: in this tab by sharing the promise, across tabs by a lock. */
  private refresh(): Promise<Refreshed> {
    if (this.signingOut) return Promise.resolve("unavailable");
    this.refreshing ??= this.locked(() => this.requestRefresh(true)).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private locked<T>(work: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    return locks ? (locks.request("hh-patient-session", work) as Promise<T>) : work();
  }

  private async requestRefresh(mayRetry: boolean): Promise<Refreshed> {
    try {
      const { data, error, response } = await this.publicApi.POST("/api/v1/auth/refresh/", CLIENT);
      if (data) {
        this.keep(data);
        return "ok";
      }
      if (error?.error?.code === "REFRESH_IN_PROGRESS") {
        // Another tab got there first: the session is fine.
        if (!mayRetry) return "unavailable";
        await new Promise((resolve) => setTimeout(resolve, 600));
        return this.requestRefresh(false);
      }
      return response.status === 401 ? "ended" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  private async authorizedFetch(request: Request): Promise<Response> {
    const retry = request.clone();
    if (!this.token || Date.now() >= this.token.renewAt) {
      if ((await this.refresh()) === "ended") this.end();
    }
    const send = (outgoing: Request) => {
      if (this.token) outgoing.headers.set("Authorization", `Bearer ${this.token.value}`);
      return this.transport.fetch(outgoing);
    };
    const response = await send(request);
    if (response.status !== 401) return response;

    const outcome = await this.refresh();
    if (outcome === "ok") return send(retry);
    if (outcome === "ended") this.end();
    return response;
  }
}
