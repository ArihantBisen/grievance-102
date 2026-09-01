import "./lib/loadEnv";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4000);

createApp().listen(port, () => {
  console.log(`Ticketing Core API listening on :${port}`);
});
