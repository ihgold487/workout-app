import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const buildTime = new Date().toLocaleString();

function escapeHtmlAttribute(value) {
  return String(value).replace(/[&"]/g, (character) =>
    character === "&" ? "&amp;" : "&quot;"
  );
}

// VITE CONFIG
export default defineConfig(({ mode }) => {
  const isNative = mode === "native";

  return {
    base: isNative ? "./" : "/workout-app/",

    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
      __IS_NATIVE_BUILD__: JSON.stringify(isNative),
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
      {
        name: "workout-build-time-meta",
        transformIndexHtml(html) {
          return html
            .replace(
              '<meta name="color-scheme" content="light" />',
              `<meta name="color-scheme" content="light" />\n\n    <meta name="app-build-time" content="${escapeHtmlAttribute(buildTime)}" />`
            )
            .replace(
              "__STARTUP_WORKOUT_ICON__",
              isNative ? "workout-icon-native.png?v=5" : "workout-icon.png?v=4"
            );
        },
      },

      react(),

      VitePWA({
        disable: isNative,
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
  };
});
