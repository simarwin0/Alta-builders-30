import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { AiReviewModel } from "../models/aiReview.js";
import { analyzeSource, resolveReviewSource, testReviewerConnection } from "../services/aiReviewer.js";

export const aiReviewsRouter = Router();
const maxChars = Number(process.env.MAX_REVIEW_CODE_CHARS ?? 30000);
const reviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: req => (req as AuthedRequest).userId ?? "unauthenticated",
  message: { error: "Review limit reached. Please try again in a minute." }
});

const inputSchema = z.object({
  code: z.string().max(maxChars).optional(),
  githubUrl: z.string().url().max(2048).optional(),
  language: z.string().trim().max(80).optional(),
  filename: z.string().trim().max(240).optional()
}).refine(input => Boolean(input.code?.trim()) !== Boolean(input.githubUrl?.trim()), {
  message: "Provide exactly one of code or githubUrl"
});

aiReviewsRouter.post("/test-llm", requireAuth, async (_req, res) => {
  try {
    res.json({ success: true, ...await testReviewerConnection() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM connection failed";
    res.status(503).json({ success: false, error: message });
  }
});

aiReviewsRouter.post("/analyze", requireAuth, reviewLimiter, async (req: AuthedRequest, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid review input", details: parsed.error.flatten() });
  try {
    const source = await resolveReviewSource(parsed.data);
    if (source.code.length > maxChars) return res.status(413).json({ error: "Code exceeds the configured size limit" });
    const result = await analyzeSource(source.code, source.language, source.filename);
    const saved = await AiReviewModel.create({
      userId: req.userId,
      filename: source.filename,
      language: source.language,
      sourceUrl: source.sourceUrl,
      code: source.code,
      report: result.report,
      model: result.model,
      usage: result.usage
    });
    if (result.usage) console.info("ai_review_usage", { model: result.model, ...result.usage });
    return res.json({ success: true, reviewId: saved.id, source: { filename: source.filename, language: source.language, sourceUrl: source.sourceUrl }, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed";
    if (/GitHub|URL|empty|exactly one|size limit|Code cannot/i.test(message)) return res.status(400).json({ error: message });
    if (message.includes("OPENAI_API_KEY")) return res.status(503).json({ error: message });
    console.error("AI review failed:", error instanceof Error ? error.name : "UnknownError");
    return res.status(502).json({ error: "Unable to complete code review" });
  }
});

aiReviewsRouter.get("/history", requireAuth, async (req: AuthedRequest, res) => {
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const [items, total] = await Promise.all([
    AiReviewModel.find({ userId: req.userId }).select("-code").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AiReviewModel.countDocuments({ userId: req.userId })
  ]);
  return res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});
