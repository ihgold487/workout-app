/* global __BUILD_TIME__ */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "./index.css";
import App from "./App.jsx";

const BUILD_TIME = __BUILD_TIME__;
const PENDING_UPDATE_KEY = "pendingPwaUpdate";

function emitPwaUpdateStatus(status) {
  window.dispatchEvent(
    new CustomEvent("pwa-update-status", {
      detail: {
        status,
      },
    }),
  );
}

function rememberPendingUpdate() {
  localStorage.setItem(
    PENDING_UPDATE_KEY,
    JSON.stringify({
      buildTime: BUILD_TIME,
      checkedAt: Date.now(),
    }),
  );
}

// REGISTER SERVICE WORKER
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    window.checkForAppUpdate = async () => {
      if (!registration) {
        return {
          status: "unsupported",
        };
      }

      try {
        emitPwaUpdateStatus("checking");
        await registration.update();

        if (registration.waiting) {
          rememberPendingUpdate();
          emitPwaUpdateStatus("found");
          updateSW(true);

          return {
            shouldReload: true,
            status: "found",
          };
        }

        return {
          status: "current",
        };
      } catch (error) {
        console.error("PWA update check failed:", error);

        return {
          status: "error",
        };
      }
    };
  },
  onRegisterError(error) {
    console.error("PWA registration failed:", error);
    emitPwaUpdateStatus("error");
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
