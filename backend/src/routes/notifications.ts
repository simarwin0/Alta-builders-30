import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { NotificationModel, PushSubscriptionModel } from "../models/notifications.js";
import { config } from "../config.js";
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get("/", async (req: AuthedRequest, res) => {
  const items = await NotificationModel.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).lean() as any[];
  const unread = await NotificationModel.countDocuments({ user: req.userId, readAt: null });
  res.json({ items: items.map((item) => ({ id: String(item._id), type: item.type, title: item.title, body: item.body, room_id: item.roomId ?? null, actor_name: item.actorName ?? null, read_at: item.readAt ?? null, created_at: item.createdAt })), unread });
});
notificationsRouter.patch("/read-all", async (req: AuthedRequest, res) => { await NotificationModel.updateMany({ user: req.userId, readAt: null }, { $set: { readAt: new Date() } }); res.json({ success: true }); });
notificationsRouter.patch("/:id/read", async (req: AuthedRequest, res) => {
  const result = await NotificationModel.updateOne({ _id: req.params.id, user: req.userId, readAt: null }, { $set: { readAt: new Date() } });
  if (!result.matchedCount) return res.status(404).json({ error: "Notification not found" });
  res.json({ success: true });
});
notificationsRouter.delete("/:id", async (req: AuthedRequest, res) => { await NotificationModel.deleteOne({ _id: req.params.id, user: req.userId }); res.status(204).end(); });
notificationsRouter.get("/push/public-key", (_req, res) => res.json({ enabled: Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject), publicKey: config.vapidPublicKey ?? null }));
const subscriptionSchema = z.object({ endpoint: z.string().url().max(2048).refine((value) => value.startsWith("https://"), "Push endpoint must use HTTPS"), keys: z.object({ p256dh: z.string().min(20).max(256), auth: z.string().min(10).max(256) }).strict() }).strict();
notificationsRouter.post("/push/subscriptions", async (req: AuthedRequest, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid push subscription" });
  await PushSubscriptionModel.findOneAndUpdate({ endpoint: parsed.data.endpoint }, { $set: { user: req.userId, endpoint: parsed.data.endpoint, keys: parsed.data.keys } }, { upsert: true, new: true, runValidators: true });
  res.status(201).json({ success: true });
});
notificationsRouter.delete("/push/subscriptions", async (req: AuthedRequest, res) => {
  const parsed = z.object({ endpoint: z.string().url().max(2048) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid push subscription" });
  await PushSubscriptionModel.deleteOne({ user: req.userId, endpoint: parsed.data.endpoint }); res.status(204).end();
});
