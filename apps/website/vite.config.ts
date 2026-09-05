import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind on 0.0.0.0, not just localhost — a phone opening the WhatsApp
    // submission link needs to reach this over the LAN, not just this machine itself
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
