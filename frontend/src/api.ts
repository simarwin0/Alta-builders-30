import { lockAccount } from "./crypto";
const AUTH_FLAG = "chat_authenticated";
const REMEMBERED_AUTH_FLAG = "chat_remembered_auth";
// Route API requests through Vercel so the HttpOnly session cookie remains first-party.
const API_ORIGIN = "";

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

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_ORIGIN}/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearSession();
    const detail = data.fields ? (Object.values(data.fields) as string[][]).flat().join(". ") : "";
    throw new Error(detail || (typeof data.error === "string" ? data.error : "Request failed"));
  }
  return data;
}
