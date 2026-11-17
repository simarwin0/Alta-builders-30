import test from "node:test";
import assert from "node:assert/strict";
import { resolveReviewSource } from "../services/aiReviewer.js";

test("resolves pasted source and infers language from filename", async () => {
  const source = await resolveReviewSource({ code: "const answer = 42;", filename: "answer.ts" });
  assert.equal(source.code, "const answer = 42;");
  assert.equal(source.language, "typescript");
  assert.equal(source.filename, "answer.ts");
});

test("rejects an empty source submission", async () => {
  await assert.rejects(() => resolveReviewSource({ code: " " }), /exactly one|empty/i);
});

test("requires exactly one input mode", async () => {
  await assert.rejects(
    () => resolveReviewSource({ code: "const x = 1", githubUrl: "https://github.com/example/repo/blob/main/a.js" }),
    /exactly one/
  );
});

test("rejects arbitrary external URLs", async () => {
  await assert.rejects(() => resolveReviewSource({ githubUrl: "https://example.com/payload.js" }), /GitHub/);
});

test("rejects insecure GitHub URLs", async () => {
  await assert.rejects(() => resolveReviewSource({ githubUrl: "http://github.com/example/repo/blob/main/a.js" }), /HTTPS/);
});
