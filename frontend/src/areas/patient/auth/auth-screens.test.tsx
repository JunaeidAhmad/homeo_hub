import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useState, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPanel } from "@/areas/patient/auth/AccountPanel";
import { ForgotPasswordForm } from "@/areas/patient/auth/ForgotPasswordForm";
import { SignInForm } from "@/areas/patient/auth/SignInForm";
import { SignUpForm } from "@/areas/patient/auth/SignUpForm";
import { SessionProvider } from "@/areas/patient/session/SessionProvider";
import { failure, fakeServer, RAHIMA, SESSION, type Routes } from "@/test/fake-server";
import { renderIn } from "@/test/render";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SIGNUP = "POST /api/v1/auth/patient/signup/";
const LOGIN = "POST /api/v1/auth/patient/login/";
const VERIFY = "POST /api/v1/auth/otp/verify/";
const RESEND = "POST /api/v1/auth/otp/resend/";
const FORGOT = "POST /api/v1/auth/password/forgot/";
const RESET = "POST /api/v1/auth/password/reset/";
const LOGOUT = "POST /api/v1/auth/logout/";

const verification = (resend_after = 60) => ({
  verification_id: "11111111-1111-1111-1111-111111111111",
  phone: "+8801712345678",
  expires_in: 300,
  resend_after,
});

/** A server where nobody is signed in yet; verifying or signing in creates a session. */
function signedOutServer(extra: Routes = {}): Routes {
  return {
    "POST /api/v1/auth/refresh/": () => failure(401, "SESSION_EXPIRED"),
    "GET /api/v1/me/": () => ({ body: RAHIMA }),
    "GET /api/v1/locations/": () => ({
      body: { count: 1, next: null, previous: null, results: [RAHIMA.location] },
    }),
    [SIGNUP]: () => ({ status: 201, body: verification() }),
    [VERIFY]: () => ({ body: SESSION }),
    [LOGIN]: () => ({ body: SESSION }),
    [RESEND]: () => ({ body: verification() }),
    [FORGOT]: () => ({ body: verification() }),
    [RESET]: () => ({ status: 204 }),
    ...extra,
  };
}

function setup(ui: ReactElement, routes: Routes = signedOutServer(), locale: "en" | "bn" = "en") {
  const server = fakeServer(routes);
  const view = renderIn(locale, <SessionProvider transport={server.transport}>{ui}</SessionProvider>);
  return { ...server, ...view };
}

const type = (label: string | RegExp, text: string) =>
  userEvent.type(screen.getByLabelText(label), text);
const press = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));

async function fillSignUp() {
  await type("Full name", "Rahima Akhter");
  await type("Mobile number", "1712 345678");
  await type("Age", "৩৪"); // Bangla digits
  await userEvent.click(screen.getByRole("radio", { name: "Female" }));
  await userEvent.type(screen.getByRole("combobox", { name: "Your area" }), "kap");
  await userEvent.click(await screen.findByRole("option", { name: /Kapasia/ }));
  await type("Password", "river-lamp-42-orchid");
}

beforeEach(() => {
  router.replace.mockReset();
  sessionStorage.clear();
});

describe("sign-up", () => {
  it("sends the details and asks for the code that was texted", async () => {
    const { sent } = setup(<SignUpForm />);
    await fillSignUp();

    await press("Send verification code");

    expect(await screen.findByRole("heading", { name: "Enter the 6-digit code" })).toBeInTheDocument();
    expect(screen.getByText("We sent it by SMS to +8801712345678.")).toBeInTheDocument();
    expect(sent(SIGNUP)[0].body).toEqual({
      full_name: "Rahima Akhter",
      phone: "1712 345678",
      age: 34,
      gender: "FEMALE",
      location_id: "loc1",
      password: "river-lamp-42-orchid",
    });
  });

  it("verifies the code, signs in and moves to the profile", async () => {
    const { sent } = setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");
    await screen.findByLabelText("Verification code");

    await type("Verification code", "123456");
    await press("Verify and continue");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
    expect(sent(VERIFY)[0].body).toEqual({
      verification_id: verification().verification_id,
      code: "123456",
    });
  });

  it("forgets the whole form once the code has been requested", async () => {
    setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");

    await userEvent.click(await screen.findByRole("button", { name: "Change number" }));

    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Full name")).toHaveValue("Rahima Akhter"); // not secret: kept
  });

  it("points out missing fields without calling the API", async () => {
    const { sent } = setup(<SignUpForm />);

    await press("Send verification code");

    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose your area from the list.")).toBeInTheDocument();
    expect(screen.getByText("Enter your age in years, from 1 to 120.")).toBeInTheDocument();
    expect(sent(SIGNUP)).toHaveLength(0);
  });

  it("shows the API's field errors in the page's language", async () => {
    setup(
      <SignUpForm />,
      signedOutServer({
        [SIGNUP]: () =>
          failure(400, "VALIDATION_ERROR", {
            phone: [{ code: "INVALID_PHONE", message: "x" }],
            password: [{ code: "password_too_common", message: "x" }],
          }),
      }),
    );
    await fillSignUp();

    await press("Send verification code");

    expect(await screen.findByText("Enter a Bangladeshi mobile number, like 01712 345678.")).toBeInTheDocument();
    expect(screen.getByText("That password is too common. Choose another.")).toBeInTheDocument();
  });

  it("offers sign-in when the number already has an account", async () => {
    setup(<SignUpForm />, signedOutServer({ [SIGNUP]: () => failure(409, "PHONE_TAKEN") }));
    await fillSignUp();

    await press("Send verification code");

    expect(await screen.findByRole("alert")).toHaveTextContent("This number already has an account.");
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/signin");
  });

  it("leaves nothing of one person's details for the next once verified", async () => {
    setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");
    await userEvent.type(await screen.findByLabelText("Verification code"), "123456");
    await press("Verify and continue");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));

    for (const label of ["Full name", "Mobile number", "Age", "Password"]) {
      expect(screen.getByLabelText(label), label).toHaveValue("");
    }
    expect(screen.getByRole("combobox", { name: "Your area" })).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Female" })).not.toBeChecked();
  });

  it("sends the web header the API requires for signing in", async () => {
    const { sent } = setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");
    await userEvent.type(await screen.findByLabelText("Verification code"), "123456");

    await press("Verify and continue");

    await waitFor(() => expect(sent(VERIFY)).toHaveLength(1));
    expect(sent(VERIFY)[0].headers.get("X-Client")).toBe("web");
  });

  it("explains a wrong code and how many tries are left", async () => {
    setup(
      <SignUpForm />,
      signedOutServer({ [VERIFY]: () => failure(400, "OTP_INVALID", { attempts_left: 4 }) }),
    );
    await fillSignUp();
    await press("Send verification code");

    await userEvent.type(await screen.findByLabelText("Verification code"), "000000");
    await press("Verify and continue");

    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right. Tries left: 4.");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("makes you wait before asking for another code", async () => {
    setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");

    expect(await screen.findByText(/You can resend in 1:00|You can resend in 0:59/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send a new code" })).not.toBeInTheDocument();
  });

  it("sends a new code once the wait is over", async () => {
    const { sent } = setup(
      <SignUpForm />,
      signedOutServer({ [SIGNUP]: () => ({ status: 201, body: verification(0) }) }),
    );
    await fillSignUp();
    await press("Send verification code");

    await userEvent.click(await screen.findByRole("button", { name: "Send a new code" }));

    expect(await screen.findByText("A new code is on its way.")).toBeInTheDocument();
    expect(sent(RESEND)).toHaveLength(1);
  });

  it("stays on the code step if the page reloads (reading the SMS can reload a phone tab)", async () => {
    const first = setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");
    await screen.findByLabelText("Verification code");
    first.unmount();

    setup(<SignUpForm />);

    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("river-lamp");
  });

  it("can go back to change the number", async () => {
    setup(<SignUpForm />);
    await fillSignUp();
    await press("Send verification code");

    await userEvent.click(await screen.findByRole("button", { name: "Change number" }));

    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("works in Bangla", async () => {
    setup(<SignUpForm />, signedOutServer(), "bn");

    expect(screen.getByRole("heading", { name: "অ্যাকাউন্ট খুলুন" })).toBeInTheDocument();
    expect(screen.getByLabelText("মোবাইল নম্বর")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "যাচাই কোড পাঠান" })).toBeInTheDocument();
  });
});

describe("sign-in", () => {
  async function signIn() {
    await type("Mobile number", "01712345678");
    await type("Password", "river-lamp-42-orchid");
    await press("Sign in");
  }

  it("signs in and moves to the profile", async () => {
    const { sent } = setup(<SignInForm />);

    await signIn();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
    expect(sent(LOGIN)[0].body).toEqual({ phone: "01712345678", password: "river-lamp-42-orchid" });
    expect(sent(LOGIN)[0].headers.get("X-Client")).toBe("web");
  });

  it("goes to the profile, which offers a retry, if the account cannot be loaded yet", async () => {
    setup(<SignInForm />, signedOutServer({ "GET /api/v1/me/": () => failure(500, "ERROR") }));

    await signIn();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
  });

  it("forgets what was typed once signed in (the page is kept alive after leaving it)", async () => {
    setup(<SignInForm />);

    await signIn();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));

    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Mobile number")).toHaveValue("");
  });

  it("says when the number or password is wrong", async () => {
    setup(<SignInForm />, signedOutServer({ [LOGIN]: () => failure(401, "INVALID_CREDENTIALS") }));

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("The mobile number or password is not right.");
  });

  it("says how long to wait after too many tries", async () => {
    setup(
      <SignInForm />,
      signedOutServer({ [LOGIN]: () => failure(429, "RATE_LIMITED", { retry_after: 130 }) }),
    );

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 3 min.");
  });

  it("moves to the code step for a number that was never verified", async () => {
    const { sent } = setup(
      <SignInForm />,
      signedOutServer({
        [LOGIN]: () =>
          failure(403, "PHONE_NOT_VERIFIED", {
            verification_id: "22222222-2222-2222-2222-222222222222",
            phone: "+8801712345678",
            resend_after: 0,
          }),
      }),
    );
    await signIn();

    await userEvent.type(await screen.findByLabelText("Verification code"), "123456");
    // How long to wait before resending comes from the API.
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeInTheDocument();
    await press("Verify and continue");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
    expect(sent(VERIFY)[0].body).toMatchObject({ verification_id: "22222222-2222-2222-2222-222222222222" });
  });

  it("reports a network failure instead of doing nothing", async () => {
    setup(
      <SignInForm />,
      signedOutServer({
        [LOGIN]: () => {
          throw new TypeError("fetch failed");
        },
      }),
    );

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });
});

describe("leaving a form", () => {
  /** What Next does on navigation: hide the page but keep it alive. */
  function Leavable({ children }: { children: ReactElement }) {
    const [hidden, setHidden] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setHidden((now) => !now)}>
          leave or return
        </button>
        <Activity mode={hidden ? "hidden" : "visible"}>{children}</Activity>
      </>
    );
  }

  it.each([
    ["sign-in", <SignInForm key="in" />],
    ["sign-up", <SignUpForm key="up" />],
  ])("forgets a half-typed password on %s", async (_name, form) => {
    setup(<Leavable>{form}</Leavable>);
    await type("Password", "half-typed-secret");

    await press("leave or return");
    await press("leave or return");

    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});

describe("returning to the password reset page", () => {
  it("starts again rather than still showing the last success", async () => {
    function Leavable() {
      const [hidden, setHidden] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setHidden((now) => !now)}>
            leave or return
          </button>
          <Activity mode={hidden ? "hidden" : "visible"}>
            <ForgotPasswordForm />
          </Activity>
        </>
      );
    }
    setup(<Leavable />);
    await type("Mobile number", "01712345678");
    await press("Send code");
    await userEvent.type(await screen.findByLabelText("Verification code"), "123456");
    await type("New password", "mango-canoe-71-lantern");
    await press("Change password");
    await screen.findByText(/Your password is changed/);

    await press("leave or return");
    await press("leave or return");

    expect(screen.queryByText(/Your password is changed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toHaveValue("");
  });
});

describe("forgot password", () => {
  async function askForCode() {
    await type("Mobile number", "01712345678");
    await press("Send code");
    await screen.findByLabelText("Verification code");
  }

  it("takes the code and a new password, then offers sign-in", async () => {
    const { sent } = setup(<ForgotPasswordForm />);
    await askForCode();

    expect(screen.getByText("If +8801712345678 has an account, a code is on its way.")).toBeInTheDocument();
    await type("Verification code", "123456");
    await type("New password", "mango-canoe-71-lantern");
    await press("Change password");

    expect(await screen.findByText(/Your password is changed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(sent(RESET)[0].body).toEqual({
      verification_id: verification().verification_id,
      code: "123456",
      new_password: "mango-canoe-71-lantern",
    });
  });

  it("shows why a new password was refused", async () => {
    setup(
      <ForgotPasswordForm />,
      signedOutServer({
        [RESET]: () =>
          failure(400, "VALIDATION_ERROR", {
            new_password: [{ code: "password_too_short", message: "x" }],
          }),
      }),
    );
    await askForCode();
    await type("Verification code", "123456");
    await type("New password", "short");

    await press("Change password");

    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
  });
});

describe("account panel", () => {
  const signedInServer = (extra: Routes = {}): Routes => ({
    "POST /api/v1/auth/refresh/": () => ({ body: SESSION }),
    "GET /api/v1/me/": () => ({ body: RAHIMA }),
    [LOGOUT]: () => ({ status: 204 }),
    ...extra,
  });

  it("offers sign-in and sign-up to a visitor", async () => {
    setup(<AccountPanel />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
  });

  it("shows who is signed in and lets them sign out", async () => {
    setup(<AccountPanel />, signedInServer());
    expect(await screen.findByText("Rahima Akhter")).toBeInTheDocument();
    expect(screen.getByText("+8801712345678")).toBeInTheDocument();
    expect(screen.getByText("Kapasia, Gazipur, Dhaka")).toBeInTheDocument();

    await press("Sign out");

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Rahima Akhter")).not.toBeInTheDocument();
  });

  it("offers to try again when it cannot tell who is signed in", async () => {
    let down = true;
    setup(
      <AccountPanel />,
      signedInServer({
        "POST /api/v1/auth/refresh/": () => (down ? failure(500, "ERROR") : { body: SESSION }),
      }),
    );
    expect(await screen.findByText("Couldn't check your sign-in.")).toBeInTheDocument();

    down = false;
    await press("Try again");

    expect(await screen.findByText("Rahima Akhter")).toBeInTheDocument();
  });

  it("does not pretend to have signed out when the API could not be told", async () => {
    setup(<AccountPanel />, signedInServer({ [LOGOUT]: () => failure(500, "ERROR") }));
    await screen.findByText("Rahima Akhter");

    await press("Sign out");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't sign out.");
    expect(screen.getByText("Rahima Akhter")).toBeInTheDocument();
  });
});
