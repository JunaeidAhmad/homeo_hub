import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it } from "vitest";

import { SessionProvider, useSession } from "@/areas/patient/session/SessionProvider";
import { failure, fakeServer, RAHIMA, SESSION, type Routes } from "@/test/fake-server";
import { renderIn } from "@/test/render";

const REFRESH = "POST /api/v1/auth/refresh/";
const LOGOUT = "POST /api/v1/auth/logout/";
const ME = "GET /api/v1/me/";

function Probe() {
  const { status, patient, signOut, api, retry, completeSignIn } = useSession();
  const [fetched, setFetched] = useState("");
  return (
    <>
      <p>status: {status}</p>
      {patient && <p>name: {patient.full_name}</p>}
      <button onClick={() => void signOut()}>sign out</button>
      <button onClick={retry}>retry</button>
      <button onClick={() => void completeSignIn({ ...SESSION, user_type: "patient" })}>
        complete sign in
      </button>
      <button
        onClick={async () => {
          const { data, response } = await api.GET("/api/v1/me/");
          setFetched(data ? data.full_name : `failed ${response.status}`);
        }}
      >
        load
      </button>
      <p>{fetched}</p>
    </>
  );
}

function setup(routes: Routes, { strict = false } = {}) {
  const server = fakeServer(routes);
  const tree = (
    <SessionProvider transport={server.transport}>
      <Probe />
    </SessionProvider>
  );
  renderIn("en", strict ? <StrictMode>{tree}</StrictMode> : tree);
  return server;
}

const signedInRoutes: Routes = {
  [REFRESH]: () => ({ body: SESSION }),
  [ME]: () => ({ body: RAHIMA }),
  [LOGOUT]: () => ({ status: 204 }),
};

describe("patient session", () => {
  it("is restored after a reload from the refresh cookie", async () => {
    const server = setup(signedInRoutes);

    expect(screen.getByText("status: loading")).toBeInTheDocument();
    expect(await screen.findByText("name: Rahima Akhter")).toBeInTheDocument();
    expect(screen.getByText("status: signedIn")).toBeInTheDocument();
    expect(server.sent(REFRESH)[0].headers.get("X-Client")).toBe("web");
    expect(server.sent(ME)[0].headers.get("Authorization")).toBe("Bearer access-1");
  });

  it("is signed out when there is no session", async () => {
    const server = setup({ [REFRESH]: () => failure(401, "SESSION_EXPIRED") });

    expect(await screen.findByText("status: signedOut")).toBeInTheDocument();
    expect(server.sent(ME)).toHaveLength(0);
  });

  it("says it cannot tell when the API is unreachable, and can try again", async () => {
    let down = true;
    setup({ ...signedInRoutes, [REFRESH]: () => (down ? failure(500, "ERROR") : { body: SESSION }) });
    expect(await screen.findByText("status: unavailable")).toBeInTheDocument();

    down = false;
    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    expect(await screen.findByText("status: signedIn")).toBeInTheDocument();
  });

  it("does not treat a refresh that keeps colliding as a sign-out", async () => {
    setup({ [REFRESH]: () => failure(401, "REFRESH_IN_PROGRESS") });

    expect(await screen.findByText("status: unavailable", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("is not signed out by a slow first check that finishes after signing in", async () => {
    let answer!: () => void;
    const slow = new Promise<void>((resolve) => (answer = resolve));
    setup({
      ...signedInRoutes,
      [REFRESH]: async () => {
        await slow;
        return failure(401, "SESSION_EXPIRED");
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "complete sign in" }));
    await screen.findByText("status: signedIn");

    answer();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByText("status: signedIn")).toBeInTheDocument();
  });

  it("signs out only after a refresh already on its way has finished", async () => {
    let answer!: () => void;
    let refreshes = 0;
    const slow = new Promise<void>((resolve) => (answer = resolve));
    const server = setup({
      ...signedInRoutes,
      [REFRESH]: async () => {
        if (++refreshes === 2) await slow;
        return { body: SESSION };
      },
      [ME]: () => (refreshes === 1 && server.sent(ME).length > 1 ? failure(401, "NOT_AUTHENTICATED") : { body: RAHIMA }),
    });
    await screen.findByText("status: signedIn");
    await userEvent.click(screen.getByRole("button", { name: "load" })); // starts refresh no. 2
    await waitFor(() => expect(refreshes).toBe(2));

    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    expect(server.sent(LOGOUT)).toHaveLength(0);
    answer();

    await screen.findByText("status: signedOut");
    expect(server.sent(LOGOUT)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("status: signedOut")).toBeInTheDocument();
  });

  it("refreshes only once even if React starts it twice", async () => {
    const server = setup(signedInRoutes, { strict: true });

    await screen.findByText("status: signedIn");

    expect(server.sent(REFRESH)).toHaveLength(1);
  });

  it("tries again when another tab was refreshing at the same moment", async () => {
    let tries = 0;
    const server = setup({
      ...signedInRoutes,
      [REFRESH]: () =>
        ++tries === 1 ? failure(401, "REFRESH_IN_PROGRESS") : { body: SESSION },
    });

    expect(await screen.findByText("status: signedIn", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(server.sent(REFRESH)).toHaveLength(2);
  });

  it("gets a new access token and repeats a request that found the old one expired", async () => {
    let token = 0;
    let expired = false;
    const server = setup({
      ...signedInRoutes,
      [REFRESH]: () => ({ body: { ...SESSION, access_token: `access-${++token}` } }),
      [ME]: (call) =>
        expired && call.headers.get("Authorization") === "Bearer access-1"
          ? failure(401, "NOT_AUTHENTICATED")
          : { body: RAHIMA },
    });
    await screen.findByText("status: signedIn");
    expired = true;

    await userEvent.click(screen.getByRole("button", { name: "load" }));

    expect(await screen.findByText("Rahima Akhter")).toBeInTheDocument();
    expect(server.sent(REFRESH)).toHaveLength(2);
    expect(server.sent(ME).at(-1)!.headers.get("Authorization")).toBe("Bearer access-2");
  });

  it("signs out when the session can no longer be refreshed", async () => {
    let alive = true;
    setup({
      [REFRESH]: () => (alive ? { body: SESSION } : failure(401, "SESSION_EXPIRED")),
      [ME]: () => (alive ? { body: RAHIMA } : failure(401, "NOT_AUTHENTICATED")),
    });
    await screen.findByText("status: signedIn");
    alive = false;

    await userEvent.click(screen.getByRole("button", { name: "load" }));

    expect(await screen.findByText("status: signedOut")).toBeInTheDocument();
    expect(screen.queryByText("name: Rahima Akhter")).not.toBeInTheDocument();
  });

  it("signs out on request, telling the API", async () => {
    const server = setup(signedInRoutes);
    await screen.findByText("status: signedIn");

    await userEvent.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() => expect(screen.getByText("status: signedOut")).toBeInTheDocument());
    expect(server.sent(LOGOUT)[0].headers.get("X-Client")).toBe("web");
  });
});
