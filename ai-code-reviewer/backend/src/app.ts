import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { reviewCode, testLlmConnection } from "./reviewer/service.js";
import { resolveSource } from "./input/source.js";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.js";
import { ReviewModel } from "./models/Review.js";

const app = express();
const maxCodeChars = Number(process.env.MAX_CODE_CHARS ?? 30000);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: "256kb" }));
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  limit: Number(process.env.RATE_LIMIT_MAX ?? 10),
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

const perUserReviewLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  limit: Number(process.env.USER_RATE_LIMIT_MAX ?? 5),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthenticatedRequest).userId;
    return userId ? `user:${userId}` : "unauthenticated";
  }
});

const analyzeInput = z.object({
  code: z.string().max(maxCodeChars).optional(),
  githubUrl: z.string().url().max(2048).optional(),
  language: z.string().trim().max(80).optional(),
  filename: z.string().trim().max(240).optional()
}).refine(data => Boolean(data.code?.trim()) !== Boolean(data.githubUrl?.trim()), {
  message: "Provide exactly one of code or githubUrl"
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "alta-ai-code-reviewer" }));

app.post("/api/test-llm", async (_req, res) => {
  try {
    const result = await testLlmConnection();
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM request failed";
    res.status(503).json({ success: false, error: message });
  }
});

app.post("/api/reviews/analyze", requireAuth, perUserReviewLimit, async (req: AuthenticatedRequest, res) => {
  const input = analyzeInput.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({ error: "Invalid review input", details: input.error.flatten() });
  }
  try {
    const source = await resolveSource(input.data);
    if (source.code.length > maxCodeChars) {
      return res.status(413).json({ error: "Code exceeds the configured size limit" });
    }
    const result = await reviewCode(source.code, input.data.language ?? source.language, input.data.filename ?? source.filename);
    const saved = await ReviewModel.create({
      userId: req.userId,
      filename: source.filename,
      language: input.data.language ?? source.language,
      sourceUrl: source.sourceUrl ?? null,
      code: source.code,
      report: result.report,
      model: result.model,
      usage: result.usage
    });
    return res.json({ success: true, reviewId: saved.id, source: { filename: source.filename, language: source.language, sourceUrl: source.sourceUrl }, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed";
    if (/GitHub|URL|empty|exactly one|size limit|Code cannot/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    const status = message.includes("OPENAI_API_KEY") ? 503 : 502;
    return res.status(status).json({ error: status === 503 ? message : "Unable to complete code review" });
  }
});

app.get("/api/reviews/history", requireAuth, async (req: AuthenticatedRequest, res) => {
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const [items, total] = await Promise.all([
    ReviewModel.find({ userId: req.userId }).select("-code").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ReviewModel.countDocuments({ userId: req.userId })
  ]);
  return res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

export default app;
