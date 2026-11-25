/** Where the Django API is, as seen from this app's server (no trailing slash). */
export function serverApiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
}
