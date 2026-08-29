import cors from "cors";
import express from "express";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { identitiesRouter } from "./routes/identities";
import { resolversRouter } from "./routes/resolvers";
import { teamsRouter } from "./routes/teams";
import { ticketsRouter } from "./routes/tickets";
import { webhookRouter } from "./routes/webhook";
import { errorHandler } from "./middleware/errorHandler";
import { captureRawBody } from "./lib/rawBody";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ verify: captureRawBody }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", authRouter);
  app.use("/api", ticketsRouter);
  app.use("/api", categoriesRouter);
  app.use("/api", identitiesRouter);
  app.use("/api", resolversRouter);
  app.use("/api", teamsRouter);
  // Scoped to /api/admin, not /api — see the comment on adminRouter's definition for
  // why: a router-level .use(middleware) with no path runs for any request that falls
  // through to it, not just requests matching its own routes, so this would otherwise
  // gate every router mounted after it too.
  app.use("/api/admin", adminRouter);
  app.use("/api", webhookRouter);

  app.use(errorHandler);

  return app;
}
