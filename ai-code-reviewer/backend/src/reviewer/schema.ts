import { z } from "zod";

export const FindingSchema = z.object({
  category: z.enum(["bug", "style", "security"]),
  severity: z.enum(["Low", "Medium", "High"]),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  line: z.number().int().positive().nullable(),
  suggestedFix: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});

export const ReviewReportSchema = z.object({
  summary: z.string().min(1).max(2000),
  overallRisk: z.enum(["Low", "Medium", "High"]),
  findings: z.array(FindingSchema).max(100),
  positives: z.array(z.string().max(500)).max(20),
});

export type ReviewReport = z.infer<typeof ReviewReportSchema>;

export const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "overallRisk", "findings", "positives"],
  properties: {
    summary: { type: "string" },
    overallRisk: { type: "string", enum: ["Low", "Medium", "High"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "title", "description", "line", "suggestedFix", "confidence"],
        properties: {
          category: { type: "string", enum: ["bug", "style", "security"] },
          severity: { type: "string", enum: ["Low", "Medium", "High"] },
          title: { type: "string" },
          description: { type: "string" },
          line: { type: ["integer", "null"] },
          suggestedFix: { type: "string" },
          confidence: { type: "number" }
        }
      }
    },
    positives: { type: "array", items: { type: "string" } }
  }
} as const;
