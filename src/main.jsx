/* global __BUILD_TIME__ */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "./index.css";
import App from "./App.jsx";

const BUILD_TIME = __BUILD_TIME__;
const PENDING_UPDATE_KEY = "pendingPwaUpdate";
const UPDATE_CHECK_TIMEOUT = 5000;

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage:`, error);
  }
}

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
  safeSetLocalStorage(
    PENDING_UPDATE_KEY,
    JSON.stringify({
      buildTime: BUILD_TIME,
      checkedAt: Date.now(),
    }),
  );
}

function waitForInstallingWorker(registration) {
  if (registration.waiting) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;

    const settle = (hasUpdate) => {
      if (settled) return;

      settled = true;
      registration.removeEventListener("updatefound", handleUpdateFound);
      resolve(hasUpdate);
    };

    const timeout = setTimeout(() => settle(false), UPDATE_CHECK_TIMEOUT);

    function watchWorker(worker) {
      if (!worker) return;

      if (worker.state === "installed") {
        clearTimeout(timeout);
        settle(Boolean(navigator.serviceWorker.controller));
        return;
      }

      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") {
          clearTimeout(timeout);
          settle(Boolean(navigator.serviceWorker.controller));
        }
      });
    }

    function handleUpdateFound() {
      watchWorker(registration.installing);
    }

    registration.addEventListener("updatefound", handleUpdateFound);
    watchWorker(registration.installing);
  });
}

// REGISTER SERVICE WORKER
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    rememberPendingUpdate();
    emitPwaUpdateStatus("available");
  },
  onRegisteredSW(_swUrl, registration) {
    window.checkForAppUpdate = async ({
      applyUpdate = true,
      silent = false,
    } = {}) => {
      if (!registration) {
        return {
          status: "unsupported",
        };
      }

      try {
        if (!silent) {
          emitPwaUpdateStatus("checking");
        }

        const installingWorkerPromise = waitForInstallingWorker(registration);
        await registration.update();
        const hasUpdate =
          registration.waiting || (await installingWorkerPromise);

        if (hasUpdate) {
          rememberPendingUpdate();

          if (!applyUpdate) {
            emitPwaUpdateStatus("available");

            return {
              shouldReload: false,
              status: "available",
            };
          }

          updateSW(true);
          emitPwaUpdateStatus("found");

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
