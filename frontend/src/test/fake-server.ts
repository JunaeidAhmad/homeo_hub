import type { Transport } from "@/areas/patient/session/SessionProvider";

export type Call = { method: string; path: string; body: unknown; headers: Headers };
type Reply = { status?: number; body?: unknown };
export type Routes = Record<string, (call: Call) => Reply | Promise<Reply>>;

/** A pretend API at the network boundary. Keys look like "POST /api/v1/auth/refresh/". */
export function fakeServer(routes: Routes) {
  const calls: Call[] = [];
  const transport: Transport = {
    baseUrl: "http://api.test",
    fetch: async (request: Request) => {
      const text = await request.text();
      const call = {
        method: request.method,
        path: new URL(request.url).pathname,
        body: text ? JSON.parse(text) : undefined,
        headers: request.headers,
      };
      calls.push(call);
      const handler = routes[`${call.method} ${call.path}`];
      const { status = 200, body } = handler
        ? await handler(call)
        : { status: 404, body: { error: { code: "NOT_FOUND" } } };
      return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  const sent = (route: string) => calls.filter((c) => `${c.method} ${c.path}` === route);
  return { transport, calls, sent };
}

export const failure = (status: number, code: string, details: object = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: "test" } },
});

export const SESSION = { access_token: "access-1", expires_in: 900, user_type: "patient" };

export const RAHIMA = {
  id: "p1",
  user_type: "patient",
  phone: "+8801712345678",
  phone_verified: true,
  full_name: "Rahima Akhter",
  gender: "FEMALE",
  date_of_birth: "1992-11-25",
  age: 34,
  location: {
    id: "loc1",
    division: "Dhaka",
    district: "Gazipur",
    upazila: "Kapasia",
    display_name: "Kapasia, Gazipur, Dhaka",
  },
  preferred_language: "en",
};
