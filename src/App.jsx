/* global __BUILD_TIME__ */
import { useState, useEffect } from "react";
import { seedExercises } from "./data/seedExercises";
import TemplateView from "./components/TemplateView";
import SessionView from "./components/SessionView";
import HistoryView from "./components/HistoryView";
import ExerciseView from "./components/ExerciseView";
import WorkoutCalendar from "./components/WorkoutCalendar";
import {
  clearLegacyEquipmentStorage,
  createWorkoutBackup,
  getSavedStorageVersion,
  loadWorkoutData,
  markStorageVersion,
  parseWorkoutBackup,
  saveWorkoutData,
} from "./storage/workoutStorage";

// STORAGE VERSION
const STORAGE_VERSION = 9;

const APP_VERSION = "0.16";

const BUILD_TIME = __BUILD_TIME__;

const PENDING_UPDATE_KEY = "pendingPwaUpdate";
const LAST_SEEN_BUILD_KEY = "lastSeenBuildTime";
const UPDATE_CONFIRMATION_KEY = "pwaUpdateConfirmation";
const UPDATE_CONFIRMATION_DURATION = 10 * 60 * 1000;

const UPDATE_STATUS_COPY = {
  checking: "Checking for update...",
  current: "No new build found.",
  error: "Update check failed. Try closing and reopening the app.",
  found: "Update found. Reloading...",
  unsupported: "Updates are unavailable in this browser.",
};

const BUILD_NOTICE_COPY = {
  updated: "Updated to the latest build.",
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

  function exportBackup() {
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

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;

    a.click();

    URL.revokeObjectURL(url);
  }

  async function importBackup(event) {
    const file = event.target.files[0];

    if (!file) return;

    const text = await file.text();

    const data = JSON.parse(text);

    const importedData = parseWorkoutBackup(data, {
      seedExercises,
    });

    setTemplates(importedData.templates);

    setHistory(importedData.history);

    setSessions(importedData.sessions);

    setExerciseLibrary(importedData.exerciseLibrary);

    setExerciseMetadata(importedData.exerciseMetadata);

    setSelectedSessionId(importedData.selectedSessionId);
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

  const [updateStatus, setUpdateStatus] = useState("");

  const [buildNotice, setBuildNotice] = useState(getInitialBuildNotice);

  const [lastUpdateCheck, setLastUpdateCheck] = useState(null);

  useEffect(() => {
    function handlePwaUpdateStatus(event) {
      const status = event.detail?.status;

      if (status) {
        if (status === "found") {
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
    saveWorkoutData(
      {
        exerciseLibrary,
        exerciseMetadata,
        history,
        selectedSessionId,
        sessions,
        templates,
      },
      STORAGE_VERSION
    );
  }, [
    templates,
    history,
    sessions,
    exerciseLibrary,
    exerciseMetadata,
    selectedSessionId,
  ]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

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

  if (showExercises) {
    return (
      <ExerciseView
        exerciseLibrary={exerciseLibrary}
        setExerciseLibrary={setExerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        setShowExercises={setShowExercises}
      />
    );
  }

  if (selectedHistory) {
    return (
      <HistoryView
        selectedHistory={selectedHistory}
        setSelectedHistory={setSelectedHistory}
      />
    );
  }

  if (selectedHistoryList) {
    return (
      <div
        style={{
          padding: "20px",
        }}
      >
        <button onClick={() => setSelectedHistoryList(null)}>← Back</button>

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
      </div>
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
    return (
      <TemplateView
        template={selectedTemplate}
        templates={templates}
        setTemplates={setTemplates}
        exerciseLibrary={exerciseLibrary}
        setSelectedTemplateId={setSelectedTemplateId}
        setSelectedSessionId={setSelectedSessionId}
        sessions={sessions}
        setSessions={setSessions}
        setExerciseLibrary={setExerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        history={history}
      />
    );
  }

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1>Workout Log</h1>

      <div
        style={{
          fontSize: "12px",
          color: "#666",
          marginBottom: "12px",
        }}
      >
        v{APP_VERSION}
        {" • built "}
        {BUILD_TIME}
        <button
          onClick={checkForUpdate}
          disabled={updateStatus === "checking" || updateStatus === "found"}
          style={{
            marginLeft: "8px",
            padding: "2px 6px",
            fontSize: "0.8em",
          }}
        >
          {updateStatus === "checking" ? "Checking..." : "🔄 Update"}
        </button>
        {(updateStatus || buildNotice) && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: "4px",
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
      </div>

      <WorkoutCalendar history={history} />

      <button onClick={exportBackup}>Export Backup</button>

      <input type="file" accept=".json" onChange={importBackup} />

      <hr />

      <button onClick={() => setShowExercises(true)}>Manage Exercises</button>

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
                      background: "white",
                      border: "1px solid #ccc",
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
    </div>
  );
}
