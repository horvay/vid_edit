import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const convexUrl = env.VITE_CONVEX_URL || "http://127.0.0.1:3210";
  const mediaUrl = `http://127.0.0.1:${env.MEDIA_PORT || 5181}`;
  // The browser reaches Convex and the media server through this one origin,
  // so only one port has to be published (see README).
  const proxy = {
    "/api": { target: convexUrl, ws: true, changeOrigin: true },
    "/media": { target: mediaUrl, changeOrigin: true },
  };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Only on localhost: Tailscale serves it to the TailNet over HTTPS at
      // https://<machine>.<tailnet>.ts.net:5180 (see README).
      host: env.HOST || "127.0.0.1",
      port: Number(env.PORT || 5180),
      strictPort: true,
      allowedHosts: true,
      proxy,
    },
    preview: {
      host: env.HOST || "127.0.0.1",
      port: Number(env.PORT || 5180),
      strictPort: true,
      allowedHosts: true,
      proxy,
    },
  };
});
