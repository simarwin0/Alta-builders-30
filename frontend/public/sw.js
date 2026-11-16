self.addEventListener("push", (event) => {
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(typeof data.title === "string" ? data.title : "Alta Chat", { body: typeof data.body === "string" ? data.body : "You have a new notification.", icon: "/alta-chat-icon.svg", badge: "/alta-chat-icon.svg", tag: "alta-chat-notification", data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" }, renotify: true }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => { const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true }); for (const client of clientsList) { if (client.url.startsWith(self.location.origin) && "focus" in client) { await client.navigate(target); return client.focus(); } } return self.clients.openWindow(target); })());
});
