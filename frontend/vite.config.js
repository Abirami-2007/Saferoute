import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "SafeRoute",
        short_name: "SafeRoute",
        description: "Safety-aware navigation for women",
        theme_color: "#6D28D9",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Cache map tiles and API GET responses so the app is still
        // somewhat usable on a flaky connection.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/\{s\}\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "map-tiles", expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
