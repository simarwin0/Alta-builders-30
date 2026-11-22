import { createServer } from "http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db.js";
import { attachSocket } from "./socket.js";

const httpServer = createServer(createApp());
attachSocket(httpServer);

let shuttingDown = false;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Keep the HTTP listener available while MongoDB reconnects. Render checks for
 * an open port during deploy; waiting for Atlas before listen can make a healthy
 * code build look like a failed service deploy when Atlas is briefly unreachable.
 * The /api/health endpoint still reports database readiness independently.
 */
async function connectDatabaseUntilReady() {
  let delayMs = 2000;
  while (!shuttingDown) {
    try {
      await connectDb(config.mongoUri, 1, 0);
      console.log("MongoDB connection ready");
      return;
    } catch (err: unknown) {
      const error = err instanceof Error
        ? err as Error & { code?: number | string; codeName?: string }
        : null;
      console.error("MongoDB is not ready; retrying in the background:", {
        name: error?.name ?? "unknown error",
        code: error?.code,
        codeName: error?.codeName,
      });
      await wait(delayMs);
      delayMs = Math.min(30000, Math.round(delayMs * 1.5));
    }
  }
}

async function shutdown() {
  shuttingDown = true;
  httpServer.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

httpServer.on("error", (error) => {
  console.error("HTTP server failed to listen:", error.name);
  process.exit(1);
});

httpServer.listen(config.port, "0.0.0.0", () => {
  console.log("API listening on port", config.port, "(" + config.env + ")");
  void connectDatabaseUntilReady();
});
