import webpush from "web-push";
import { config } from "../config.js";
import { NotificationModel, PushSubscriptionModel } from "../models/notifications.js";
import { RoomModel } from "../models/schemas.js";
import { emitUserEvent } from "./realtime.js";

const pushReady = Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
if (pushReady) {
  webpush.setVapidDetails(config.vapidSubject!, config.vapidPublicKey!, config.vapidPrivateKey!);
}

type NoticeInput = {
  userId: string;
  type: "message" | "join_request" | "member_joined";
  title: string;
  body: string;
  roomId?: string | null;
  actorName?: string | null;
};

export async function createNotification(input: NoticeInput) {
  const notice = await NotificationModel.create({
    user: input.userId, type: input.type, title: input.title, body: input.body,
    roomId: input.roomId ?? null, actorName: input.actorName ?? null,
  });

  // Publish notification metadata only; encrypted message content stays client-side.
  emitUserEvent(input.userId, "notification:new", {
    id: String(notice._id),
    type: input.type,
    title: input.title,
    body: input.body,
    room_id: input.roomId ?? null,
    actor_name: input.actorName ?? null,
    read_at: null,
    created_at: notice.createdAt,
  });

  const subscriptions = pushReady ? await PushSubscriptionModel.find({ user: input.userId }).lean() : [];
  await Promise.all(subscriptions.map(async (subscription: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify({ title: input.title, body: input.body, url: input.roomId ? `/rooms/${input.roomId}` : "/" }),
        { TTL: 60 * 60 },
      );
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await PushSubscriptionModel.deleteOne({ _id: subscription._id });
      } else {
        console.warn("Push notification delivery failed:", error?.statusCode ?? "unknown");
      }
    }
  }));
  return notice;
}

export async function notifyRoomMembers(roomId: string, senderId: string) {
  const room = await RoomModel.findById(roomId).select("members").lean() as any;
  if (!room) return;
  const recipients = room.members
    .filter((member: any) => String(member.user) !== senderId && !member.isMuted)
    .map((member: any) => String(member.user));
  await Promise.all(recipients.map((userId: string) => createNotification({
    userId, type: "message", title: "New message", body: "You have a new encrypted message.",
    roomId,
  })));
}
