import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, enum: ["message", "join_request", "member_joined"], required: true },
  title: { type: String, required: true, maxlength: 100 },
  body: { type: String, required: true, maxlength: 180 },
  roomId: { type: String, default: null, maxlength: 64 },
  actorName: { type: String, default: null, maxlength: 30 },
  readAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
notificationSchema.index({ user: 1, createdAt: -1 });

const pushSubscriptionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, index: true },
  endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 256 },
    auth: { type: String, required: true, maxlength: 256 },
  },
}, { timestamps: true });

export const NotificationModel = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export const PushSubscriptionModel = mongoose.models.PushSubscription || mongoose.model("PushSubscription", pushSubscriptionSchema);
