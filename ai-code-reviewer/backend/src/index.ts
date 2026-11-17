import "dotenv/config";
import app from "./app.js";

const port = Number(process.env.PORT ?? 4001);
app.listen(port, "0.0.0.0", () => {
  console.log(`ALTA AI Code Reviewer API listening on port ${port}`);
});
