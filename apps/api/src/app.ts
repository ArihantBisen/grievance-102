import cors from "cors";
import express from "express";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { identitiesRouter } from "./routes/identities";
import { resolversRouter } from "./routes/resolvers";
import { teamsRouter } from "./routes/teams";
import { ticketsRouter } from "./routes/tickets";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", authRouter);
  app.use("/api", ticketsRouter);
  app.use("/api", categoriesRouter);
  app.use("/api", identitiesRouter);
  app.use("/api", resolversRouter);
  app.use("/api", teamsRouter);
  app.use("/api", adminRouter);

  app.use(errorHandler);

  return app;
}
