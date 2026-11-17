import { lockAccount } from "./crypto";
const AUTH_FLAG = "chat_authenticated";
const REMEMBERED_AUTH_FLAG = "chat_remembered_auth";
// Route API requests through Vercel so the HttpOnly session cookie remains first-party.
const API_ORIGIN = "";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const isAuthenticated = () =>
  sessionStorage.getItem(AUTH_FLAG) === "1" || localStorage.getItem(REMEMBERED_AUTH_FLAG) === "1";

export const markAuthenticated = (rememberMe = false) => {
  sessionStorage.removeItem(AUTH_FLAG);
  localStorage.removeItem(REMEMBERED_AUTH_FLAG);
  if (rememberMe) localStorage.setItem(REMEMBERED_AUTH_FLAG, "1");
  else sessionStorage.setItem(AUTH_FLAG, "1");
};

export const clearSession = () => {
  sessionStorage.removeItem(AUTH_FLAG);
  localStorage.removeItem(REMEMBERED_AUTH_FLAG);
  lockAccount();
};

class ApiHealthError extends Error {}

export async function waitForApiReady(onStatus?: (message: string) => void): Promise<void> {
  const deadline = Date.now() + 90_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${API_ORIGIN}/api/health`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.status === "ok" && data?.checks?.database === "up") {
        return;
      }

      // A live API reporting a database failure is different from a sleeping
      // Render instance. Do not keep retrying a genuine dependency failure.
      if (response.status === 503 && data?.checks?.database === "down") {
        throw new ApiHealthError("Alta Chat's server is running, but its MongoDB connection is unhealthy. Your sign-in was not submitted and your account data was not changed. Please retry shortly.");
      }

      if (response.status === 502 || response.status === 503 || response.status === 504) {
        // Render can return an HTML loading/temporary-unavailable response
        // while a free instance is waking. Retry the health check, not login.
      } else if (response.status === 404) {
        throw new ApiHealthError("Alta Chat's backend health route could not be found. The frontend-to-backend deployment route needs attention.");
      } else if (response.ok) {
        throw new ApiHealthError("Alta Chat's backend returned an unexpected health response. Please retry.");
      } else {
        throw new ApiHealthError(typeof data?.error === "string" ? data.error : `The secure server health check returned HTTP ${response.status}.`);
      }
    } catch (error) {
      if (error instanceof ApiHealthError) throw error;
      // Network errors and request timeouts are retryable during a cold start.
    } finally {
      clearTimeout(timeout);
    }

    if (Date.now() >= deadline) break;
    onStatus?.(attempt === 1
      ? "Starting a secure connection…"
      : "Waking the secure server… This can take about a minute after inactivity.");
    await sleep(Math.min(5_000, 1_200 + attempt * 500));
  }

  throw new Error("Alta Chat's secure server did not become ready within 90 seconds. It may still be waking after inactivity. Wait a minute and try again. Your password and encrypted account data were not changed.");
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}/api${path}`, {
      ...options,
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("The connection to Alta Chat's secure server was interrupted. It may be waking after inactivity; wait a minute and retry.");
    }
    throw error;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : {};

  if (!res.ok) {
    if (res.status === 401) clearSession();
    const detail = data.fields ? (Object.values(data.fields) as string[][]).flat().join(". ") : "";
    const fallback = res.status === 502 || res.status === 503 || res.status === 504
      ? "Alta Chat's secure server is temporarily unavailable or waking up. Wait about a minute and try again."
      : res.status === 404
        ? "The requested backend route was not found. The deployment may be out of sync."
        : `Alta Chat's server returned HTTP ${res.status}. Please retry.`;
    throw new Error(detail || (typeof data.error === "string" ? data.error : fallback));
  }

  return data as T;
}
