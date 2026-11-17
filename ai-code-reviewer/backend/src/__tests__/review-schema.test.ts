import test from "node:test";
import assert from "node:assert/strict";
import { ReviewReportSchema } from "../reviewer/schema.js";

test("accepts a valid structured report with severity and actionable fix", () => {
  const report = ReviewReportSchema.parse({
    summary: "One security issue was found.",
    overallRisk: "High",
    findings: [{
      category: "security",
      severity: "High",
      title: "SQL injection",
      description: "Untrusted input is concatenated into SQL.",
      line: 4,
      suggestedFix: "Use a parameterized query.",
      confidence: 0.98
    }],
    positives: ["The function is small and easy to follow."]
  });
  assert.equal(report.findings[0].severity, "High");
});

test("rejects unknown severity labels", () => {
  const result = ReviewReportSchema.safeParse({
    summary: "Bad severity.",
    overallRisk: "Critical",
    findings: [],
    positives: []
  });
  assert.equal(result.success, false);
});

test("rejects confidence values outside the 0..1 range", () => {
  const result = ReviewReportSchema.safeParse({
    summary: "Bad confidence.",
    overallRisk: "Low",
    findings: [{
      category: "bug",
      severity: "Low",
      title: "Potential issue",
      description: "Description",
      line: null,
      suggestedFix: "Fix it",
      confidence: 1.5
    }],
    positives: []
  });
  assert.equal(result.success, false);
});
