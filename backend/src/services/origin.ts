import { config } from "../config.js";

// Allow the configured canonical origin and only this Vercel project's own
// production/preview hostnames. Vercel preview deployments use unique hostnames;
// without this project-scoped pattern the strict CSRF guard rejects their POSTs.
export function isTrustedClientOrigin(origin: string): boolean {
  if (origin === config.clientOrigin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "alta-chat-frontend.vercel.app"
      || host === "alta-chat-frontend-indermohanluthra97752-9682.vercel.app"
      || host === "alta-chat-frontend-git-main-indermohanluthra97752-9682.vercel.app") {
      return true;
    }
    return /^alta-chat-frontend-[a-z0-9-]+-indermohanluthra97752-9682\.vercel\.app$/.test(host);
  } catch {
    return false;
  }
}

