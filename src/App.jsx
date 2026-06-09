/* global __BUILD_TIME__ */
import { useState, useEffect } from "react";
import { ClipboardList, Dumbbell, Home, Settings, Utensils } from "lucide-react";
import { seedExercises } from "./data/seedExercises";
import TemplateView from "./components/TemplateView";
import SessionView from "./components/SessionView";
import HistoryView from "./components/HistoryView";
import ExerciseView from "./components/ExerciseView";
import PlansView from "./components/PlansView";
import NutritionView from "./components/NutritionView";
import WorkoutCalendar from "./components/WorkoutCalendar";
import {
  clearLegacyEquipmentStorage,
  createWorkoutBackup,
  getSavedStorageVersion,
  getWorkoutDataSummary,
  loadWorkoutData,
  loadWorkoutDataFromIndexedDb,
  markStorageVersion,
  parseWorkoutBackup,
  saveWorkoutData,
  saveWorkoutDataToIndexedDb,
} from "./storage/workoutStorage";
import {
  getCurrentSession,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
} from "./sync/auth";
import { isSupabaseConfigured } from "./sync/supabaseClient";
import {
  downloadWorkoutSnapshot,
  uploadWorkoutSnapshot,
} from "./sync/workoutCloudSnapshot";
import {
  getCustomExercises,
  uploadCustomExercises,
} from "./sync/exerciseCloudSync";
import { uploadWorkouts } from "./sync/workoutCloudSync";
import { uploadWorkoutHistory } from "./sync/sessionCloudSync";
import { getNormalizedCloudSummary } from "./sync/normalizedCloudSummary";

// STORAGE VERSION
const STORAGE_VERSION = 10;

const APP_VERSION = "0.16";

const BUILD_TIME = __BUILD_TIME__;

const PENDING_UPDATE_KEY = "pendingPwaUpdate";
const LAST_SEEN_BUILD_KEY = "lastSeenBuildTime";
const UPDATE_CONFIRMATION_KEY = "pwaUpdateConfirmation";
const UPDATE_CONFIRMATION_DURATION = 10 * 60 * 1000;
const LAST_AUTO_UPDATE_CHECK_KEY = "lastAutoPwaUpdateCheck";
const AUTO_UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;

const UPDATE_STATUS_COPY = {
  available: "Update available. Tap Update to install it.",
  checking: "Checking for update...",
  current: "No new build found.",
  error: "Update check failed. Try closing and reopening the app.",
  found: "Update found. Reloading...",
  unsupported: "Updates are unavailable in this browser.",
};

const BUILD_NOTICE_COPY = {
  updated: "Updated to the latest build.",
};

function formatBackupSummary(summary) {
  return `${summary.templates} templates, ${summary.customExercises} custom exercises, ${summary.history} completed workouts`;
}

function formatNormalizedSummary(summary) {
  const latest = summary.latestSession
    ? ` Latest: ${summary.latestSession.workout_name} on ${new Date(
        summary.latestSession.completed_at
      ).toLocaleDateString()}.`
    : "";
  const maxE1RM =
    summary.maxE1RM == null ? "" : ` Max e1RM stored: ${summary.maxE1RM.toFixed(1)}.`;

  return `${summary.exercises} exercises, ${summary.workouts} workouts, ${summary.workoutSessions} completed workouts, ${summary.sessionSets} completed sets.${latest}${maxE1RM}`;
}

const backupButtonStyle = {
  alignItems: "center",
  appearance: "none",
  background: "buttonface",
  border: "1px solid #888",
  borderRadius: "4px",
  boxSizing: "border-box",
  color: "buttontext",
  cursor: "pointer",
  display: "inline-flex",
  font: "inherit",
  gap: "4px",
  justifyContent: "center",
  lineHeight: 1.2,
  margin: 0,
  minHeight: "32px",
  padding: "4px 8px",
};

const bottomNavButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  display: "flex",
  flex: 1,
  flexDirection: "column",
  fontSize: "11px",
  gap: "3px",
  minHeight: "46px",
  padding: "5px 4px",
};

const activeBottomNavButtonStyle = {
  ...bottomNavButtonStyle,
  color: "var(--accent)",
  fontWeight: "bold",
};

function getInitialBuildNotice() {
  const lastSeenBuildTime = localStorage.getItem(LAST_SEEN_BUILD_KEY);
  const pendingUpdate = JSON.parse(
    localStorage.getItem(PENDING_UPDATE_KEY) || "null"
  );

  if (!lastSeenBuildTime) {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_TIME);

    if (pendingUpdate?.buildTime && pendingUpdate.buildTime !== BUILD_TIME) {
      localStorage.removeItem(PENDING_UPDATE_KEY);
      rememberUpdateConfirmation();

      return "updated";
    }
  } else if (lastSeenBuildTime !== BUILD_TIME) {
    localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_TIME);
    localStorage.removeItem(PENDING_UPDATE_KEY);
    rememberUpdateConfirmation();

    return "updated";
  }

  const updateConfirmation = getSavedUpdateConfirmation();

  if (!updateConfirmation) return "";

  return "updated";
}

function getSavedUpdateConfirmation() {
  const updateConfirmation = JSON.parse(
    localStorage.getItem(UPDATE_CONFIRMATION_KEY) || "null"
  );

  if (!updateConfirmation) return null;

  if (updateConfirmation.expiresAt < Date.now()) {
    localStorage.removeItem(UPDATE_CONFIRMATION_KEY);
    return null;
  }

  return updateConfirmation;
}

function rememberPendingUpdate() {
  localStorage.setItem(
    PENDING_UPDATE_KEY,
    JSON.stringify({
      buildTime: BUILD_TIME,
      checkedAt: Date.now(),
    })
  );
}

function rememberUpdateConfirmation() {
  localStorage.setItem(
    UPDATE_CONFIRMATION_KEY,
    JSON.stringify({
      expiresAt: Date.now() + UPDATE_CONFIRMATION_DURATION,
    })
  );
}

// STORAGE MIGRATION BASELINE
const savedStorageVersion = getSavedStorageVersion();

export default function App() {
  const initialWorkoutData = useState(() =>
    loadWorkoutData({
      seedExercises,
    })
  )[0];

  // STORAGE MIGRATIONS
  useEffect(() => {
    if (savedStorageVersion < STORAGE_VERSION) {
      console.log(
        "Migrating storage:",
        savedStorageVersion,
        "→",
        STORAGE_VERSION
      );

      clearLegacyEquipmentStorage();

      markStorageVersion(STORAGE_VERSION);

      window.location.reload();
    }
  }, []);

  async function exportBackup() {
    const summary = getWorkoutDataSummary({
      templates,
      history,
      sessions,
      exerciseLibrary,
    });

    const backup = createWorkoutBackup({
      templates,
      history,
      sessions,
      exerciseMetadata,
      exerciseLibrary,
      selectedSessionId,
    });

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],

      {
        type: "application/json",
      }
    );

    const filename = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const file = new File([blob], filename, {
      type: "application/json",
    });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text: `Workout backup: ${formatBackupSummary(summary)}`,
          title: "Workout Backup",
        });

        setBackupStatus(
          `Backup exported: ${formatBackupSummary(summary)}. Save it in Files or iCloud Drive.`
        );
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Backup share failed:", error);
          setBackupStatus(`Backup export failed: ${error.message}`);
        }
      }

      return;
    }

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = filename;

    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importBackup(event) {
    const file = event.target.files[0];

    if (!file) return;

    try {
      const text = await file.text();

      const data = JSON.parse(text);

      const importedData = parseWorkoutBackup(data, {
        seedExercises,
      });

      const summary = getWorkoutDataSummary(importedData);

      const confirmed = window.confirm(
        `Import this backup and replace the current app data?\n\n${formatBackupSummary(summary)}`
      );

      if (!confirmed) {
        setBackupStatus("Import canceled. Current data was not changed.");
        return;
      }

      setTemplates(importedData.templates);

      setHistory(importedData.history);

      setSessions(importedData.sessions);

      setExerciseLibrary(importedData.exerciseLibrary);

      setExerciseMetadata(importedData.exerciseMetadata);

      setSelectedSessionId(importedData.selectedSessionId);

      setBackupStatus(`Backup imported: ${formatBackupSummary(summary)}.`);
    } catch (error) {
      console.error("Backup import failed:", error);
      setBackupStatus(`Import failed: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  const [templates, setTemplates] = useState(initialWorkoutData.templates);

  const [sessions, setSessions] = useState(initialWorkoutData.sessions);

  const [history, setHistory] = useState(initialWorkoutData.history);

  // EXERCISE LIBRARY
  // merge saved exercises + missing built-in exercises

  const [exerciseLibrary, setExerciseLibrary] = useState(() => {
    return initialWorkoutData.exerciseLibrary;
  });

  const [exerciseMetadata, setExerciseMetadata] = useState(
    initialWorkoutData.exerciseMetadata
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(null);

  const [templateSort, setTemplateSort] = useState("recent");

  const [selectedSessionId, setSelectedSessionId] = useState(
    initialWorkoutData.selectedSessionId
  );
  const [selectedHistory, setSelectedHistory] = useState(null);

  const [selectedHistoryList, setSelectedHistoryList] = useState(null);

  const [showExercises, setShowExercises] = useState(false);

  const [showPlans, setShowPlans] = useState(false);

  const [showNutrition, setShowNutrition] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  const [updateStatus, setUpdateStatus] = useState("");

  const [buildNotice, setBuildNotice] = useState(getInitialBuildNotice);

  const [lastUpdateCheck, setLastUpdateCheck] = useState(null);

  const [indexedDbReady, setIndexedDbReady] = useState(false);

  const [backupStatus, setBackupStatus] = useState("");

  const [authSession, setAuthSession] = useState(null);

  const [authEmail, setAuthEmail] = useState("");

  const [authPassword, setAuthPassword] = useState("");

  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured
      ? "Sync sign-in is optional."
      : "Sync is not configured."
  );

  const [authLoading, setAuthLoading] = useState(false);

  const [syncStatus, setSyncStatus] = useState(
    "Cloud upload/download is manual for now."
  );

  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthSession() {
      if (!isSupabaseConfigured) {
        return;
      }

      try {
        const session = await getCurrentSession();

        if (!cancelled) {
          setAuthSession(session);
          setAuthStatus(
            session ? "Signed in. Cloud sync is manual." : "Signed out."
          );
        }
      } catch (error) {
        console.error("Failed to load auth session:", error);

        if (!cancelled) {
          setAuthStatus(`Sync sign-in failed: ${error.message}`);
        }
      }
    }

    loadAuthSession();

    const unsubscribe = subscribeToAuthChanges((session) => {
      setAuthSession(session);
      setAuthStatus(
        session ? "Signed in. Cloud sync is manual." : "Signed out."
      );
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function signInWithEmailPassword() {
    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setAuthStatus("Enter your email and password.");
      return;
    }

    setAuthLoading(true);

    try {
      const session = await signInWithPassword(email, password);
      setAuthSession(session);
      setAuthStatus("Signed in. Cloud sync is manual.");
    } catch (error) {
      console.error("Password sign-in failed:", error);
      setAuthStatus(`Sign-in failed: ${error.message}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function createAccountWithEmailPassword() {
    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setAuthStatus("Enter your email and password.");
      return;
    }

    setAuthLoading(true);

    try {
      const session = await signUpWithPassword(email, password);
      setAuthSession(session);
      setAuthStatus(
        session
          ? "Account created. Cloud sync is manual."
          : "Account created. Check your email if confirmation is required."
      );
    } catch (error) {
      console.error("Account creation failed:", error);
      setAuthStatus(`Account creation failed: ${error.message}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setAuthLoading(true);

    try {
      await signOut();
      setAuthStatus("Signed out.");
    } catch (error) {
      console.error("Sign out failed:", error);
      setAuthStatus(`Sign out failed: ${error.message}`);
    } finally {
      setAuthLoading(false);
    }
  }

  function getCurrentWorkoutData() {
    return {
      exerciseLibrary,
      exerciseMetadata,
      history,
      selectedSessionId,
      sessions,
      templates,
    };
  }

  function replaceWorkoutData(data) {
    setTemplates(data.templates);
    setHistory(data.history);
    setSessions(data.sessions);
    setExerciseLibrary(data.exerciseLibrary);
    setExerciseMetadata(data.exerciseMetadata);
    setSelectedSessionId(data.selectedSessionId);
  }

  async function uploadCurrentDataToCloud() {
    setSyncLoading(true);

    try {
      const data = getCurrentWorkoutData();

      await uploadWorkoutSnapshot(data, STORAGE_VERSION, authSession);
      setSyncStatus(
        `Uploaded to cloud: ${formatBackupSummary(getWorkoutDataSummary(data))}.`
      );
    } catch (error) {
      console.error("Cloud upload failed:", error);
      setSyncStatus(`Cloud upload failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  async function downloadCloudData() {
    setSyncLoading(true);

    try {
      const snapshot = await downloadWorkoutSnapshot(authSession);

      if (!snapshot) {
        setSyncStatus("No cloud snapshot found for this account.");
        return;
      }

      const importedData = parseWorkoutBackup(
        {
          data: snapshot.data,
          schemaVersion: snapshot.schema_version,
        },
        {
          seedExercises,
        }
      );

      const summary = getWorkoutDataSummary(importedData);
      const confirmed = window.confirm(
        `Download cloud data and replace this device's current app data?\n\n${formatBackupSummary(summary)}`
      );

      if (!confirmed) {
        setSyncStatus("Cloud download canceled. Current data was not changed.");
        return;
      }

      replaceWorkoutData(importedData);
      setSyncStatus(`Downloaded from cloud: ${formatBackupSummary(summary)}.`);
    } catch (error) {
      console.error("Cloud download failed:", error);
      setSyncStatus(`Cloud download failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  async function uploadCustomExerciseLibraryToCloud() {
    setSyncLoading(true);

    try {
      const result = await uploadCustomExercises(exerciseLibrary, authSession);

      setSyncStatus(
        `Custom exercises synced: ${result.uploaded} uploaded, ${result.deleted} removed from active cloud library.`
      );
    } catch (error) {
      console.error("Custom exercise sync failed:", error);
      setSyncStatus(`Custom exercise sync failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  async function uploadWorkoutsToCloud() {
    setSyncLoading(true);

    try {
      const result = await uploadWorkouts(templates, exerciseLibrary, authSession);

      setSyncStatus(
        `Workouts synced: ${result.syncedWorkouts} workouts, ${result.syncedExercises} exercises, ${result.syncedSets} sets. Removed ${result.removedWorkouts} workouts.`
      );
    } catch (error) {
      console.error("Workout sync failed:", error);
      setSyncStatus(`Workout sync failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  async function uploadWorkoutHistoryToCloud() {
    setSyncLoading(true);

    try {
      const result = await uploadWorkoutHistory(
        history,
        templates,
        exerciseLibrary,
        authSession
      );

      setSyncStatus(
        `History synced: ${result.syncedSessions} workouts, ${result.syncedExercises} exercises, ${result.syncedSets} sets. Removed ${result.removedSessions} workouts.`
      );
    } catch (error) {
      console.error("Workout history sync failed:", error);
      setSyncStatus(`Workout history sync failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  async function checkNormalizedCloudData() {
    setSyncLoading(true);

    try {
      const summary = await getNormalizedCloudSummary(authSession);

      setSyncStatus(`Normalized cloud data: ${formatNormalizedSummary(summary)}`);
    } catch (error) {
      console.error("Normalized cloud check failed:", error);
      setSyncStatus(`Normalized cloud check failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromIndexedDb() {
      try {
        const indexedDbData = await loadWorkoutDataFromIndexedDb({
          seedExercises,
        });

        if (cancelled) {
          return;
        }

        if (indexedDbData) {
          setTemplates(indexedDbData.templates);
          setHistory(indexedDbData.history);
          setSessions(indexedDbData.sessions);
          setExerciseLibrary(indexedDbData.exerciseLibrary);
          setExerciseMetadata(indexedDbData.exerciseMetadata);
          setSelectedSessionId(indexedDbData.selectedSessionId);
        }
      } catch (error) {
        console.error("Failed to load workout data from IndexedDB:", error);
      } finally {
        if (!cancelled) {
          setIndexedDbReady(true);
        }
      }
    }

    hydrateFromIndexedDb();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePwaUpdateStatus(event) {
      const status = event.detail?.status;

      if (status) {
        if (status === "available" || status === "found") {
          rememberPendingUpdate();
        }

        setUpdateStatus(status);
      }
    }

    window.addEventListener("pwa-update-status", handlePwaUpdateStatus);

    return () => {
      window.removeEventListener("pwa-update-status", handlePwaUpdateStatus);
    };
  }, []);

  async function checkForUpdate() {
    if (!("serviceWorker" in navigator)) {
      setUpdateStatus("unsupported");
      return;
    }

    setUpdateStatus("checking");
    rememberPendingUpdate();
    localStorage.removeItem(UPDATE_CONFIRMATION_KEY);
    setBuildNotice("");

    try {
      let result;

      if (window.checkForAppUpdate) {
        result = await window.checkForAppUpdate();
      } else {
        result = await navigator.serviceWorker.ready.then(
          async (registration) => {
            await registration.update();
            await new Promise((resolve) => setTimeout(resolve, 1000));

            if (registration.waiting) {
              registration.waiting.postMessage({
                type: "SKIP_WAITING",
              });
            }

            return {
              shouldReload: Boolean(registration.waiting),
              status: registration.waiting ? "found" : "current",
            };
          }
        );
      }

      if (result.status === "found") {
        setUpdateStatus("found");

        if (result.shouldReload) {
          setTimeout(() => {
            window.location.reload();
          }, 750);
        }

        return;
      }

      localStorage.removeItem(PENDING_UPDATE_KEY);
      setLastUpdateCheck(new Date());
      setUpdateStatus(result.status || "current");
    } catch (error) {
      localStorage.removeItem(PENDING_UPDATE_KEY);
      console.error("Update check failed:", error);
      setUpdateStatus("error");
    }
  }

  useEffect(() => {
    const data = {
      exerciseLibrary,
      exerciseMetadata,
      history,
      selectedSessionId,
      sessions,
      templates,
    };

    saveWorkoutData(data, STORAGE_VERSION);

    if (indexedDbReady) {
      saveWorkoutDataToIndexedDb(data, STORAGE_VERSION).catch((error) => {
        console.error("Failed to save workout data to IndexedDB:", error);
      });
    }
  }, [
    templates,
    history,
    sessions,
    exerciseLibrary,
    exerciseMetadata,
    selectedSessionId,
    indexedDbReady,
  ]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  useEffect(() => {
    if (selectedSessionId) {
      return;
    }

    let cancelled = false;

    async function checkForPassiveUpdate() {
      if (document.visibilityState === "hidden" || !window.checkForAppUpdate) {
        return;
      }

      const lastCheck = Number(
        localStorage.getItem(LAST_AUTO_UPDATE_CHECK_KEY) || 0
      );

      if (Date.now() - lastCheck < AUTO_UPDATE_CHECK_INTERVAL) {
        return;
      }

      localStorage.setItem(LAST_AUTO_UPDATE_CHECK_KEY, String(Date.now()));

      const result = await window.checkForAppUpdate({
        applyUpdate: false,
        silent: true,
      });

      if (!cancelled && result?.status === "available") {
        setUpdateStatus("available");
      }
    }

    checkForPassiveUpdate().catch((error) => {
      console.error("Passive update check failed:", error);
    });

    function handleResume() {
      checkForPassiveUpdate().catch((error) => {
        console.error("Passive update check failed:", error);
      });
    }

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [selectedSessionId]);

  function addTemplate() {
    const name = prompt("Template name");

    if (!name) return;

    setTemplates([
      ...templates,

      {
        id: Date.now(),

        name,

        exercises: [],

        lastCompleted: null,
      },
    ]);
  }

  function goHome() {
    setShowExercises(false);
    setShowPlans(false);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goExercises() {
    setShowExercises(true);
    setShowPlans(false);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goPlans() {
    setShowExercises(false);
    setShowPlans(true);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goNutrition() {
    setShowExercises(false);
    setShowPlans(false);
    setShowNutrition(true);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goSettings() {
    setShowExercises(false);
    setShowPlans(false);
    setShowNutrition(false);
    setShowSettings(true);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function renderBottomNav(activeView) {
    const navItems = [
      {
        icon: Home,
        key: "home",
        label: "Home",
        onClick: goHome,
      },
      {
        icon: Dumbbell,
        key: "exercises",
        label: "Exercises",
        onClick: goExercises,
      },
      {
        icon: ClipboardList,
        key: "plans",
        label: "Plans",
        onClick: goPlans,
      },
      {
        icon: Utensils,
        key: "nutrition",
        label: "Nutrition",
        onClick: goNutrition,
      },
      {
        icon: Settings,
        key: "settings",
        label: "Settings",
        onClick: goSettings,
      },
    ];

    return (
      <nav
        aria-label="Primary"
        style={{
          background: "color-mix(in srgb, var(--surface) 96%, transparent)",
          borderTop: "1px solid var(--border)",
          bottom: 0,
          boxShadow: "0 -4px 16px rgba(0,0,0,.06)",
          display: "flex",
          left: 0,
          padding: "4px 8px calc(4px + env(safe-area-inset-bottom))",
          position: "fixed",
          right: 0,
          zIndex: 900,
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeView;

          return (
            <button
              key={item.key}
              aria-current={active ? "page" : undefined}
              onClick={item.onClick}
              style={
                active ? activeBottomNavButtonStyle : bottomNavButtonStyle
              }
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  function renderAppShell(content, activeView) {
    return (
      <div
        style={{
          minHeight: "100vh",
          paddingBottom: "calc(70px + env(safe-area-inset-bottom))",
        }}
      >
        {content}
        {renderBottomNav(activeView)}
      </div>
    );
  }

  function renderBackupStatusDialog() {
    if (!backupStatus) return null;

    return (
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Backup status"
        style={{
          background: "rgba(0,0,0,0.4)",
          inset: 0,
          position: "fixed",
          zIndex: 1000,
        }}
        onClick={() => setBackupStatus("")}
      >
        <div
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            color: "var(--text)",
            left: "50%",
            maxWidth: "320px",
            padding: "14px",
            position: "fixed",
            top: "18px",
            transform: "translateX(-50%)",
            width: "calc(100% - 32px)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label="Dismiss backup status"
            onClick={() => setBackupStatus("")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "22px",
              lineHeight: 1,
              padding: "2px 6px",
              position: "absolute",
              right: "6px",
              top: "6px",
            }}
          >
            ×
          </button>
          <div
            style={{
              fontSize: "14px",
              marginBottom: "12px",
              paddingRight: "28px",
              textAlign: "left",
            }}
          >
            {backupStatus}
          </div>
          <button onClick={() => setBackupStatus("")}>OK</button>
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div
        style={{
          padding: "20px",
        }}
      >
        <h2>Settings</h2>

        <section
          style={{
            margin: "18px auto",
            maxWidth: "420px",
          }}
        >
          <h3>App</h3>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
              marginBottom: "10px",
            }}
          >
            v{APP_VERSION}
            {" • built "}
            {BUILD_TIME}
          </div>
          <button
            onClick={checkForUpdate}
            disabled={updateStatus === "checking" || updateStatus === "found"}
          >
            {updateStatus === "checking" ? "Checking..." : "🔄 Update"}
          </button>
          {(updateStatus || buildNotice) && (
            <div
              role="status"
              aria-live="polite"
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "6px",
              }}
            >
              {updateStatus && (
                <div>
                  {UPDATE_STATUS_COPY[updateStatus]}
                  {updateStatus === "current" && lastUpdateCheck
                    ? ` (${lastUpdateCheck.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })})`
                    : ""}
                </div>
              )}
              {buildNotice && <div>{BUILD_NOTICE_COPY[buildNotice]}</div>}
            </div>
          )}
        </section>

        <section
          style={{
            margin: "18px auto",
            maxWidth: "420px",
          }}
        >
          <h3>Backup</h3>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              justifyContent: "center",
              margin: "12px 0",
            }}
          >
            <button onClick={exportBackup} style={backupButtonStyle}>
              <span aria-hidden="true">⬇️</span>
              <span>Export Backup</span>
            </button>

            <label
              style={{
                ...backupButtonStyle,
              }}
            >
              <span aria-hidden="true">⬆️</span>
              <span>Import Backup</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={importBackup}
                style={{
                  height: "1px",
                  opacity: 0,
                  pointerEvents: "none",
                  position: "absolute",
                  width: "1px",
                }}
              />
            </label>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            margin: "18px auto",
            maxWidth: "420px",
            padding: "10px",
          }}
        >
          <h3>Profile & Sync</h3>
          {authSession ? (
            <div
              style={{
                alignItems: "center",
                display: "flex",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                }}
              >
                Signed in as {authSession.user.email}
              </span>
              <button disabled={authLoading} onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          ) : (
            <div
              style={{
                alignItems: "center",
                display: "grid",
                gap: "6px",
                gridTemplateColumns: "1fr auto",
              }}
            >
              {/* Keep access control server-side; frontend allowlists are not security. */}
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="email"
                disabled={!isSupabaseConfigured || authLoading}
                style={{
                  gridColumn: "1 / -1",
                  minWidth: 0,
                }}
              />
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="password"
                disabled={!isSupabaseConfigured || authLoading}
                style={{
                  minWidth: 0,
                }}
              />
              <button
                disabled={!isSupabaseConfigured || authLoading}
                onClick={signInWithEmailPassword}
              >
                Sign In
              </button>
              <button
                disabled={!isSupabaseConfigured || authLoading}
                onClick={createAccountWithEmailPassword}
                style={{
                  gridColumn: "1 / -1",
                }}
              >
                Create Account
              </button>
            </div>
          )}
          <div
            role="status"
            aria-live="polite"
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
              marginTop: "6px",
            }}
          >
            {authStatus}
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "center",
              marginTop: "10px",
            }}
          >
            <button
              disabled={!authSession || syncLoading}
              onClick={uploadCurrentDataToCloud}
            >
              ⬆️ Upload to Cloud
            </button>
            <button
              disabled={!authSession || syncLoading}
              onClick={downloadCloudData}
            >
              ⬇️ Download from Cloud
            </button>
          </div>
          <div
            role="status"
            aria-live="polite"
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
              marginTop: "6px",
            }}
          >
            {syncStatus}
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: "10px",
              paddingTop: "10px",
            }}
          >
            <button
              disabled={!authSession || syncLoading}
              onClick={uploadCustomExerciseLibraryToCloud}
            >
              Sync Custom Exercises
            </button>
            <button
              disabled={!authSession || syncLoading}
              onClick={uploadWorkoutsToCloud}
              style={{
                marginLeft: "8px",
              }}
            >
              Sync Workouts
            </button>
            <button
              disabled={!authSession || syncLoading}
              onClick={uploadWorkoutHistoryToCloud}
              style={{
                marginLeft: "8px",
              }}
            >
              Sync History
            </button>
            <button
              disabled={!authSession || syncLoading}
              onClick={checkNormalizedCloudData}
              style={{
                marginLeft: "8px",
              }}
            >
              Check Normalized Data
            </button>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "6px",
              }}
            >
              {getCustomExercises(exerciseLibrary).length} custom exercises
              ready for the normalized exercise table.
            </div>
          </div>
        </section>

        {renderBackupStatusDialog()}
      </div>
    );
  }

  if (showSettings) {
    return renderAppShell(renderSettings(), "settings");
  }

  if (showExercises) {
    return renderAppShell(
      <ExerciseView
        exerciseLibrary={exerciseLibrary}
        setExerciseLibrary={setExerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
      />,
      "exercises"
    );
  }

  if (showPlans) {
    return renderAppShell(
      <PlansView
        exerciseLibrary={exerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        history={history}
        setTemplates={setTemplates}
        templates={templates}
      />,
      "plans"
    );
  }

  if (showNutrition) {
    return renderAppShell(<NutritionView />, "nutrition");
  }

  if (selectedHistory) {
    return renderAppShell(
      <HistoryView selectedHistory={selectedHistory} />,
      "home"
    );
  }

  if (selectedHistoryList) {
    return renderAppShell(
      <div
        style={{
          padding: "20px",
        }}
      >
        <h2>History</h2>

        {selectedHistoryList.map((workout) => (
          <button
            key={workout.id}
            style={{
              display: "block",
              marginBottom: "8px",
            }}
            onClick={() => setSelectedHistory(workout)}
          >
            {workout.completedAt}
          </button>
        ))}
      </div>,
      "home"
    );
  }

  if (selectedSession) {
    return (
      <SessionView
        session={selectedSession}
        sessions={sessions}
        setSessions={setSessions}
        history={history}
        setHistory={setHistory}
        templates={templates}
        setTemplates={setTemplates}
        exerciseLibrary={exerciseLibrary}
        setExerciseLibrary={setExerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        setSelectedSessionId={setSelectedSessionId}
        setSelectedTemplateId={setSelectedTemplateId}
      />
    );
  }

  if (selectedTemplate) {
    return renderAppShell(
      <TemplateView
        template={selectedTemplate}
        templates={templates}
        setTemplates={setTemplates}
        exerciseLibrary={exerciseLibrary}
        setSelectedSessionId={setSelectedSessionId}
        sessions={sessions}
        setSessions={setSessions}
        setExerciseLibrary={setExerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        history={history}
      />,
      "home"
    );
  }

  return renderAppShell(
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1>Workout Log</h1>

      <WorkoutCalendar history={history} />

      <hr />

      <button onClick={addTemplate}>+ New Template</button>

      <hr />

      <div
        style={{
          margin: "12px 0",
          textAlign: "center",
        }}
      >
        <select
          value={templateSort}
          onChange={(e) => setTemplateSort(e.target.value)}
        >
          <option value="recent">Recent</option>

          <option value="alpha">A → Z</option>
        </select>
      </div>

      {[...templates]

        .sort((a, b) => {
          if (templateSort === "alpha") {
            return a.name.localeCompare(b.name);
          }

          return (
            new Date(b.lastCompleted || 0) - new Date(a.lastCompleted || 0)
          );
        })

        .map((template) => (
          <div key={template.id}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px",
                alignItems: "center",
                marginBottom: "8px",
                columnGap: "8px",
              }}
            >
              <button
                style={{
                  textAlign: "left",
                  width: "100%",
                  overflow: "hidden",
                }}
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <span
                  style={{
                    display: "inline-block",

                    maxWidth: "120px",

                    overflow: "hidden",

                    textOverflow: "ellipsis",

                    whiteSpace: "nowrap",

                    verticalAlign: "middle",
                  }}
                >
                  {template.name}
                </span>
              </button>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <button
                  onClick={() => {
                    const copy = {
                      ...template,

                      id: Date.now(),

                      name: template.name + " copy",

                      lastCompleted: null,
                    };

                    setTemplates([...templates, copy]);
                  }}
                >
                  ⧉
                </button>{" "}
                <button onClick={() => setConfirmDeleteTemplate(template)}>
                  🗑
                </button>{" "}
                {confirmDeleteTemplate && (
                  <div
                    style={{
                      position: "fixed",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%,-50%)",
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      padding: "20px",
                      zIndex: 1000,
                      width: "280px",
                    }}
                  >
                    <div
                      style={{
                        marginBottom: "12px",
                        fontWeight: "bold",
                      }}
                    >
                      Delete template?
                    </div>

                    <div
                      style={{
                        marginBottom: "16px",
                      }}
                    >
                      Workout history tied to this template may be lost.
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <button onClick={() => setConfirmDeleteTemplate(null)}>
                        ✖️
                      </button>

                      <button
                        onClick={() => {
                          setTemplates(
                            templates.filter(
                              (t) => t.id !== confirmDeleteTemplate.id
                            )
                          );

                          setConfirmDeleteTemplate(null);
                        }}
                      >
                        ✔️
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    const matches = history.filter(
                      (h) => h.templateId === template.id
                    );

                    if (matches.length) {
                      setSelectedHistoryList(matches);
                    }
                  }}
                >
                  🕘
                </button>{" "}
                {template.lastCompleted
                  ? new Date(template.lastCompleted).toLocaleDateString([], {
                      month: "numeric",
                      day: "numeric",
                      year: "2-digit",
                    })
                  : "Never"}
              </div>
            </div>
          </div>
        ))}
    </div>,
    "home"
  );
}
