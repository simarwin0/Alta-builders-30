const MAX_BYTES = Number(process.env.MAX_CODE_CHARS ?? 30000) * 4;
const FETCH_TIMEOUT_MS = 12000;

export type ResolvedSource = {
  code: string;
  filename: string;
  language: string;
  sourceUrl?: string;
};

function languageFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", java: "java", go: "go", rs: "rust", cpp: "cpp", c: "c",
    cs: "csharp", php: "php", rb: "ruby", sql: "sql", html: "html", css: "css"
  };
  return extension ? map[extension] ?? "unknown" : "unknown";
}

function toRawGithubUrl(input: string): { url: URL; filename: string } {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Enter a valid public GitHub file URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Only HTTPS public GitHub file URLs are supported");
  }

  const segments = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parsed.hostname === "raw.githubusercontent.com") {
    if (segments.length < 4) throw new Error("The GitHub URL must point to a file");
    const filename = segments.at(-1)!;
    return { url: new URL(parsed.toString()), filename };
  }
  if (parsed.hostname !== "github.com" || segments.length < 5 || segments[2] !== "blob") {
    throw new Error("Use a GitHub.com owner/repository/blob/branch/file URL or raw.githubusercontent.com URL");
  }

  const [owner, repository, , ref, ...fileParts] = segments;
  if (!owner || !repository || !ref || fileParts.length === 0 || fileParts.some(p => p === "." || p === "..")) {
    throw new Error("The GitHub URL must point to a file in a public repository");
  }
  const rawPath = [owner, repository, ref, ...fileParts].map(encodeURIComponent).join("/");
  const filename = fileParts.at(-1)!;
  return { url: new URL(`https://raw.githubusercontent.com/${rawPath}`), filename };
}

export async function resolveSource(input: {
  code?: string;
  githubUrl?: string;
  language?: string;
  filename?: string;
}): Promise<ResolvedSource> {
  if (Boolean(input.code?.trim()) === Boolean(input.githubUrl?.trim())) {
    throw new Error("Provide exactly one of code or githubUrl");
  }
  if (input.code !== undefined) {
    const code = input.code.trim();
    if (!code) throw new Error("Code cannot be empty");
    if (code.length > Number(process.env.MAX_CODE_CHARS ?? 30000)) throw new Error("Code exceeds the configured size limit");
    const filename = input.filename?.trim() || "pasted-code";
    return { code, filename, language: input.language?.trim() || languageFromFilename(filename) };
  }

  const { url, filename } = toRawGithubUrl(input.githubUrl!);
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/plain, application/octet-stream" }
  });
  if (!response.ok) throw new Error(response.status === 404 ? "GitHub file not found or repository is private" : "Unable to fetch the GitHub file");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("GitHub file exceeds the configured size limit");
  const code = await response.text();
  if (!code.trim()) throw new Error("The GitHub file is empty");
  if (code.length > Number(process.env.MAX_CODE_CHARS ?? 30000)) throw new Error("GitHub file exceeds the configured size limit");
  return { code, filename, language: languageFromFilename(filename), sourceUrl: input.githubUrl };
}
