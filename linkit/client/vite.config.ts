import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Resolve workspace "shared" import to source during dev
      shared: path.resolve(__dirname, "../shared/src/schemas"),
    },
  },
  server: {
    port: 5173,
    host: true,   // expose on LAN for Phase 7 cross-device QA (192.168.x.x:5173)
    proxy: {
      // Proxy Socket.IO to the Express server during dev
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
