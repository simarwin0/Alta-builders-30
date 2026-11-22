import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/**
 * Use the current site origin. Production Vercel rewrites /socket.io to Render;
 * local Vite proxies the same path to localhost:4000.
 * The HttpOnly session cookie remains first-party; no JWT is exposed to JS.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(undefined, {
      withCredentials: true,
      path: "/socket.io",
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 12000,
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
