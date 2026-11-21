import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// Vercel proxies /socket.io to the authenticated Railway API, so the default
// is same-origin. An explicit VITE_SOCKET_URL can still be used for alternate deployments.
const SOCKET_ORIGIN = (import.meta.env.VITE_SOCKET_URL || "").replace(/\/$/, "");

export function getSocket(): Socket {
  // The browser sends the HttpOnly session cookie; no JWT is exposed to JS.
  if (!socket) {
    socket = io(SOCKET_ORIGIN || undefined, {
      withCredentials: true,
      path: "/socket.io",
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
