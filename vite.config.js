import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// VITE CONFIG
export default defineConfig({
  base: "/workout-app/",

  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString()),
  },

  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "recipe-ocr",
              priority: 20,
              test: /node_modules[\\/](?:tesseract\.js|tesseract\.js-core|bmp-js|idb-keyval|is-electron|regenerator-runtime|wasm-feature-detect|zlibjs)[\\/]/,
            },
          ],
        },
      },
    },
  },

  plugins: [
    react(),

    VitePWA({
      registerType: "prompt",

      includeAssets: ["icon-192.png", "icon-512.png"],

      manifest: {
        name: "Workout Tracker",

        short_name: "Workout",

        description: "Offline workout tracking",

        theme_color: "#ffffff",

        background_color: "#ffffff",

        display: "standalone",

        orientation: "portrait",

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

        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes("/workout-app/exercise-media/"),
            handler: "CacheFirst",
            options: {
              cacheName: "exercise-media-runtime",
              expiration: {
                maxEntries: 75,
                maxAgeSeconds: 60 * 24 * 60 * 60,
              },
            },
          },
        ],

        clientsClaim: false,

        skipWaiting: false,
      },
    }),
  ],
});
