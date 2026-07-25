import express from "express";
import { environment } from "./config.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "oshikatsu-api",
  });
});

app.listen(environment.PORT, "0.0.0.0", () => {
  console.log(`oshikatsu-api listening on port ${environment.PORT}`);
});
