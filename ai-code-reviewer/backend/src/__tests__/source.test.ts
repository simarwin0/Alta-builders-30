import test from "node:test";
import assert from "node:assert/strict";
import { resolveSource } from "../input/source.js";

test("accepts non-empty pasted code and infers language from filename", async () => {
  const result = await resolveSource({ code: "const answer = 42;", filename: "app.ts" });
  assert.equal(result.code, "const answer = 42;");
  assert.equal(result.language, "typescript");
});

test("rejects empty pasted code", async () => {
  await assert.rejects(() => resolveSource({ code: "   " }), /exactly one|Code cannot be empty/);
});

test("rejects when both input modes are supplied", async () => {
  await assert.rejects(() => resolveSource({ code: "const x = 1", githubUrl: "https://github.com/a/b/blob/main/x.js" }), /exactly one/);
});

test("rejects non-GitHub hosts", async () => {
  await assert.rejects(() => resolveSource({ githubUrl: "https://example.com/file.js" }), /GitHub/);
});

test("rejects non-HTTPS GitHub links", async () => {
  await assert.rejects(() => resolveSource({ githubUrl: "http://github.com/a/b/blob/main/x.js" }), /HTTPS/);
});

test("rejects URLs that do not point to a file", async () => {
  await assert.rejects(() => resolveSource({ githubUrl: "https://github.com/a/b" }), /file URL/);
});
