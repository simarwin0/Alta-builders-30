import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";

declare global {
  namespace Express {
    interface Request { userId?: string; }
  }
}

export type AuthenticatedRequest = Request;

const sessionUserSchema = new Schema({
  sessionVersion: { type: Number, default: 0 }
}, { collection: "users", strict: false });
const SessionUser = mongoose.models.TrackASessionUser || mongoose.model("TrackASessionUser", sessionUserSchema);

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookieName = process.env.NODE_ENV === "production" ? "__Host-chat_session" : "chat_session";
  const token = cookieValue(req.headers.cookie, cookieName);
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "chat-app-api",
      audience: "chat-app-client"
    });
    if (typeof payload === "string" || typeof payload.sub !== "string" ||
        !Number.isInteger(payload.ver) || Number(payload.ver) < 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await SessionUser.findById(payload.sub).select("sessionVersion").lean() as { sessionVersion?: number } | null;
    if (!user || Number(user.sessionVersion ?? 0) !== Number(payload.ver)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
