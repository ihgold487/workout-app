import { useState, useEffect } from "react";
import { seedExercises } from "./data/seedExercises";
import TemplateView from "./components/TemplateView";
import SessionView from "./components/SessionView";
import HistoryView from "./components/HistoryView";
import ExerciseView from "./components/ExerciseView";
import WorkoutCalendar from "./components/WorkoutCalendar";

// STORAGE VERSION
const STORAGE_VERSION = 9;

const APP_VERSION = "0.16";

const BUILD_TIME = __BUILD_TIME__;

// STORAGE MIGRATION BASELINE
const savedStorageVersion =
  JSON.parse(localStorage.getItem("storageVersion")) || 0;

export default function App() {
  // STORAGE MIGRATIONS
  useEffect(() => {
    if (savedStorageVersion < STORAGE_VERSION) {
      console.log(
        "Migrating storage:",
        savedStorageVersion,
        "→",
        STORAGE_VERSION,
      );

      localStorage.removeItem("exerciseLibrary");
      localStorage.removeItem("equipmentOptions");

      localStorage.setItem("storageVersion", JSON.stringify(STORAGE_VERSION));

      window.location.reload();
    }
  }, []);

  function exportBackup() {
    const data = {
      templates,
      history,
      sessions,
      exerciseMetadata,
      exerciseLibrary,
    };

    const blob = new Blob(
      [JSON.stringify(data, null, 2)],

      {
        type: "application/json",
      },
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

    if (data.templates) setTemplates(data.templates);

    if (data.history) setHistory(data.history);

    if (data.sessions) setSessions(data.sessions);

    if (data.exerciseLibrary) setExerciseLibrary(data.exerciseLibrary);
  }

  const [templates, setTemplates] = useState(
    () => JSON.parse(localStorage.getItem("templates")) || [],
  );

  const [sessions, setSessions] = useState(
    () => JSON.parse(localStorage.getItem("sessions")) || [],
  );

  const [history, setHistory] = useState(
    () => JSON.parse(localStorage.getItem("history")) || [],
  );

  // EXERCISE LIBRARY
  // merge saved exercises + missing built-in exercises

  const [exerciseLibrary, setExerciseLibrary] = useState(() => {
    const saved = JSON.parse(localStorage.getItem("exerciseLibrary")) || [];

    // MERGE built-ins + saved exercises
    // uniqueness = name + equipment

    const customExercises = saved.filter((ex) => !ex.builtin);

    return [...seedExercises, ...customExercises];
  });

  const [exerciseMetadata, setExerciseMetadata] = useState(
    () => JSON.parse(localStorage.getItem("exerciseMetadata")) || {},
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(null);

  const [templateSort, setTemplateSort] = useState("recent");

  const [selectedSessionId, setSelectedSessionId] = useState(
    () => JSON.parse(localStorage.getItem("selectedSessionId")) || null,
  );
  const [selectedHistory, setSelectedHistory] = useState(null);

  const [selectedHistoryList, setSelectedHistoryList] = useState(null);

  const [showExercises, setShowExercises] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      "exerciseLibrary",

      JSON.stringify(exerciseLibrary),
    );

    localStorage.setItem(
      "storageVersion",

      JSON.stringify(STORAGE_VERSION),
    );

    localStorage.setItem(
      "templates",

      JSON.stringify(templates),
    );

    localStorage.setItem(
      "exerciseMetadata",

      JSON.stringify(exerciseMetadata),
    );

    localStorage.setItem(
      "history",

      JSON.stringify(history),
    );

    localStorage.setItem(
      "sessions",

      JSON.stringify(sessions),
    );

    localStorage.setItem(
      "selectedSessionId",

      JSON.stringify(selectedSessionId),
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
                              (t) => t.id !== confirmDeleteTemplate.id,
                            ),
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
                      (h) => h.templateId === template.id,
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
