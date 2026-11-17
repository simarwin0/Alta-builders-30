import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 4001);

async function start() {
  if (process.env.MONGODB_URI) {
    await connectDatabase();
    console.log("MongoDB connected");
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI is required in production");
  } else {
    console.warn("MONGODB_URI is not set; authenticated review routes will be unavailable");
  }
  app.listen(port, "0.0.0.0", () => {
    console.log(`ALTA AI Code Reviewer API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error("API startup failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
