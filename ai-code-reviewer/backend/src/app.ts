import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { reviewCode, testLlmConnection } from "./reviewer/service.js";
import { resolveSource } from "./input/source.js";

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

app.post("/api/reviews/analyze", async (req, res) => {
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
    return res.json({ success: true, source: { filename: source.filename, language: source.language, sourceUrl: source.sourceUrl }, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed";
    if (/GitHub|URL|empty|exactly one|size limit|Code cannot/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    const status = message.includes("OPENAI_API_KEY") ? 503 : 502;
    return res.status(status).json({ error: status === 503 ? message : "Unable to complete code review" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

export default app;
