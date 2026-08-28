import cors from "cors";
import express from "express";
import { categoriesRouter } from "./routes/categories";
import { ticketsRouter } from "./routes/tickets";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", ticketsRouter);
  app.use("/api", categoriesRouter);

  app.use(errorHandler);

  return app;
}
