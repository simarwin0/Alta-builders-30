import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Notice = { id: string; type: string; title: string; body: string; room_id: string | null; read_at: string | null; created_at: string };

function decodeKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0));
}

export default function NotificationBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ items: Notice[]; unread: number }>("/notifications");
      setItems(result.items); setUnread(result.unread);
    } catch { /* Session may have expired; the app's auth guard handles it. */ }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 12000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      setPushEnabled(Boolean(subscription));
    }).catch(() => setPushEnabled(false));
  }, []);

  async function enablePush() {
    if (busy || !("Notification" in window) || !("serviceWorker" in navigator)) return;
    setBusy(true);
    try {
      const config = await api<{ enabled: boolean; publicKey: string | null }>("/notifications/push/public-key");
      if (!config.enabled || !config.publicKey) throw new Error("Background push is not configured on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to continue.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.publicKey) });
      await api("/notifications/push/subscriptions", { method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys }) });
      setPushEnabled(true);
    } catch (error) {
      window.alert((error as Error).message || "Could not enable push notifications.");
    } finally { setBusy(false); }
  }

  async function disablePush() {\n    if (busy || !("serviceWorker" in navigator)) return;\n    setBusy(true);\n    try {\n      const registration = await navigator.serviceWorker.getRegistration("/");\n      const subscription = await registration?.pushManager.getSubscription();\n      if (subscription) {\n        await api("/notifications/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });\n        await subscription.unsubscribe();\n      }\n      setPushEnabled(false);\n    } catch (error) { window.alert((error as Error).message || "Could not disable push notifications."); }\n    finally { setBusy(false); }\n  }\n\n  async function markAllRead() {
    await api("/notifications/read-all", { method: "PATCH" });
    await refresh();
  }

  async function dismiss(id: string) {
    await api(`/notifications/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="notification-wrap">
      <button type="button" className="icon-button notification-trigger" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }}>
        ♧{unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <section className="notification-popover" aria-label="Notifications">
        <header className="notification-heading"><div><strong>Notifications</strong><small>{unread} unread</small></div><button type="button" className="text-action" onClick={() => void markAllRead()} disabled={!unread}>Mark all read</button></header>
        <div className="notification-list">
          {items.length === 0 ? <p className="notification-empty">You're all caught up.</p> : items.map((item) => (
            <article className={`notification-item ${item.read_at ? "" : "unread"}`} key={item.id}>
              <div className="notification-copy"><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
              {item.room_id ? <Link to={`/rooms/${item.room_id}`} onClick={() => { void api(`/notifications/${item.id}/read`, { method: "PATCH" }).then(refresh); setOpen(false); }}>Open</Link> : null}
              <button type="button" className="notification-dismiss" aria-label="Dismiss notification" onClick={() => void dismiss(item.id)}>×</button>
            </article>
          ))}
        </div>
        <footer className="notification-footer">
          <span>{pushEnabled ? "Desktop push enabled" : "Desktop push is off"}</span>
          {!pushEnabled && <button type="button" className="text-action" disabled={busy} onClick={() => void enablePush()}>{busy ? "Enabling…" : "Enable desktop alerts"}</button>}
          {pushEnabled && <button type="button" className="text-action" disabled={busy} onClick={() => void disablePush()}>Disable desktop alerts</button>}
        </footer>
      </section>}
    </div>
  );
}
