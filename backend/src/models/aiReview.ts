import mongoose, { Schema } from "mongoose";

const findingSchema = new Schema({
  category: { type: String, enum: ["bug", "style", "security"], required: true },
  severity: { type: String, enum: ["Low", "Medium", "High"], required: true },
  title: { type: String, required: true, maxlength: 160 },
  description: { type: String, required: true, maxlength: 2000 },
  line: { type: Number, default: null },
  suggestedFix: { type: String, required: true, maxlength: 2000 },
  confidence: { type: Number, min: 0, max: 1, required: true }
}, { _id: false });

const aiReviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  filename: { type: String, required: true, maxlength: 240 },
  language: { type: String, required: true, maxlength: 80 },
  sourceUrl: { type: String, default: null, maxlength: 2048 },
  code: { type: String, required: true, maxlength: 120000 },
  report: {
    summary: { type: String, required: true },
    overallRisk: { type: String, enum: ["Low", "Medium", "High"], required: true },
    findings: { type: [findingSchema], default: [] },
    positives: { type: [String], default: [] }
  },
  model: { type: String, required: true },
  usage: {
    inputTokens: Number,
    outputTokens: Number,
    totalTokens: Number
  }
}, { timestamps: true, collection: "ai_code_reviews" });

aiReviewSchema.index({ userId: 1, createdAt: -1 });
export const AiReviewModel = mongoose.models.AiCodeReview || mongoose.model("AiCodeReview", aiReviewSchema);
