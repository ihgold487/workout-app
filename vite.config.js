import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// VITE CONFIG
export default defineConfig({
  base: "/workout-app/",

  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString()),
  },

  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: ["icon-192.png", "icon-512.png"],

      manifest: {
        name: "Workout Tracker",

        short_name: "Workout",

        description: "Offline workout tracking",

        theme_color: "#ffffff",

        background_color: "#ffffff",

        display: "standalone",

        scope: "./",

        start_url: "./",

        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },

          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],

        cleanupOutdatedCaches: true,

        clientsClaim: true,

        skipWaiting: true,
      },
    }),
  ],
});
