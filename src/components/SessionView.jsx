import { useState, useRef, useEffect, useCallback } from "react";
import { equipmentOptions } from "../data/seedEquipment";
import E1RMExplorerModal from "./E1RMExplorerSheet";
import WeightPickerModal from "./WeightPickerModal";
import ExerciseSetupDialog from "./ExerciseSetupDialog";
import ExercisePickerSheet from "./ExercisePickerSheet";
import { calculateE1RM } from "../utils/e1rm";

export default function SessionView({
  session,
  sessions,
  setSessions,
  history,
  setHistory,
  templates,
  setTemplates,
  exerciseLibrary,
  setExerciseLibrary,
  exerciseMetadata,
  setExerciseMetadata,
  setSelectedSessionId,
  setSelectedTemplateId,
}) {
  const [showAddExercise, setShowAddExercise] = useState(false);

  const [search, setSearch] = useState("");

  const [pendingExercise, setPendingExercise] = useState(null);

  const [newExerciseValues, setNewExerciseValues] = useState({
    weight: "",
    reps: "",
    sets: "",
    rir: "",
  });

  const [replacementValues, setReplacementValues] = useState({
    weight: "",
    reps: "",
    rir: "",
    sets: "",
  });

  const [showReplaceExercise, setShowReplaceExercise] = useState(false);
  const [replacementExercise, setReplacementExercise] = useState(null);
  const [replacementTarget, setReplacementTarget] = useState(null);
  const [weightUnit, setWeightUnit] = useState("lb");
  const [showE1RMExplorer, setShowE1RMExplorer] = useState(false);
  const [e1RMExplorerData, setE1RMExplorerData] = useState(null);
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [weightPickerData, setWeightPickerData] = useState(null);
  const [showRepsPicker, setShowRepsPicker] = useState(false);
  const [repsPickerData, setRepsPickerData] = useState(null);
  const [showRirPicker, setShowRirPicker] = useState(false);
  const [rirPickerData, setRirPickerData] = useState(null);
  const wakeLockRef = useRef(null);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);

  function lbsToKg(lbs) {
    const num = parseFloat(lbs);

    if (isNaN(num)) return "";

    return (num / 2.20462).toFixed(1);
  }

  function displayWeight(weight) {
    if (weight === "" || weight == null) {
      return "";
    }

    return weightUnit === "kg" ? lbsToKg(weight) : weight;
  }

  function formatList(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }

    return value || "";
  }

  function getExerciseDetailText(exercise) {
    const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];
    const primaryMuscle =
      exercise.primaryMuscle ||
      exercise.primary_muscle ||
      muscles[0] ||
      exercise.planMuscle ||
      "n/a";
    const secondaryMuscles =
      formatList(exercise.secondaryMuscles) ||
      formatList(exercise.secondary_muscles) ||
      formatList(muscles.slice(1)) ||
      "n/a";

    return [
      `Exercise: ${exercise.name || "n/a"}`,
      `Equipment: ${formatList(exercise.equipment) || "n/a"}`,
      `Primary: ${primaryMuscle}`,
      `Secondary: ${secondaryMuscles}`,
    ].join("\n");
  }

  function getLatestWorkoutPerformance(exerciseId) {
    const workout = history.find((workout) =>
      workout.exercises.some((exercise) => exercise.exerciseId === exerciseId)
    );

    if (!workout) {
      return null;
    }

    const exercise = workout.exercises.find(
      (exercise) => exercise.exerciseId === exerciseId
    );

    if (!exercise) {
      return null;
    }

    return {
      completedAt: workout.completedAt,

      sets: exercise.sets,
    };
  }

  const [selectedMuscle, setSelectedMuscle] = useState("");

  const [activeSet, setActiveSet] = useState({
    exerciseId: session.exercises[0]?.id,

    setId: session.exercises[0]?.sets[0]?.id,
  });

  const setRowRefs = useRef({});
  const completeWorkoutButtonRef = useRef(null);

  const updateSession = useCallback(
    (updater) => {
      setSessions((prevSessions) =>
        prevSessions.map((s) => (s.id === session.id ? updater(s) : s))
      );
    },
    [session.id, setSessions]
  );

  const updateActual = useCallback(
    (exerciseId, setId, field, value) => {
      updateSession((s) => ({
        ...s,

        exercises: s.exercises.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,

                sets: ex.sets.map((set) =>
                  set.id === setId
                    ? {
                        ...set,
                        [field]: value,
                      }
                    : set
                ),
              }
            : ex
        ),
      }));
    },
    [updateSession]
  );

  useEffect(() => {
    if (!activeSet) return;

    const exercise = session.exercises.find(
      (ex) => ex.id === activeSet.exerciseId
    );

    const setIndex = exercise?.sets.findIndex((s) => s.id === activeSet.setId);

    const currentSet = exercise?.sets[setIndex];

    const previousSet = setIndex > 0 ? exercise.sets[setIndex - 1] : null;

    if (currentSet && !currentSet.actualWeight) {
      updateActual(
        exercise.id,

        currentSet.id,

        "actualWeight",

        previousSet?.actualWeight || currentSet.targetWeight || ""
      );
    }

    if (currentSet && !currentSet.actualReps) {
      updateActual(
        exercise.id,

        currentSet.id,

        "actualReps",

        previousSet?.actualReps || currentSet.targetReps || ""
      );
    }

    if (currentSet && !currentSet.actualRir) {
      updateActual(
        exercise.id,

        currentSet.id,

        "actualRir",

        previousSet?.actualRir || currentSet.targetRir || ""
      );
    }
  }, [activeSet, session.exercises, updateActual]);

  const [expandedNotes, setExpandedNotes] = useState({});

  const [replacingExerciseId, setReplacingExerciseId] = useState(null);

  const [confirmComplete, setConfirmComplete] = useState(false);

  const [showSupersetEditor, setShowSupersetEditor] = useState(false);

  const [showCreateExercise, setShowCreateExercise] = useState(false);

  const [newExercise, setNewExercise] = useState({
    name: "",
    muscle: "",
    equipment: "",
  });

  const [confirmExitWorkout, setConfirmExitWorkout] = useState(false);

  const [pendingDeleteSet, setPendingDeleteSet] = useState(null);

  const [pendingDeleteExercise, setPendingDeleteExercise] = useState(null);

  const [editingSessionName, setEditingSessionName] = useState(false);

  const [sessionNameDraft, setSessionNameDraft] = useState(
    session.templateName || ""
  );

  const [restMinutes, setRestMinutes] = useState(2);

  const [restRemainder, setRestRemainder] = useState(0);

  const [restSeconds, setRestSeconds] = useState(90);

  const [timerRunning, setTimerRunning] = useState(false);

  const [timerFinished, setTimerFinished] = useState(false);

  const [timerPaused, setTimerPaused] = useState(false);

  const [timerStartedAt, setTimerStartedAt] = useState(null);

  const [restComplete, setRestComplete] = useState(false);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!timerRunning || !timerStartedAt) return;

    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);

      const total = restMinutes * 60 + restRemainder;

      const remaining = Math.max(total - elapsed, 0);

      setRestSeconds(remaining);
    }, 1000);

    return () => clearInterval(id);
  }, [timerRunning, timerStartedAt, restMinutes, restRemainder]);

  useEffect(() => {
    if (!timerRunning && !timerPaused && !timerFinished) {
      setTimeout(() => {
        setRestSeconds(restMinutes * 60 + restRemainder);
      }, 0);
    }
  }, [restMinutes, restRemainder, timerRunning, timerPaused, timerFinished]);

  useEffect(() => {
    if (restSeconds === 0 && timerRunning) {
      navigator.vibrate?.([200, 100, 200]);

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        const osc = ctx.createOscillator();

        osc.connect(ctx.destination);

        osc.frequency.value = 1000;

        osc.start();

        setTimeout(
          () => {
            osc.stop();
            ctx.close();
          },

          200
        );
      } catch {
        // Audio feedback is optional.
      }

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(
          "Rest complete",

          {
            body: "Ready for next set",
          }
        );
      }

      setTimeout(() => {
        setRestComplete(true);

        setTimeout(() => setRestComplete(false), 2000);

        setTimerFinished(true);
        setTimerRunning(false);
      }, 0);
    }
  }, [restSeconds, timerRunning, restMinutes, restRemainder]);

  useEffect(() => {
    if (!activeSet?.setId) {
      return;
    }

    const element = setRowRefs.current[activeSet.setId];

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();

    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;

    if (!visible) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSet]);

  useEffect(() => {
    const allSetsCompleted =
      session.exercises.length > 0 &&
      session.exercises.every((exercise) =>
        exercise.sets.every((set) => set.completed)
      );

    if (!allSetsCompleted) {
      return;
    }

    const element = completeWorkoutButtonRef.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();

    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;

    if (!visible) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [session.exercises]);

  useEffect(() => {
    if (!keepScreenAwake) {
      wakeLockRef.current?.release();

      wakeLockRef.current = null;

      return;
    }
    async function requestWakeLock() {
      if (!keepScreenAwake) {
        return;
      }
      try {
        if ("wakeLock" in navigator && !wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.error("Wake lock failed:", err);
      }
    }

    requestWakeLock();

    const handleVisibilityChange = async () => {
      if (
        keepScreenAwake &&
        document.visibilityState === "visible" &&
        "wakeLock" in navigator
      ) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch (err) {
          console.error("Wake lock re-request failed:", err);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      wakeLockRef.current?.release();

      wakeLockRef.current = null;
    };
  }, [keepScreenAwake]);

  function deleteSet(exerciseId, setId) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);

    const currentIndex = exercise.sets.findIndex((s) => s.id === setId);

    const deletingActiveSet =
      activeSet?.exerciseId === exerciseId && activeSet?.setId === setId;

    updateSession((s) => ({
      ...s,

      exercises: s.exercises.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,

              sets: ex.sets.filter((set) => set.id !== setId),
            }
          : ex
      ),
    }));

    if (!deletingActiveSet) {
      return;
    }

    const nextSet = exercise.sets[currentIndex + 1];

    if (nextSet) {
      setActiveSet({
        exerciseId,
        setId: nextSet.id,
      });

      return;
    }

    const exerciseIndex = session.exercises.findIndex(
      (ex) => ex.id === exerciseId
    );

    const nextExercise = session.exercises[exerciseIndex + 1];

    if (nextExercise?.sets?.[0]) {
      setActiveSet({
        exerciseId: nextExercise.id,
        setId: nextExercise.sets[0].id,
      });
    } else {
      setActiveSet(null);
    }
  }

  function addSet(exerciseId, lastSet) {
    const newSet = {
      id: Date.now(),

      targetWeight: lastSet?.actualWeight || lastSet?.targetWeight || "",

      targetReps: lastSet?.actualReps || lastSet?.targetReps || "",

      targetRir: lastSet?.actualRir || lastSet?.targetRir || "",

      actualWeight: lastSet?.actualWeight || lastSet?.targetWeight || "",

      actualReps: "",
      actualRir: "",
      completed: false,
    };

    updateSession((s) => ({
      ...s,

      exercises: s.exercises.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,

              sets: [...ex.sets, newSet],
            }
          : ex
      ),
    }));
  }

  function markSetComplete(exerciseId, setId) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);

    const currentSet = exercise.sets.find((s) => s.id === setId);

    const currentIndex = exercise.sets.findIndex((s) => s.id === setId);

    const undo = currentSet.completed;

    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              sets: ex.sets.map((set, index) => {
                if (set.id === setId) {
                  return {
                    ...set,
                    completed: !undo,
                    actualWeight: undo ? "" : set.actualWeight,
                    actualReps: undo ? "" : set.actualReps,
                    actualRir: undo ? "" : set.actualRir,
                  };
                }

                if (!undo && index === currentIndex + 1) {
                  return {
                    ...set,
                    targetWeight:
                      currentSet.actualWeight ||
                      currentSet.targetWeight ||
                      set.targetWeight,
                    targetReps:
                      currentSet.actualReps ||
                      currentSet.targetReps ||
                      set.targetReps,
                    targetRir:
                      currentSet.actualRir || currentSet.targetRir || set.targetRir,
                  };
                }

                return set;
              }),
            }
          : ex
      ),
    }));

    if (undo) {
      setActiveSet({ exerciseId, setId });
      return;
    }

    const group = exercise.supersetGroup;

    if (group) {
      const superset = session.exercises.filter(
        (ex) => ex.supersetGroup === group
      );

      const currentSupersetIndex = superset.findIndex(
        (ex) => ex.id === exerciseId
      );

      const nextExercise = superset[currentSupersetIndex + 1];

      if (nextExercise && nextExercise.sets[currentIndex]) {
        setActiveSet({
          exerciseId: nextExercise.id,

          setId: nextExercise.sets[currentIndex].id,
        });

        return;
      }

      const firstExercise = superset[0];

      if (firstExercise && firstExercise.sets[currentIndex + 1]) {
        setActiveSet({
          exerciseId: firstExercise.id,

          setId: firstExercise.sets[currentIndex + 1].id,
        });

        return;
      }
    }

    const nextSet = exercise.sets[currentIndex + 1];

    if (nextSet) {
      setActiveSet({
        exerciseId,
        setId: nextSet.id,
      });

      return;
    }

    const exerciseIndex = session.exercises.findIndex(
      (ex) => ex.id === exerciseId
    );

    const nextExercise = session.exercises[exerciseIndex + 1];

    if (nextExercise && nextExercise.sets[0]) {
      setActiveSet({
        exerciseId: nextExercise.id,

        setId: nextExercise.sets[0].id,
      });
    } else {
      setActiveSet(null);
    }
  }
  function deleteExercise(exerciseId) {
    updateSession((s) => ({
      ...s,

      templateChanged: true,

      exercises: s.exercises.filter((ex) => ex.id !== exerciseId),
    }));
  }

  function updateExerciseSupersetGroup(exerciseId, supersetGroup) {
    updateSession((s) => ({
      ...s,

      templateChanged: true,

      exercises: s.exercises.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,

              supersetGroup,
            }
          : ex
      ),
    }));
  }

  function replaceExercise(oldExerciseId, newExercise, replacementValues) {
    updateSession((s) => ({
      ...s,

      templateChanged: true,

      exercises: s.exercises.map((ex) =>
        ex.id === oldExerciseId
          ? {
              ...ex,

              name: newExercise.name,

              equipment: newExercise.equipment,

              muscles: newExercise.muscles,

              originalExerciseId: newExercise.id,

              exerciseId: newExercise.id,

              sets: Array.from(
                {
                  length: Number(replacementValues.sets) || 1,
                },
                (_, i) => ({
                  id: Date.now() + i,

                  targetWeight: replacementValues.weight,

                  targetReps: replacementValues.reps,

                  targetRir: replacementValues.rir,

                  actualWeight: "",
                  actualReps: "",
                  actualRir: "",
                })
              ),
            }
          : ex
      ),
    }));

    if (activeSet?.exerciseId === oldExerciseId) {
      setActiveSet((s) => ({
        ...s,

        exerciseId: oldExerciseId,
      }));
    }

    setReplacingExerciseId(null);

    setSearch("");

    setExpandedNotes((notes) => ({
      ...notes,

      [oldExerciseId]: !!exerciseMetadata?.[newExercise.id]?.note?.trim(),
    }));
  }

  function addExercise(exercise, weight, reps, numSets, rir) {
    const sets = Array.from({ length: Number(numSets) }, () => ({
      id: Date.now() + Math.random(),
      targetWeight: weight,
      targetReps: reps,
      targetRir: rir,
      actualWeight: "",
      actualReps: "",
      actualRir: "",
    }));

    updateSession((s) => ({
      ...s,
      templateChanged: true,
      exercises: [
        ...s.exercises,
        {
          id: Date.now(),
          name: exercise.name,
          equipment: exercise.equipment,
          muscles: exercise.muscles,
          supersetGroup: null,
          sets,
        },
      ],
    }));

    setPendingExercise(null);
    setShowAddExercise(false);
  }

  // UNIQUE muscle filter options
  const muscleGroups = [...new Set(exerciseLibrary.map((e) => e.muscles?.[0]))]
    .filter(Boolean)
    .sort();

  const groupedExercises = Object.values(
    session.exercises.reduce(
      (groups, exercise) => {
        const key = exercise.supersetGroup || `single-${exercise.id}`;

        if (!groups[key]) {
          groups[key] = {
            group: exercise.supersetGroup,

            exercises: [],
          };
        }

        groups[key].exercises.push(exercise);

        return groups;
      },

      {}
    )
  );

  const allSetsCompleted =
    session.exercises.length > 0 &&
    session.exercises.every((exercise) =>
      exercise.sets.every((set) => set.completed)
    );

  function saveSessionName() {
    const nextName = sessionNameDraft.trim();

    if (!nextName) {
      return;
    }

    updateSession((s) => ({
      ...s,
      templateName: nextName,
    }));
    setTemplates(
      templates.map((template) =>
        template.id === session.templateId
          ? {
              ...template,
              name: nextName,
            }
          : template
      )
    );
    setEditingSessionName(false);
  }

  function hasStructuralChanges() {
    const original = templates.find((t) => t.id === session.templateId);

    if (!original) return false;

    const getStructuralSignature = (exercises) =>
      exercises.map((ex) => ({
        name: ex.name,
        supersetGroup: ex.supersetGroup || null,
      }));

    return (
      JSON.stringify(getStructuralSignature(original.exercises)) !==
      JSON.stringify(getStructuralSignature(session.exercises))
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "var(--surface)",
          zIndex: 10,
          padding: "20px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => setConfirmExitWorkout(true)}
            style={{
              minWidth: "78px",
              padding: "6px 8px",
              fontSize: "14px",
            }}
          >
            ← End Workout
          </button>

          <button
            onClick={() => setWeightUnit(weightUnit === "lb" ? "kg" : "lb")}
            style={{
              minWidth: "78px",
              padding: "6px 8px",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            {weightUnit === "lb" ? "⚖️ LB" : "⚖️ KG"}
          </button>
          <button
            onClick={() => setKeepScreenAwake((v) => !v)}
            style={{
              minWidth: "78px",
              padding: "6px 8px",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            {keepScreenAwake ? "☀️ Auto-Lock Off" : "🌙 Auto-Lock On"}
          </button>
        </div>

        {confirmExitWorkout && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger-text)",
                border: "2px solid #c66",
                borderRadius: "12px",
                padding: "20px",
                minWidth: "260px",
                boxShadow: "0 0 20px rgba(0,0,0,.35)",
              }}
            >
              <div
                style={{
                  marginBottom: "12px",
                  fontWeight: "bold",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "bold",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ fontSize: "22px" }}>⚠️</span>
                  <span>End Workout?</span>
                </div>
              </div>

              <div
                style={{
                  marginBottom: "16px",
                }}
              >
                Any entered info will be lost.
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <button onClick={() => setConfirmExitWorkout(false)}>✖️</button>

                <button
                  onClick={() => {
                    setConfirmExitWorkout(false);

                    setSelectedSessionId(null);

                    setSelectedTemplateId(null);
                  }}
                >
                  ✔️
                </button>
              </div>
            </div>
          </div>
        )}
        {pendingDeleteExercise && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger-text)",
                border: "2px solid #c66",
                borderRadius: "12px",
                padding: "20px",
                width: "280px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginBottom: "10px",
                  fontWeight: "bold",
                  fontSize: "18px",
                }}
              >
                <span style={{ fontSize: "22px" }}>⚠️</span>
                <span>Delete Exercise?</span>
              </div>

              <div
                style={{
                  fontSize: "14px",
                  marginBottom: "16px",
                }}
              >
                {pendingDeleteExercise.name}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <button onClick={() => setPendingDeleteExercise(null)}>
                  ✖️
                </button>

                <button
                  onClick={() => {
                    deleteExercise(pendingDeleteExercise.id);

                    setPendingDeleteExercise(null);
                  }}
                >
                  ✔️
                </button>
              </div>
            </div>
          </div>
        )}
        {pendingDeleteSet && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger-text)",
                border: "2px solid #c66",
                borderRadius: "12px",
                padding: "20px",
                width: "280px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginBottom: "16px",
                  fontWeight: "bold",
                  fontSize: "18px",
                }}
              >
                <span style={{ fontSize: "22px" }}>⚠️</span>
                <span>Delete Set?</span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <button onClick={() => setPendingDeleteSet(null)}>✖️</button>

                <button
                  onClick={() => {
                    deleteSet(
                      pendingDeleteSet.exerciseId,
                      pendingDeleteSet.setId
                    );

                    setPendingDeleteSet(null);
                  }}
                >
                  ✔️
                </button>
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            background: timerFinished
              ? "var(--success-bg)"
              : timerRunning
              ? "var(--danger-bg)"
              : "var(--surface-raised)",

            border: timerFinished
              ? "2px solid #5aa469"
              : timerRunning
              ? "2px solid #c66"
              : "1px solid var(--border)",

            padding: "6px",
            marginTop: "10px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            flexWrap: "nowrap",
          }}
        >
          <span
            style={{
              fontSize: "28px",
            }}
          >
            ⏱
          </span>

          <select
            style={{
              fontSize: "16px",
              padding: "4px",
            }}
            value={restMinutes}
            onChange={(e) => setRestMinutes(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            style={{
              fontSize: "16px",
              padding: "4px",
            }}
            value={restRemainder}
            onChange={(e) => setRestRemainder(Number(e.target.value))}
          >
            {[0, 5, 15, 30, 45].map((n) => (
              <option key={n} value={n}>
                {String(n).padStart(2, "0")}
              </option>
            ))}
          </select>

          <strong
            style={{
              fontSize: "20px",
              minWidth: "55px",
            }}
          >
            {String(Math.floor(restSeconds / 60)).padStart(2, "0")}:
            {String(restSeconds % 60).padStart(2, "0")}
          </strong>

          <button
            style={{
              padding: "8px 6px",
              fontSize: "20px",
              lineHeight: "1",
            }}
            onClick={() => {
              if (timerRunning) {
                setTimerPaused(true);

                setTimerRunning(false);
              } else {
                setTimerPaused(false);

                if (restSeconds <= 0) {
                  setRestSeconds(restMinutes * 60 + restRemainder);
                }

                setTimerStartedAt(
                  Date.now() -
                    (restMinutes * 60 + restRemainder - restSeconds) * 1000
                );

                setTimerFinished(false);
                setTimerRunning(true);
              }
            }}
          >
            {timerRunning ? "■" : "▶"}
          </button>

          <button
            style={{
              fontSize: "18px",
              padding: "8px 6px",
            }}
            onClick={() => {
              setTimerPaused(false);

              setTimerRunning(false);
              setTimerStartedAt(null);
              setTimerFinished(false);

              setRestSeconds(restMinutes * 60 + restRemainder);
            }}
          >
            ↺
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          minHeight: 0,
        }}
      >
        {restComplete && (
          <div
            style={{
              marginBottom: "10px",
              padding: "10px",
              textAlign: "center",
              fontWeight: "bold",
              border: "1px solid",
              borderRadius: "8px",
            }}
          >
            REST COMPLETE
          </div>
        )}

        <button
          aria-label={`Edit workout name: ${session.templateName}`}
          onClick={() => {
            setSessionNameDraft(session.templateName || "");
            setEditingSessionName(true);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-h)",
            display: "block",
            fontSize: "36px",
            fontWeight: "bold",
            lineHeight: 1.15,
            margin: "20px 0",
            minWidth: 0,
            overflow: "hidden",
            padding: 0,
            textAlign: "center",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        >
          {session.templateName}
        </button>

        {editingSessionName && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit workout name"
            style={{
              alignItems: "center",
              background: "rgba(0,0,0,.42)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              padding: "18px",
              position: "fixed",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "var(--surface-raised)",
                borderRadius: "12px",
                boxShadow: "0 10px 28px rgba(0,0,0,.25)",
                boxSizing: "border-box",
                maxWidth: "360px",
                padding: "16px",
                width: "100%",
              }}
            >
              <h2
                style={{
                  fontSize: "20px",
                  marginBottom: "12px",
                }}
              >
                Workout name
              </h2>
              <input
                autoFocus
                value={sessionNameDraft}
                onChange={(event) => setSessionNameDraft(event.target.value)}
                style={{
                  boxSizing: "border-box",
                  font: "inherit",
                  marginBottom: "12px",
                  minHeight: "42px",
                  padding: "7px 10px",
                  width: "100%",
                }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "space-between",
                }}
              >
                <button onClick={() => setEditingSessionName(false)}>
                  Cancel
                </button>
                <button
                  disabled={!sessionNameDraft.trim()}
                  onClick={saveSessionName}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <hr />

        {groupedExercises.map((group) => (
          <div
            key={group.group || group.exercises[0].id}
            style={{
            background: group.group ? "var(--surface-muted)" : "transparent",

              borderTop: group.group ? "3px solid #777" : "none",

              borderBottom: group.group ? "3px solid #777" : "none",

              padding: "12px",

              marginBottom: "8px",

              borderRadius: "8px",
            }}
          >
            {group.exercises.map((exercise) => (
              <div
                key={exercise.id}
                style={{
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <button
                      style={{
                        padding: "8px 6px",
                        fontSize: "20px",
                        lineHeight: "1",
                      }}
                      onClick={() =>
                        setExpandedNotes((s) => ({
                          ...s,
                          [exercise.id]: !s[exercise.id],
                        }))
                      }
                    >
                      ✏️
                    </button>{" "}
                    <strong>
                      <span
                        onClick={() =>
                          alert(getExerciseDetailText(exercise))
                        }
                        style={{
                          display: "inline-block",
                          maxWidth: "180px",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          lineHeight: "1.05",
                          fontSize: "14px",
                          textAlign: "left",
                          verticalAlign: "middle",
                          cursor: "pointer",
                        }}
                      >
                        {`${exercise.name}${
                          exercise.equipment?.[0]
                            ? ", " + exercise.equipment[0]
                            : ""
                        }`}
                      </span>
                    </strong>
                  </div>

                  <div>
                    <button
                      style={{
                        padding: "8px 6px",
                        fontSize: "20px",
                        lineHeight: "1",
                      }}
                      onClick={() => {
                        setShowAddExercise(false);
                        setReplacingExerciseId(
                          replacingExerciseId === exercise.id
                            ? null
                            : exercise.id
                        );

                        const originalExercise = exerciseLibrary.find(
                          (ex) => ex.name === exercise.name
                        );

                        setSelectedMuscle(originalExercise?.muscles?.[0] || "");

                        setSearch("");
                      }}
                    >
                      🔄
                    </button>{" "}
                    <button
                      style={{
                        padding: "8px 6px",
                        fontSize: "20px",
                        lineHeight: "1",
                      }}
                      onClick={() => setPendingDeleteExercise(exercise)}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {(expandedNotes[exercise.id] ||
                  exerciseMetadata?.[exercise.exerciseId]?.note?.trim()) && (
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                    }}
                  >
                    <input
                      placeholder="Notes"
                      style={{
                        width: "100%",
                        height: "20px",
                        fontSize: "0.85rem",
                        padding: "2px",
                      }}
                      value={
                        exerciseMetadata?.[exercise.exerciseId]?.note || ""
                      }
                      onChange={(e) =>
                        setExerciseMetadata({
                          ...exerciseMetadata,

                          [exercise.exerciseId]: {
                            ...(exerciseMetadata?.[exercise.exerciseId] || {}),

                            note: e.target.value,
                          },
                        })
                      }
                    />

                    <button
                      onClick={() => {
                        const updated = {
                          ...exerciseMetadata,
                        };

                        delete updated[exercise.exerciseId];

                        setExerciseMetadata(updated);

                        setExpandedNotes((notes) => ({
                          ...notes,

                          [exercise.id]: false,
                        }));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {
                  <>
                    <div
                      style={{
                        width: "120px",
                        height: "1px",
                        background: "var(--border)",
                        margin: "6px auto",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        fontSize: "14px",
                        fontWeight: "bold",
                        color: "var(--text-muted)",
                        marginBottom: "6px",
                        marginLeft: "0px",
                      }}
                    >
                      <span
                        style={{
                          width: "78px",
                          whiteSpace: "nowrap",
                          fontSize: "14px",
                        }}
                      >
                        🎯 Target
                      </span>

                      <span
                        style={{
                          width: "112px",
                          whiteSpace: "nowrap",
                          fontSize: "14px",
                        }}
                      >
                        ✍️ Actual
                      </span>

                      <span
                        style={{
                          marginLeft: "10px",
                          whiteSpace: "nowrap",
                          fontSize: "14px",
                        }}
                      >
                        🔋 {/* RIR */}
                      </span>

                      <span
                        style={{
                          marginLeft: "12px",
                          whiteSpace: "nowrap",
                          fontSize: "14px",
                        }}
                      >
                        🏋️ {/* e1RM */}
                      </span>

                      <span
                        style={{
                          marginLeft: "16px",
                          whiteSpace: "nowrap",
                          fontSize: "14px",
                        }}
                      >
                        ✅
                      </span>
                    </div>

                    {exercise.sets.map((set) => {
                      const isActive = activeSet?.setId === set.id;

                      const isCompleted = !!set.completed;

                      const valueColor = isActive
                        ? "#1976d2"
                        : isCompleted
                        ? "#444"
                        : "#aaa";

                      return (
                        <div
                          key={set.id}
                          ref={(el) => {
                            if (el) {
                              setRowRefs.current[set.id] = el;
                            }
                          }}
                          onClick={() => {
                            const blocked = exercise.sets

                              .slice(
                                0,

                                exercise.sets.findIndex((s) => s.id === set.id)
                              )

                              .some((s) => !s.completed);

                            if (!blocked) {
                              setActiveSet({
                                exerciseId: exercise.id,

                                setId: set.id,
                              });
                            }
                          }}
                          style={{
                            padding: "8px 2px",
                            marginBottom: "6px",
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "nowrap",
                            width: "calc(100% + 12px)",
                            marginRight: "-12px",
                            boxSizing: "border-box",
                            gap: "4px",

                            borderLeft: isActive ? "4px solid #1976d2" : "none",

                            background: isActive ? "#e3f2fd" : "transparent",

                            fontWeight: isActive ? "bold" : "normal",
                          }}
                        >
                          <div
                            style={{
                              width: "80px",
                              lineHeight: "1.1",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "11px",
                                textAlign: "left",
                              }}
                            >
                              {displayWeight(set.targetWeight)}×{set.targetReps}
                              {set.targetRir ? `@${set.targetRir}` : ""}
                            </div>

                            <div
                              style={{
                                fontSize: "10px",
                                color: "var(--text-muted)",
                                textAlign: "left",
                              }}
                            >
                              (
                              {calculateE1RM(
                                "",
                                "",
                                "",
                                set.targetWeight,
                                set.targetReps,
                                set.targetRir
                              )?.toFixed(1)}
                              )
                            </div>
                          </div>

                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setWeightPickerData({
                                  exerciseId: exercise.id,

                                  setId: set.id,

                                  value: set.actualWeight || set.targetWeight,
                                });

                                setShowWeightPicker(true);
                              }}
                              style={{
                                width: "50px",
                                marginLeft: "4px",
                                fontSize: "12px",
                                border: "1px solid var(--border)",
                                background: "var(--surface-raised)",
                                height: "24px",
                                textAlign: "center",
                                boxSizing: "border-box",
                                color: valueColor,
                                fontWeight: isActive ? "bold" : "normal",
                              }}
                            >
                              {weightUnit === "kg"
                                ? lbsToKg(set.actualWeight || set.targetWeight)
                                : set.actualWeight || set.targetWeight}
                            </button>

                            <span
                              style={{
                                fontSize: "12px",
                              }}
                            >
                              ×
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                setRepsPickerData({
                                  exerciseId: exercise.id,

                                  setId: set.id,

                                  value: Number(
                                    set.actualReps || set.targetReps || 0
                                  ),
                                });

                                setShowRepsPicker(true);
                              }}
                              style={{
                                width: "34px",
                                marginLeft: "0px",
                                fontSize: "12px",
                                border: "1px solid var(--border)",
                                background: "var(--surface-raised)",
                                height: "24px",
                                boxSizing: "border-box",
                                color: valueColor,
                                fontWeight: isActive ? "bold" : "normal",
                              }}
                            >
                              {set.actualReps || set.targetReps}
                            </button>

                            <span
                              style={{
                                marginLeft: "1px",
                                marginRight: "1px",
                                fontSize: "12px",
                              }}
                            >
                              @
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                setRirPickerData({
                                  exerciseId: exercise.id,

                                  setId: set.id,

                                  value: Number(
                                    set.actualRir || set.targetRir || 0
                                  ),
                                });

                                setShowRirPicker(true);
                              }}
                              style={{
                                width: "34px",
                                height: "24px",
                                marginLeft: "0px",
                                fontSize: "12px",
                                border: "1px solid var(--border)",
                                background: "var(--surface-raised)",
                                boxSizing: "border-box",
                                color: valueColor,
                                fontWeight: isActive ? "bold" : "normal",
                              }}
                            >
                              {set.actualRir || set.targetRir || 0}
                            </button>

                            <span
                              onClick={() => {
                                setE1RMExplorerData({
                                  exerciseId: exercise.id,

                                  setId: set.id,

                                  weight: set.actualWeight || set.targetWeight,

                                  reps: set.actualReps || set.targetReps,

                                  rir: set.actualRir || set.targetRir,
                                });

                                setShowE1RMExplorer(true);
                              }}
                              style={{
                                display: "inline-block",
                                width: "42px",
                                textAlign: "center",
                                fontSize: "13px",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                              }}
                            >
                              {weightUnit === "kg"
                                ? lbsToKg(
                                    calculateE1RM(
                                      set.actualWeight,
                                      set.actualReps,
                                      set.actualRir,

                                      set.targetWeight,
                                      set.targetReps,
                                      set.targetRir
                                    )?.toFixed(1)
                                  )
                                : calculateE1RM(
                                    set.actualWeight,
                                    set.actualReps,
                                    set.actualRir,

                                    set.targetWeight,
                                    set.targetReps,
                                    set.targetRir
                                  )?.toFixed(1)}
                            </span>
                          </span>

                          <button
                            style={{
                              padding: "4px 2px",
                              fontSize: "16px",
                              lineHeight: "1",
                            }}
                            disabled={
                              set.completed
                                ? exercise.sets
                                    .slice(
                                      exercise.sets.findIndex(
                                        (s) => s.id === set.id
                                      ) + 1
                                    )
                                    .some((s) => s.completed)
                                : activeSet?.setId !== set.id
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              markSetComplete(exercise.id, set.id);
                            }}
                          >
                            {set.completed ? "✓" : "○"}
                          </button>

                          <button
                            style={{
                              padding: "4px 2px",
                              fontSize: "16px",
                              lineHeight: "1",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();

                              setPendingDeleteSet({
                                exerciseId: exercise.id,
                                setId: set.id,
                              });
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      );
                    })}
                  </>
                }

                <button
                  onClick={() =>
                    addSet(
                      exercise.id,

                      [...exercise.sets]

                        .reverse()

                        .find((s) => s.actualWeight || s.targetWeight)
                    )
                  }
                >
                  + Add Set
                </button>
              </div>
            ))}
          </div>
        ))}

        <hr />

        {showAddExercise && (
          <ExercisePickerSheet
            title="Add exercise"
            actionLabel="Create exercise"
            exerciseLibrary={exerciseLibrary}
            search={search}
            selectedMuscle={selectedMuscle}
            setSearch={setSearch}
            setSelectedMuscle={setSelectedMuscle}
            onAction={() => {
              setShowAddExercise(false);
              setShowCreateExercise(true);
            }}
            onClose={() => {
              setShowAddExercise(false);
              setSearch("");
            }}
            onSelect={(exercise) => {
              setPendingExercise(exercise);
              setShowAddExercise(false);

              setNewExerciseValues({
                weight: exercise.lastWeight || "",
                reps: exercise.lastReps || "",
                rir: "",
                sets: "",
              });
            }}
          />
        )}

        {pendingExercise && (
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
                  width: "280px",
                  zIndex: 1000,
                  boxShadow: "0 4px 12px rgba(0,0,0,.2)",
                }}
              >
                <h3>
                  {`${pendingExercise.name}${
                    pendingExercise.equipment?.[0]
                      ? ", " + pendingExercise.equipment[0]
                      : ""
                  }`}
                </h3>

                <ExerciseSetupDialog
                  exercise={pendingExercise}
                  exerciseMetadata={exerciseMetadata}
                  getLatestWorkoutPerformance={getLatestWorkoutPerformance}
                  calculateE1RM={calculateE1RM}
                  values={newExerciseValues}
                  setValues={setNewExerciseValues}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <button
                    onClick={() => {
                      setPendingExercise(null);
                      setShowAddExercise(false);
                    }}
                  >
                    ✖️
                  </button>

                  <button
                    onClick={() =>
                      addExercise(
                        pendingExercise,
                        newExerciseValues.weight,
                        newExerciseValues.reps,
                        newExerciseValues.sets,
                        newExerciseValues.rir
                      )
                    }
                  >
                    ✔️
                  </button>
                </div>
              </div>
        )}

        {replacingExerciseId && !showReplaceExercise && (
          <ExercisePickerSheet
            title="Replace exercise"
            exerciseLibrary={exerciseLibrary}
            search={search}
            selectedMuscle={selectedMuscle}
            setSearch={setSearch}
            setSelectedMuscle={setSelectedMuscle}
            onClose={() => {
              setReplacingExerciseId(null);
              setSearch("");
            }}
            onSelect={(exercise) => {
              setReplacementTarget(replacingExerciseId);
              setReplacementExercise(exercise);
              setReplacementValues({
                weight: "",
                reps: "",
                rir: "",
                sets: "",
              });
              setShowReplaceExercise(true);
            }}
          />
        )}

        {showReplaceExercise && replacementExercise && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "var(--surface-raised)",
                padding: "20px",
                borderRadius: "8px",
                minWidth: "300px",
              }}
            >
              <h3>
                {`${replacementExercise.name}${
                  replacementExercise.equipment?.[0]
                    ? ", " + replacementExercise.equipment[0]
                    : ""
                }`}
              </h3>

              <ExerciseSetupDialog
                exercise={replacementExercise}
                exerciseMetadata={exerciseMetadata}
                getLatestWorkoutPerformance={getLatestWorkoutPerformance}
                calculateE1RM={calculateE1RM}
                values={replacementValues}
                setValues={setReplacementValues}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "20px",
                }}
              >
                <button
                  onClick={() => {
                    setShowReplaceExercise(false);
                    setReplacingExerciseId(null);
                    setReplacementExercise(null);
                    setReplacementTarget(null);
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    replaceExercise(
                      replacementTarget,
                      replacementExercise,
                      replacementValues
                    );

                    setShowReplaceExercise(false);
                    setReplacementExercise(null);
                    setReplacementTarget(null);
                  }}
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        <>
          <hr
            style={{
              margin: "16px 0",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <button
              style={{
                padding: "10px 14px",
              }}
              onClick={() => {
                setShowAddExercise((isOpen) => !isOpen);
                setReplacingExerciseId(null);
                setSearch("");
              }}
            >
              {showAddExercise ? "✕ Cancel" : "+ Add Exercise"}
            </button>

            <button
              style={{
                padding: "10px 14px",
              }}
              onClick={() => setShowSupersetEditor(true)}
            >
              🔗 Supersets
            </button>

            <button
              ref={completeWorkoutButtonRef}
              style={{
                padding: "10px 14px",

                border: allSetsCompleted ? "3px solid #4caf50" : undefined,

                boxShadow: allSetsCompleted
                  ? "0 0 8px rgba(76,175,80,.5)"
                  : undefined,

                fontWeight: allSetsCompleted ? "bold" : undefined,
              }}
              onClick={() => setConfirmComplete(true)}
            >
              Complete Workout
            </button>
          </div>

          {showSupersetEditor && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-end",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  background: "var(--surface-raised)",
                  borderRadius: "18px 18px 0 0",
                  boxSizing: "border-box",
                  maxHeight: "78vh",
                  overflowY: "auto",
                  padding: "16px",
                  paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "18px",
                      margin: 0,
                    }}
                  >
                    Supersets
                  </h2>

                  <button onClick={() => setShowSupersetEditor(false)}>
                    ✕
                  </button>
                </div>

                {session.exercises.map((exercise) => (
                  <div
                    key={exercise.id}
                    style={{
                      alignItems: "center",
                      borderBottom: "1px solid var(--border)",
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      padding: "10px 0",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          lineHeight: 1.15,
                        }}
                      >
                        {exercise.name}
                      </div>

                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "3px",
                        }}
                      >
                        {exercise.supersetGroup
                          ? `Linked as ${exercise.supersetGroup}`
                          : "Not linked"}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const group = prompt(
                          "Superset group (A, B, etc). Use the same group for exercises you want linked.",
                          exercise.supersetGroup || ""
                        );

                        if (group === null) {
                          return;
                        }

                        updateExerciseSupersetGroup(
                          exercise.id,
                          group.trim() || null
                        );
                      }}
                    >
                      Set
                    </button>

                    <button
                      disabled={!exercise.supersetGroup}
                      onClick={() =>
                        updateExerciseSupersetGroup(exercise.id, null)
                      }
                    >
                      Clear
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showCreateExercise && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "rgba(0,0,0,.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  background: "var(--surface-raised)",
                  borderRadius: "12px",
                  padding: "20px",
                  minWidth: "280px",
                  boxShadow: "0 0 20px rgba(0,0,0,.35)",
                }}
              >
                <h3>Create Exercise</h3>

                <input
                  placeholder="Exercise name"
                  value={newExercise.name}
                  onChange={(e) =>
                    setNewExercise({
                      ...newExercise,
                      name: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "8px",
                    boxSizing: "border-box",
                  }}
                />

                <select
                  value={newExercise.muscle}
                  onChange={(e) =>
                    setNewExercise({
                      ...newExercise,
                      muscle: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "8px",
                  }}
                >
                  <option value="">Select muscle</option>

                  {muscleGroups.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={newExercise.equipment}
                  onChange={(e) =>
                    setNewExercise({
                      ...newExercise,
                      equipment: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "8px",
                  }}
                >
                  <option value="">Select equipment</option>

                  {equipmentOptions.map((equipment) => (
                    <option key={equipment} value={equipment}>
                      {equipment}
                    </option>
                  ))}
                </select>

                <div
                  style={{
                    marginTop: "20px",
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button onClick={() => setShowCreateExercise(false)}>
                    Cancel
                  </button>

                  <button
                    onClick={() => {
                      if (!newExercise.name.trim()) return;

                      const createdExercise = {
                        id: Date.now(),

                        name: newExercise.name.trim(),

                        muscles: [newExercise.muscle],

                        equipment: [newExercise.equipment],
                      };

                      setExerciseLibrary([...exerciseLibrary, createdExercise]);

                      setPendingExercise(createdExercise);

                      setShowCreateExercise(false);

                      setNewExercise({
                        name: "",
                        muscle: "",
                        equipment: "",
                      });
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {confirmComplete && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "rgba(0,0,0,.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  background: "var(--success-bg)",
                  color: "var(--success-text)",
                  border: "2px solid #5aa469",
                  borderRadius: "12px",
                  padding: "20px",
                  minWidth: "260px",
                  boxShadow: "0 0 20px rgba(0,0,0,.35)",
                }}
              >
                <div
                  style={{
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      fontWeight: "bold",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "56px",
                        marginBottom: "24px",
                      }}
                    >
                      💪
                    </div>
                    <div>Complete Workout?</div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <button onClick={() => setConfirmComplete(false)}>✖️</button>

                  <button
                    onClick={() => {
                      let completedWorkout = {
                        ...session,
                        completedAt: new Date().toLocaleDateString(),
                      };

                      if (hasStructuralChanges()) {
                        const original = templates.find(
                          (t) => t.id === session.templateId
                        );

                        const derived = {
                          ...original,

                          id: Date.now(),

                          name: `${original.name} (modified)`,

                          parentTemplateId: original.id,

                          lastCompleted: completedWorkout.completedAt,

                          exercises: session.exercises.map((ex) => ({
                            ...ex,
                            sets: ex.sets
                              .filter(
                                (set) => set.actualWeight && set.actualReps
                              )
                              .map((set) => ({
                                id: Date.now() + Math.random(),

                                targetWeight: set.actualWeight,

                                targetReps: set.actualReps,

                                targetRir: set.actualRir || "",
                              })),
                          })),
                        };

                        completedWorkout = {
                          ...completedWorkout,

                          templateId: derived.id,

                          templateName: derived.name,
                        };

                        setTemplates([...templates, derived]);
                      }

                      const metadataUpdates = {
                        ...exerciseMetadata,
                      };

                      completedWorkout.exercises.forEach((exercise) => {
                        let bestE1RM = null;

                        exercise.sets.forEach((set) => {
                          const e1rm = calculateE1RM(
                            set.actualWeight || set.targetWeight,
                            set.actualReps || set.targetReps,
                            set.actualRir ?? set.targetRir
                          );

                          if (e1rm && (bestE1RM === null || e1rm > bestE1RM)) {
                            bestE1RM = e1rm;
                          }
                        });

                        if (bestE1RM === null) {
                          return;
                        }

                        const existing =
                          metadataUpdates[exercise.exerciseId] || {};

                        metadataUpdates[exercise.exerciseId] = {
                          ...existing,

                          latestE1RM: {
                            value: bestE1RM,
                            date: completedWorkout.completedAt,
                          },

                          maxE1RM:
                            !existing.maxE1RM ||
                            bestE1RM > existing.maxE1RM.value
                              ? {
                                  value: bestE1RM,
                                  date: completedWorkout.completedAt,
                                }
                              : existing.maxE1RM,
                        };
                      });

                      setExerciseMetadata(metadataUpdates);

                      setHistory([completedWorkout, ...history]);

                      if (!hasStructuralChanges()) {
                        setTemplates(
                          templates.map((t) =>
                            t.id === session.templateId
                              ? {
                                  ...t,

                                  name: completedWorkout.templateName,

                                  lastCompleted: completedWorkout.completedAt,

                                  exercises: session.exercises.map((ex) => ({
                                    ...ex,

                                    sets: ex.sets
                                      .filter(
                                        (set) =>
                                          set.actualWeight && set.actualReps
                                      )
                                      .map((set) => ({
                                        id: Date.now() + Math.random(),

                                        targetWeight: set.actualWeight,

                                        targetReps: set.actualReps,

                                        targetRir: set.actualRir || "",
                                      })),
                                  })),
                                }
                              : t
                          )
                        );
                      }

                      setSessions(sessions.filter((s) => s.id !== session.id));

                      setSelectedSessionId(null);

                      setSelectedTemplateId(null);
                    }}
                  >
                    ✔️
                  </button>
                </div>
              </div>
            </div>
          )}

          <E1RMExplorerModal
            isOpen={showE1RMExplorer}
            onClose={() => setShowE1RMExplorer(false)}
            setData={e1RMExplorerData}
            onSelectOption={(option) => {
              if (!e1RMExplorerData) {
                return;
              }

              updateActual(
                e1RMExplorerData.exerciseId,
                e1RMExplorerData.setId,
                "actualWeight",
                String(option.weight)
              );

              updateActual(
                e1RMExplorerData.exerciseId,
                e1RMExplorerData.setId,
                "actualReps",
                String(option.reps)
              );
            }}
          />

          <WeightPickerModal
            isOpen={showWeightPicker}
            onClose={() => {
              setShowWeightPicker(false);
              setWeightPickerData(null);
            }}
            value={weightPickerData?.value}
            weightUnit={weightUnit}
            onSelect={(value) => {
              if (!weightPickerData) {
                return;
              }

              updateActual(
                weightPickerData.exerciseId,
                weightPickerData.setId,
                "actualWeight",
                String(value)
              );
            }}
          />

          <WeightPickerModal
            isOpen={showRirPicker}
            onClose={() => {
              setShowRirPicker(false);
              setRirPickerData(null);
            }}
            value={rirPickerData?.value}
            title="Select RIR"
            values={[0, 1, 2, 3, 4, 5, 6]}
            onSelect={(value) => {
              if (!rirPickerData) {
                return;
              }

              updateActual(
                rirPickerData.exerciseId,
                rirPickerData.setId,
                "actualRir",
                String(value)
              );
            }}
          />

          <WeightPickerModal
            isOpen={showRepsPicker}
            onClose={() => {
              setShowRepsPicker(false);
              setRepsPickerData(null);
            }}
            value={repsPickerData?.value}
            increment={1}
            title="Select Reps"
            values={Array.from({ length: 20 }, (_, i) => i + 1)}
            onSelect={(value) => {
              if (!repsPickerData) {
                return;
              }

              updateActual(
                repsPickerData.exerciseId,
                repsPickerData.setId,
                "actualReps",
                String(value)
              );
            }}
          />
        </>
      </div>
    </div>
  );
}
