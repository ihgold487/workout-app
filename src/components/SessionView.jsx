import { useState, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  BatteryMedium,
  Check,
  CheckCircle2,
  Circle,
  Dumbbell,
  Flame,
  Hash,
  History,
  Link2,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Target,
  Timer,
  Trash2,
  Trophy,
  Weight,
  X,
} from "lucide-react";
import { equipmentOptions } from "../data/seedEquipment";
import WeightPickerModal from "./WeightPickerModal";
import ExerciseSetupDialog from "./ExerciseSetupDialog";
import ExercisePickerSheet from "./ExercisePickerSheet";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExerciseThumbnail from "./ExerciseThumbnail";
import { calculateE1RM } from "../utils/e1rm";
import { EXERCISE_STATUS } from "../utils/exerciseStatus";
import { recommendSetTarget } from "../utils/targetRecommendation";
import {
  getExerciseWeightIncrement,
  roundWeightToIncrement,
} from "../utils/weightIncrement";

const RIR_PICKER_VALUES = Array.from({ length: 13 }, (_, index) => index * 0.5);

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
  size = 36,
  style,
  tone = "neutral",
  type = "button",
}) {
  const toneColor =
    tone === "danger"
      ? "var(--danger-text)"
      : tone === "success"
      ? "var(--success-text)"
      : "var(--text)";

  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type={type}
      style={{
        alignItems: "center",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        color: toneColor,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        flex: `0 0 ${size}px`,
        height: `${size}px`,
        justifyContent: "center",
        lineHeight: 1,
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        width: `${size}px`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SortableExerciseThumbnail({ children, exerciseId }) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: exerciseId,
  });
  const style = {
    opacity: isDragging ? 0.72 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 3 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        attributes,
        isDragging,
        listeners,
      })}
    </div>
  );
}

function formatList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value || "";
}

function normalizeLookupValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getExerciseKey(exercise) {
  return `${normalizeLookupValue(exercise?.name)}||${normalizeLookupValue(
    formatList(exercise?.equipment)
  )}`;
}

function getWorkoutDurationSeconds(session, now = Date.now()) {
  const baseSeconds = Number(session?.workoutTimerBaseSeconds || 0);

  if (session?.workoutTimerPaused) {
    return Math.max(0, Math.floor(baseSeconds));
  }

  const resumedAt =
    session?.workoutTimerResumedAtIso ||
    session?.workoutStartedAtIso ||
    session?.startedAtIso;
  const resumedAtMs = resumedAt ? new Date(resumedAt).getTime() : NaN;

  if (!Number.isFinite(resumedAtMs)) {
    return Math.max(0, Math.floor(baseSeconds));
  }

  return Math.max(0, Math.floor(baseSeconds + (now - resumedAtMs) / 1000));
}

function formatWorkoutDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}

export default function SessionView({
  session,
  sessions,
  setSessions,
  history,
  setHistory,
  plans = [],
  setPlans,
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
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [weightPickerData, setWeightPickerData] = useState(null);
  const [showRepsPicker, setShowRepsPicker] = useState(false);
  const [repsPickerData, setRepsPickerData] = useState(null);
  const [showRirPicker, setShowRirPicker] = useState(false);
  const [rirPickerData, setRirPickerData] = useState(null);
  const [showApplyChangesPrompt, setShowApplyChangesPrompt] = useState(false);
  const [targetAlternativesData, setTargetAlternativesData] = useState(null);
  const [targetAlternativesClosing, setTargetAlternativesClosing] =
    useState(false);
  const targetPressTimerRef = useRef(null);
  const targetLongPressRef = useRef(false);
  const appliedHistoryDefaultsRef = useRef(new Set());
  const wakeLockRef = useRef(null);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const [detailExercise, setDetailExercise] = useState(null);
  const [warmupExerciseId, setWarmupExerciseId] = useState(null);
  const previousExercisePanelIdRef = useRef(null);
  const [exercisePanelTransition, setExercisePanelTransition] = useState({
    direction: "next",
    sequence: 0,
  });

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

  function displayHistoricalValue(value) {
    return isBlankValue(value) ? "—" : value;
  }

  function displayHistoricalWeight(weight) {
    return isBlankValue(weight)
      ? "—"
      : weightUnit === "kg"
      ? lbsToKg(weight)
      : weight;
  }

  function createCompletedWorkoutId(sessionId) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${sessionId}:completed:${crypto.randomUUID()}`;
    }

    return `${sessionId}:completed:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  function getExerciseDetailRecord(sessionExercise) {
    const sessionKey = getExerciseKey(sessionExercise);
    const idMatch = sessionExercise.exerciseId
      ? exerciseLibrary.find(
          (exercise) =>
            String(exercise.id) === String(sessionExercise.exerciseId)
        )
      : null;
    const keyMatches = exerciseLibrary.filter(
      (exercise) => getExerciseKey(exercise) === sessionKey
    );
    const keyMatchWithImage = keyMatches.find((exercise) => exercise.imageUrl);
    const libraryExercise =
      keyMatchWithImage || keyMatches[0] || idMatch || null;

    const muscles = Array.isArray(sessionExercise.muscles)
      ? sessionExercise.muscles
      : Array.isArray(libraryExercise?.muscles)
      ? libraryExercise.muscles
      : [
          sessionExercise.primaryMuscle || sessionExercise.planMuscle,
          ...(Array.isArray(sessionExercise.secondaryMuscles)
            ? sessionExercise.secondaryMuscles
            : []),
        ].filter(Boolean);

    return {
      ...(libraryExercise || {}),
      ...sessionExercise,
      equipment: sessionExercise.equipment || libraryExercise?.equipment || [],
      id:
        sessionExercise.exerciseId || libraryExercise?.id || sessionExercise.id,
      imageAlt: libraryExercise?.imageAlt || sessionExercise.imageAlt || "",
      imageUrl: libraryExercise?.imageUrl || sessionExercise.imageUrl || "",
      muscles,
    };
  }

  const exerciseMatchesHistoryExercise = useCallback((sessionExercise, historyExercise) => {
    if (sessionExercise.exerciseId && historyExercise.exerciseId) {
      return String(sessionExercise.exerciseId) === String(historyExercise.exerciseId);
    }

    return getExerciseKey(sessionExercise) === getExerciseKey(historyExercise);
  }, []);

  const isCurrentSessionHistoryWorkout = useCallback((historyWorkout) => {
    return (
      String(historyWorkout.id) === String(session.id) ||
      String(historyWorkout.sourceSessionId || "") === String(session.id)
    );
  }, [session.id]);

  const getLatestMatchingHistoryPerformance = useCallback((sessionExercise) => {
    const workout = history.find((historyWorkout) => {
      if (isCurrentSessionHistoryWorkout(historyWorkout)) {
        return false;
      }

      return historyWorkout.exercises?.some((historyExercise) =>
        exerciseMatchesHistoryExercise(sessionExercise, historyExercise)
      );
    });

    const exercise = workout?.exercises?.find((historyExercise) =>
      exerciseMatchesHistoryExercise(sessionExercise, historyExercise)
    );

    return workout && exercise ? { exercise, workout } : null;
  }, [
    exerciseMatchesHistoryExercise,
    history,
    isCurrentSessionHistoryWorkout,
  ]);

  function getLatestWorkoutPerformance(exerciseId) {
    const sessionExercise = session.exercises.find(
      (exercise) => exercise.exerciseId === exerciseId || exercise.id === exerciseId
    );

    if (!sessionExercise) {
      return null;
    }

    const latestPerformance =
      getLatestMatchingHistoryPerformance(sessionExercise);

    if (!latestPerformance) {
      return null;
    }

    return {
      completedAt: latestPerformance.workout.completedAt,

      sets: latestPerformance.exercise.sets,
    };
  }

  function getLatestActualForSet(sessionExercise, setIndex) {
    const historySet =
      getLatestMatchingHistoryPerformance(sessionExercise)?.exercise?.sets?.[
        setIndex
      ];

    if (!historySet) {
      return null;
    }

    const weight = firstPresentValue(historySet.actualWeight);
    const reps = firstPresentValue(historySet.actualReps);
    const rir = firstPresentValue(historySet.actualRir);

    if (isBlankValue(weight) && isBlankValue(reps) && isBlankValue(rir)) {
      return null;
    }

    return {
      e1rm: isBlankValue(weight) || isBlankValue(reps)
        ? null
        : calculateE1RM(weight, reps, rir),
      reps,
      rir,
      weight,
    };
  }

  function getLinkedPlan() {
    return plans.find((plan) => String(plan.id) === String(session.planId));
  }

  function getGoalMode() {
    const goal = getLinkedPlan()?.goal;

    return goal === "progress" ? "progress" : "maintenance";
  }

  function getPlanTargetValues() {
    const config = getLinkedPlan()?.config || {};

    return {
      reps:
        config.reps == null || config.reps === "" ? "" : String(config.reps),
      rir: config.rir == null || config.rir === "" ? "" : String(config.rir),
    };
  }

  function getRecommendedTargetWeight(exercise, reps, rir, setIndex = 0) {
    const recommendation = recommendSetTarget({
      exercise,
      goalMode: getGoalMode(),
      history,
      setIndex,
      targetReps: reps,
      targetRir: rir,
      weightIncrement: getExerciseWeightIncrement(exercise),
    });

    const weight = recommendation.result?.recommendation?.weight;

    return weight != null ? String(weight) : "";
  }

  function getTargetRecommendation(exercise, set, setIndex) {
    return recommendSetTarget({
      allowedRepWindow: 2,
      exercise,
      goalMode: getGoalMode(),
      history,
      preferredRepWindow: 2,
      setIndex,
      targetReps: set.targetReps,
      targetRir: set.targetRir,
      weightIncrement: getExerciseWeightIncrement(exercise),
    });
  }

  function firstPresentValue(...values) {
    const value = values.find((item) => item != null && item !== "");

    return value == null ? "" : value;
  }

  function formatSetupDefault(value) {
    return value == null || value === "" ? "" : String(value);
  }

  const getHistoryDefaultsForSet = useCallback((sessionExercise, setIndex) => {
    const historySet =
      getLatestMatchingHistoryPerformance(sessionExercise)?.exercise?.sets?.[
        setIndex
      ];

    if (!historySet) {
      return null;
    }

    return {
      actualReps: formatSetupDefault(
        firstPresentValue(historySet.actualReps, historySet.targetReps)
      ),
      actualRir: formatSetupDefault(
        firstPresentValue(historySet.actualRir, historySet.targetRir)
      ),
      actualWeight: formatSetupDefault(
        firstPresentValue(historySet.actualWeight, historySet.targetWeight)
      ),
    };
  }, [getLatestMatchingHistoryPerformance]);

  function isBlankValue(value) {
    return value == null || value === "";
  }

  function formatPrescriptionLabel(prescription) {
    if (!prescription) {
      return "";
    }

    return `${prescription.weight} × ${prescription.reps} @ ${prescription.rir}`;
  }

  function parseSessionNumber(value) {
    if (value === "" || value == null) {
      return null;
    }

    const parsed = Number.parseFloat(String(value).replace(/^\+/, ""));

    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatWarmupWeight(value) {
    if (value == null || !Number.isFinite(value)) {
      return "—";
    }

    const displayValue = weightUnit === "kg" ? Number(lbsToKg(value)) : value;

    return Number.isInteger(displayValue)
      ? String(displayValue)
      : displayValue.toFixed(1).replace(/\.0$/, "");
  }

  function formatWarmupPercent(value) {
    return value == null || !Number.isFinite(value)
      ? "—"
      : `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
  }

  function chooseWarmupWeight(
    baseE1RM,
    reps,
    rir,
    targetPercent,
    weightIncrement
  ) {
    const rawWeight = (baseE1RM * targetPercent) / (1 + (reps + rir) / 30);
    const roundedWeight = roundWeightToIncrement(rawWeight, weightIncrement);
    const increment =
      Number(weightIncrement) > 0 ? Number(weightIncrement) : null;
    const candidateWeights = increment
      ? Array.from({ length: 11 }, (_, index) =>
          roundWeightToIncrement(
            Math.max(0, roundedWeight + (index - 5) * increment),
            increment
          )
        )
      : [roundedWeight];
    const candidates = candidateWeights
      .filter((candidate) => candidate > 0)
      .map((candidate) => {
        const e1rm = calculateE1RM(candidate, reps, rir);

        return {
          e1rm,
          percent: e1rm / baseE1RM,
          weight: candidate,
        };
      })
      .sort(
        (a, b) =>
          Math.abs(a.percent - targetPercent) -
            Math.abs(b.percent - targetPercent) || a.weight - b.weight
      );

    return candidates[0] || null;
  }

  function chooseWarmupWeightInRange(
    baseE1RM,
    reps,
    rir,
    minPercent,
    maxPercent,
    weightIncrement
  ) {
    const midpoint = (minPercent + maxPercent) / 2;
    const rawWeight = (baseE1RM * midpoint) / (1 + (reps + rir) / 30);
    const roundedWeight = roundWeightToIncrement(rawWeight, weightIncrement);
    const increment =
      Number(weightIncrement) > 0 ? Number(weightIncrement) : null;
    const candidateWeights = increment
      ? Array.from({ length: 11 }, (_, index) =>
          roundWeightToIncrement(
            Math.max(0, roundedWeight + (index - 5) * increment),
            increment
          )
        )
      : [roundedWeight];
    const candidates = candidateWeights
      .filter((candidate) => candidate > 0)
      .map((candidate) => {
        const e1rm = calculateE1RM(candidate, reps, rir);
        const percent = e1rm / baseE1RM;
        const inRange = percent >= minPercent && percent <= maxPercent;
        const rangeDistance =
          percent < minPercent
            ? minPercent - percent
            : percent > maxPercent
            ? percent - maxPercent
            : 0;

        return {
          e1rm,
          inRange,
          percent,
          rangeDistance,
          weight: candidate,
        };
      })
      .sort(
        (a, b) =>
          Number(b.inRange) - Number(a.inRange) ||
          a.rangeDistance - b.rangeDistance ||
          Math.abs(a.percent - midpoint) - Math.abs(b.percent - midpoint) ||
          a.weight - b.weight
      );

    return candidates[0] || null;
  }

  function getWarmupRecommendations(exercise) {
    const firstSet = exercise?.sets?.[0];

    if (!firstSet) {
      return null;
    }

    const baseWeight = parseSessionNumber(
      firstSet.actualWeight
    );
    const baseReps = parseSessionNumber(
      firstSet.actualReps
    );
    const targetRir = parseSessionNumber(
      firstPresentValue(firstSet.actualRir, 0)
    );
    const baseE1RM = calculateE1RM(baseWeight, baseReps, targetRir);
    const weightIncrement = getExerciseWeightIncrement(exercise);

    if (
      baseWeight == null ||
      baseReps == null ||
      targetRir == null ||
      baseE1RM == null
    ) {
      return {
        baseE1RM: null,
        baseReps,
        baseWeight,
        targetRir,
      };
    }

    return {
      baseE1RM,
      baseReps,
      baseWeight,
      options: [
        {
          label: "2 warmup sets",
          sets: [
            {
              note: "35-40% e1RM",
              reps: 9,
              target: chooseWarmupWeightInRange(
                baseE1RM,
                9,
                targetRir,
                0.35,
                0.4,
                weightIncrement
              ),
            },
            {
              note: "Closest to 65% e1RM",
              reps: 7,
              target: chooseWarmupWeight(
                baseE1RM,
                7,
                targetRir,
                0.65,
                weightIncrement
              ),
            },
          ],
        },
        {
          label: "1 warmup set",
          sets: [
            {
              note: "50-55% e1RM",
              reps: 8,
              target: chooseWarmupWeightInRange(
                baseE1RM,
                8,
                targetRir,
                0.5,
                0.55,
                weightIncrement
              ),
            },
          ],
        },
      ],
      targetRir,
    };
  }

  function getReplacementDefaults(oldExerciseId, newExercise) {
    const replacedExercise = session.exercises.find(
      (exercise) => exercise.id === oldExerciseId
    );
    const firstSet = replacedExercise?.sets?.[0] || {};
    const reps = firstPresentValue(firstSet.targetReps, firstSet.actualReps);
    const rir = firstPresentValue(firstSet.targetRir, firstSet.actualRir);

    return {
      reps: formatSetupDefault(reps),
      rir: formatSetupDefault(rir),
      sets: replacedExercise?.sets?.length
        ? String(replacedExercise.sets.length)
        : "",
      weight: getRecommendedTargetWeight(newExercise, reps, rir),
    };
  }

  function getAddExerciseDefaults(exercise) {
    const previousExercise = session.exercises[session.exercises.length - 1];
    const previousFirstSet = previousExercise?.sets?.[0] || {};
    const planTargets = getPlanTargetValues();
    const reps = firstPresentValue(
      planTargets.reps,
      previousFirstSet.targetReps,
      previousFirstSet.actualReps
    );
    const rir = firstPresentValue(
      planTargets.rir,
      previousFirstSet.targetRir,
      previousFirstSet.actualRir
    );

    return {
      reps: formatSetupDefault(reps),
      rir: formatSetupDefault(rir),
      sets: "3",
      weight: getRecommendedTargetWeight(exercise, reps, rir),
    };
  }

  const [selectedMuscle, setSelectedMuscle] = useState("");

  const [activeSet, setActiveSet] = useState({
    exerciseId: session.exercises[0]?.id,

    setId: session.exercises[0]?.sets[0]?.id,
  });

  const setRowRefs = useRef({});
  const completeWorkoutButtonRef = useRef(null);
  const wasAllSetsCompletedRef = useRef(false);
  const exerciseDragSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 350,
        tolerance: 8,
      },
    })
  );

  const updateSession = useCallback(
    (updater) => {
      setSessions((prevSessions) =>
        prevSessions.map((s) => (s.id === session.id ? updater(s) : s))
      );
    },
    [session.id, setSessions]
  );

  useEffect(() => {
    let hasUpdates = false;
    const nextAppliedKeys = new Set(appliedHistoryDefaultsRef.current);

    const exercises = session.exercises.map((exercise) => {
      let exerciseChanged = false;
      const sets = exercise.sets.map((set, setIndex) => {
        const defaultKey = `${session.id}:${exercise.id}:${set.id}`;

        if (nextAppliedKeys.has(defaultKey)) {
          return set;
        }

        const defaults = getHistoryDefaultsForSet(exercise, setIndex);

        if (!defaults) {
          return set;
        }

        nextAppliedKeys.add(defaultKey);

        const updates = {};

        if (isBlankValue(set.actualWeight) && defaults.actualWeight) {
          updates.actualWeight = defaults.actualWeight;
        }

        if (isBlankValue(set.actualReps) && defaults.actualReps) {
          updates.actualReps = defaults.actualReps;
        }

        if (isBlankValue(set.actualRir) && defaults.actualRir !== "") {
          updates.actualRir = defaults.actualRir;
        }

        if (!Object.keys(updates).length) {
          return set;
        }

        hasUpdates = true;
        exerciseChanged = true;

        return {
          ...set,
          ...updates,
        };
      });

      return exerciseChanged
        ? {
            ...exercise,
            sets,
          }
        : exercise;
    });

    appliedHistoryDefaultsRef.current = nextAppliedKeys;

    if (!hasUpdates) {
      return;
    }

    updateSession((s) => ({
      ...s,
      exercises,
    }));
  }, [
    getHistoryDefaultsForSet,
    session.exercises,
    session.id,
    updateSession,
  ]);

  function idsMatch(left, right) {
    return String(left) === String(right);
  }

  function resetSupersetOrders(supersetOrders, groupsToReset) {
    if (!groupsToReset.size) {
      return supersetOrders || {};
    }

    return Object.fromEntries(
      Object.entries(supersetOrders || {}).filter(
        ([group]) => !groupsToReset.has(group)
      )
    );
  }

  function handleExerciseThumbnailDragEnd({ active, over }) {
    window.getSelection?.()?.removeAllRanges();

    if (!over || idsMatch(active.id, over.id)) {
      return;
    }

    updateSession((s) => {
      const exercises = s.exercises || [];
      const activeIndex = exercises.findIndex((exercise) =>
        idsMatch(exercise.id, active.id)
      );
      const overIndex = exercises.findIndex((exercise) =>
        idsMatch(exercise.id, over.id)
      );

      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
        return s;
      }

      const activeExercise = exercises[activeIndex];
      const activeGroup = activeExercise.supersetGroup || null;
      const groupsToReset = new Set();
      let nextExercises;

      if (activeGroup) {
        const groupExercises = exercises.filter(
          (exercise) => exercise.supersetGroup === activeGroup
        );
        const firstGroupExercise = groupExercises[0];
        const isSupersetLeader = idsMatch(firstGroupExercise?.id, active.id);

        if (isSupersetLeader) {
          if (groupExercises.some((exercise) => idsMatch(exercise.id, over.id))) {
            return s;
          }

          const remainingExercises = exercises.filter(
            (exercise) => exercise.supersetGroup !== activeGroup
          );
          const remainingOverIndex = remainingExercises.findIndex((exercise) =>
            idsMatch(exercise.id, over.id)
          );

          if (remainingOverIndex < 0) {
            return s;
          }

          const insertIndex =
            activeIndex < overIndex ? remainingOverIndex + 1 : remainingOverIndex;

          nextExercises = [
            ...remainingExercises.slice(0, insertIndex),
            ...groupExercises,
            ...remainingExercises.slice(insertIndex),
          ];
        } else {
          groupsToReset.add(activeGroup);
          nextExercises = arrayMove(exercises, activeIndex, overIndex).map(
            (exercise) =>
              idsMatch(exercise.id, active.id)
                ? {
                    ...exercise,
                    supersetGroup: null,
                  }
                : exercise
          );
        }
      } else {
        nextExercises = arrayMove(exercises, activeIndex, overIndex);
      }

      return {
        ...s,
        templateChanged: true,
        supersetOrders: resetSupersetOrders(s.supersetOrders, groupsToReset),
        exercises: nextExercises,
      };
    });
  }

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

  function applyTargetToActual(exerciseId, setId) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);
    const set = exercise?.sets.find((item) => item.id === setId);

    if (!set) {
      return;
    }

    applyPrescriptionToActual(exerciseId, setId, {
      reps: set.targetReps,
      rir: set.targetRir,
      weight: set.targetWeight,
    });
  }

  function applyPrescriptionToActual(exerciseId, setId, prescription) {
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
                      actualReps: formatSetupDefault(prescription.reps),
                      actualRir: formatSetupDefault(prescription.rir),
                      actualWeight: formatSetupDefault(prescription.weight),
                    }
                  : set
              ),
            }
          : ex
      ),
    }));
  }

  function openTargetAlternatives(exercise, set, setIndex) {
    const recommendation = getTargetRecommendation(exercise, set, setIndex);
    const current = getLatestActualForSet(exercise, setIndex);
    const suggested = {
      e1rm: calculateE1RM(
        "",
        "",
        "",
        set.targetWeight,
        set.targetReps,
        set.targetRir
      ),
      reps: set.targetReps,
      rir: set.targetRir,
      weight: set.targetWeight,
    };
    const alternatives = recommendation.result?.alternatives || [];

    window.getSelection?.()?.removeAllRanges();

    setTargetAlternativesClosing(false);
    setTargetAlternativesData({
      alternatives,
      current,
      exerciseId: exercise.id,
      setId: set.id,
      suggested,
    });
  }

  function closeTargetAlternatives({ immediate = false } = {}) {
    if (immediate) {
      setTargetAlternativesClosing(false);
      setTargetAlternativesData(null);
      return;
    }

    setTargetAlternativesClosing(true);
  }

  function cancelTargetPressTimer() {
    if (targetPressTimerRef.current) {
      clearTimeout(targetPressTimerRef.current);
      targetPressTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!activeSet) return;

    const exercise = session.exercises.find(
      (ex) => ex.id === activeSet.exerciseId
    );

    const setIndex = exercise?.sets.findIndex((s) => s.id === activeSet.setId);

    const currentSet = exercise?.sets[setIndex];

    if (!exercise || !currentSet || setIndex < 0) {
      return;
    }

    const defaults = getHistoryDefaultsForSet(exercise, setIndex) || {
      actualReps: formatSetupDefault(currentSet.targetReps),
      actualRir: formatSetupDefault(currentSet.targetRir),
      actualWeight: "",
    };
    const updates = {};

    if (isBlankValue(currentSet.actualWeight) && defaults.actualWeight) {
      updates.actualWeight = defaults.actualWeight;
    }

    if (isBlankValue(currentSet.actualReps) && defaults.actualReps) {
      updates.actualReps = defaults.actualReps;
    }

    if (isBlankValue(currentSet.actualRir) && defaults.actualRir !== "") {
      updates.actualRir = defaults.actualRir;
    }

    if (!Object.keys(updates).length) {
      return;
    }

    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id === exercise.id
          ? {
              ...ex,
              sets: ex.sets.map((set) =>
                set.id === currentSet.id
                  ? {
                      ...set,
                      ...updates,
                    }
                  : set
              ),
            }
          : ex
      ),
    }));
  }, [
    activeSet,
    getHistoryDefaultsForSet,
    session.exercises,
    updateSession,
  ]);

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
  const [sessionActionsOpen, setSessionActionsOpen] = useState(false);
  const [sessionActionsClosing, setSessionActionsClosing] = useState(false);

  const [pendingDeleteSet, setPendingDeleteSet] = useState(null);

  const [pendingDeleteExercise, setPendingDeleteExercise] = useState(null);

  const [editingSessionName, setEditingSessionName] = useState(false);

  const [sessionNameDraft, setSessionNameDraft] = useState(
    session.templateName || ""
  );

  const [restMinutes, setRestMinutes] = useState(1);

  const [restRemainder, setRestRemainder] = useState(30);

  const [restSeconds, setRestSeconds] = useState(90);

  const [timerRunning, setTimerRunning] = useState(false);

  const [timerFinished, setTimerFinished] = useState(false);

  const [timerPaused, setTimerPaused] = useState(false);

  const [timerStartedAt, setTimerStartedAt] = useState(null);

  const [timerExpiredAt, setTimerExpiredAt] = useState(null);

  const [restComplete, setRestComplete] = useState(false);
  const [workoutTimerNow, setWorkoutTimerNow] = useState(() => Date.now());
  const workoutElapsedSeconds = getWorkoutDurationSeconds(session, workoutTimerNow);

  useEffect(() => {
    if (session.workoutTimerPaused) {
      return;
    }

    const id = setInterval(() => {
      setWorkoutTimerNow(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [
    session.workoutTimerPaused,
  ]);

  function toggleWorkoutTimerPaused() {
    const nowIso = new Date().toISOString();

    setWorkoutTimerNow(Date.now());

    updateSession((s) => {
      if (s.workoutTimerPaused) {
        return {
          ...s,
          workoutTimerPaused: false,
          workoutTimerResumedAtIso: nowIso,
        };
      }

      const durationSeconds = getWorkoutDurationSeconds(s);

      setWorkoutTimerNow(Date.now());

      return {
        ...s,
        workoutTimerBaseSeconds: durationSeconds,
        workoutTimerPaused: true,
        workoutTimerResumedAtIso: null,
      };
    });
  }

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(
    () => () => {
      if (targetPressTimerRef.current) {
        clearTimeout(targetPressTimerRef.current);
      }
    },
    []
  );

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
    if (!timerFinished || !timerExpiredAt) return;

    const id = setInterval(() => {
      setRestSeconds(Math.floor((Date.now() - timerExpiredAt) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [timerExpiredAt, timerFinished]);

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

        setTimeout(() => setRestComplete(false), 1200);

        setTimerExpiredAt(Date.now());
        setTimerFinished(true);
        setTimerRunning(false);
        setTimerPaused(false);
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
    const justCompleted = allSetsCompleted && !wasAllSetsCompletedRef.current;

    wasAllSetsCompletedRef.current = allSetsCompleted;

    if (!justCompleted) {
      return;
    }

    openSessionActions();

    const timeoutId = window.setTimeout(() => {
      const element = completeWorkoutButtonRef.current;

      if (!element) {
        return;
      }

      element.focus({ preventScroll: true });

      const rect = element.getBoundingClientRect();

      const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;

      if (!visible) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
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

      templateChanged: true,

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

      templateChanged: true,

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

  function getSupersetSequence(group, options = {}) {
    const exercises = session.exercises.filter(
      (exercise) => exercise.supersetGroup === group
    );
    const lockedOrder =
      options.supersetOrdersOverride?.[group] ||
      session.supersetOrders?.[group] ||
      [];
    const orderIndexByExerciseId = new Map(
      lockedOrder.map((exerciseId, index) => [exerciseId, index])
    );
    const orderedExercises = [...exercises].sort((a, b) => {
      const aOrder = orderIndexByExerciseId.has(a.id)
        ? orderIndexByExerciseId.get(a.id)
        : Number.MAX_SAFE_INTEGER;
      const bOrder = orderIndexByExerciseId.has(b.id)
        ? orderIndexByExerciseId.get(b.id)
        : Number.MAX_SAFE_INTEGER;

      return aOrder - bOrder;
    });
    const maxSetCount = Math.max(
      0,
      ...orderedExercises.map((exercise) => exercise.sets.length)
    );
    const sequence = [];

    for (let setIndex = 0; setIndex < maxSetCount; setIndex += 1) {
      for (const exercise of orderedExercises) {
        const set = exercise.sets[setIndex];

        if (set) {
          sequence.push({
            exercise,
            exerciseId: exercise.id,
            set,
            setId: set.id,
            setIndex,
          });
        }
      }
    }

    return sequence;
  }

  function getSupersetExercises(group) {
    return session.exercises.filter(
      (exercise) => exercise.supersetGroup === group
    );
  }

  function getSupersetCompletedSetCount(group) {
    return getSupersetExercises(group).reduce(
      (count, exercise) =>
        count + exercise.sets.filter((set) => set.completed).length,
      0
    );
  }

  function getSupersetExerciseOrder(group, firstExerciseId) {
    const exercises = getSupersetExercises(group);
    const first = exercises.find((exercise) => exercise.id === firstExerciseId);
    const rest = exercises.filter(
      (exercise) => exercise.id !== firstExerciseId
    );

    return first ? [first, ...rest].map((exercise) => exercise.id) : [];
  }

  function lockSupersetOrderForSet(exerciseId, setId) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);

    if (!exercise?.supersetGroup) {
      return;
    }

    const setIndex = exercise.sets.findIndex((set) => set.id === setId);

    if (setIndex !== 0) {
      return;
    }

    if (getSupersetCompletedSetCount(exercise.supersetGroup) > 0) {
      return;
    }

    const order = getSupersetExerciseOrder(exercise.supersetGroup, exerciseId);

    updateSession((s) => ({
      ...s,
      supersetOrders: {
        ...(s.supersetOrders || {}),
        [exercise.supersetGroup]: order,
      },
    }));
  }

  function getSupersetOrderOverrideForSet(exerciseId, setId) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);

    if (!exercise?.supersetGroup) {
      return null;
    }

    const setIndex = exercise.sets.findIndex((set) => set.id === setId);

    if (setIndex !== 0) {
      return null;
    }

    if (getSupersetCompletedSetCount(exercise.supersetGroup) > 0) {
      return null;
    }

    return {
      [exercise.supersetGroup]: getSupersetExerciseOrder(
        exercise.supersetGroup,
        exerciseId
      ),
    };
  }

  function getSetOrderSequence(exercise, options = {}) {
    return exercise.supersetGroup
      ? getSupersetSequence(exercise.supersetGroup, options)
      : exercise.sets.map((set, setIndex) => ({
          exercise,
          exerciseId: exercise.id,
          set,
          setId: set.id,
          setIndex,
        }));
  }

  function findSetOrderItem(exerciseId, setId, options = {}) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);

    if (!exercise) {
      return null;
    }

    const sequence = getSetOrderSequence(exercise, options);
    const index = sequence.findIndex(
      (item) => item.exerciseId === exerciseId && item.setId === setId
    );

    return index === -1
      ? null
      : {
          index,
          sequence,
          item: sequence[index],
        };
  }

  function canActivateSet(exerciseId, setId) {
    const ordered = findSetOrderItem(exerciseId, setId);

    if (!ordered || ordered.item.set.completed) {
      return false;
    }

    if (
      ordered.item.exercise.supersetGroup &&
      ordered.item.setIndex === 0 &&
      getSupersetCompletedSetCount(ordered.item.exercise.supersetGroup) === 0
    ) {
      return true;
    }

    return ordered.sequence
      .slice(0, ordered.index)
      .every((item) => item.set.completed);
  }

  function canUncompleteSet(exerciseId, setId) {
    const ordered = findSetOrderItem(exerciseId, setId);

    if (!ordered || !ordered.item.set.completed) {
      return false;
    }

    return ordered.sequence
      .slice(ordered.index + 1)
      .every((item) => !item.set.completed);
  }

  function getNextActiveSetAfter(exerciseId, setId, options = {}) {
    const ordered = findSetOrderItem(exerciseId, setId, options);

    if (!ordered) {
      return null;
    }

    const next = ordered.sequence
      .slice(ordered.index + 1)
      .find(
        (item) =>
          !item.set.completed &&
          !(item.exerciseId === exerciseId && item.setId === setId)
      );

    if (next) {
      return {
        exerciseId: next.exerciseId,
        setId: next.setId,
      };
    }

    return getFirstActivatableSet({
      skipExerciseId: exerciseId,
      skipSetId: setId,
      supersetOrdersOverride: options.supersetOrdersOverride,
    });
  }

  function getFirstActivatableSet({
    skipExerciseId,
    skipSetId,
    supersetOrdersOverride,
  } = {}) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (exercise.id === skipExerciseId && set.id === skipSetId) {
          continue;
        }

        const ordered = findSetOrderItem(exercise.id, set.id, {
          supersetOrdersOverride,
        });
        const canActivate =
          ordered &&
          !ordered.item.set.completed &&
          ordered.sequence
            .slice(0, ordered.index)
            .every(
              (item) =>
                item.set.completed ||
                (item.exerciseId === skipExerciseId && item.setId === skipSetId)
            );

        if (canActivate) {
          return {
            exerciseId: exercise.id,
            setId: set.id,
          };
        }
      }
    }

    return null;
  }

  function getRestDurationForReps(reps) {
    if (reps <= 6) {
      return 180;
    }

    if (reps <= 8) {
      return 150;
    }

    if (reps <= 10) {
      return 120;
    }

    if (reps <= 12) {
      return 90;
    }

    return 60;
  }

  function parseTimerReps(value) {
    const match = String(value ?? "").match(/\d+/);
    const reps = match ? Number.parseInt(match[0], 10) : null;

    return Number.isFinite(reps) ? reps : null;
  }

  function getNextSetTimerReps(nextActiveSet, completedSetContext = {}) {
    if (!nextActiveSet) {
      return null;
    }

    const nextExercise = session.exercises.find(
      (exercise) => exercise.id === nextActiveSet.exerciseId
    );
    const nextSetIndex =
      nextExercise?.sets.findIndex((set) => set.id === nextActiveSet.setId) ??
      -1;
    const nextSet = nextExercise?.sets[nextSetIndex];

    if (!nextSet) {
      return null;
    }

    const planTargets = getPlanTargetValues();
    const nextTargetReps =
      nextActiveSet.exerciseId === completedSetContext.exerciseId &&
      nextSetIndex === completedSetContext.setIndex + 1
        ? firstPresentValue(
            completedSetContext.set?.actualReps,
            completedSetContext.set?.targetReps,
            completedSetContext.set?.reps,
            nextSet.targetReps,
            nextSet.reps,
            planTargets.reps
          )
        : firstPresentValue(
            nextSet.targetReps,
            nextSet.reps,
            nextSet.actualReps,
            planTargets.reps
          );

    return parseTimerReps(nextTargetReps);
  }

  function setRestTimerForNextSet(
    nextActiveSet,
    completedSetContext = {},
    startedAt = null
  ) {
    const completedExercise = session.exercises.find(
      (exercise) => exercise.id === completedSetContext.exerciseId
    );
    const nextExercise = nextActiveSet
      ? session.exercises.find((exercise) => exercise.id === nextActiveSet.exerciseId)
      : null;
    const completedSetIndex = completedSetContext.setIndex ?? -1;
    const nextSetIndex = nextActiveSet
      ? nextExercise?.sets.findIndex((set) => set.id === nextActiveSet.setId) ??
        -1
      : -1;
    const advancesWithinSupersetRound =
      completedExercise?.supersetGroup &&
      completedExercise.supersetGroup === nextExercise?.supersetGroup &&
      completedExercise.id !== nextExercise.id &&
      completedSetIndex === nextSetIndex;

    if (advancesWithinSupersetRound) {
      return;
    }

    const reps = getNextSetTimerReps(nextActiveSet, completedSetContext);

    if (reps == null) {
      return;
    }

    const duration = getRestDurationForReps(reps);

    setRestMinutes(Math.floor(duration / 60));
    setRestRemainder(duration % 60);
    setRestSeconds(duration);
    setTimerExpiredAt(null);
    setTimerFinished(false);
    setTimerPaused(false);
    setTimerStartedAt(startedAt);
    setTimerRunning(true);
  }

  function resetRestTimer() {
    setTimerPaused(false);
    setTimerRunning(false);
    setTimerStartedAt(null);
    setTimerExpiredAt(null);
    setTimerFinished(false);
    setRestSeconds(restMinutes * 60 + restRemainder);
  }

  function getNextSetTargetsAfterCompletion(exercise, currentSet, nextSet) {
    const actualReps = parseSessionNumber(currentSet.actualReps);
    const prescribedReps = parseSessionNumber(
      nextSet.targetReps || currentSet.targetReps
    );
    const targetRir = firstPresentValue(nextSet.targetRir, currentSet.targetRir);
    const actualWeight = firstPresentValue(
      currentSet.actualWeight,
      currentSet.targetWeight
    );
    const actualRir = firstPresentValue(currentSet.actualRir, currentSet.targetRir);
    const shouldReduceWeight =
      actualReps != null &&
      prescribedReps != null &&
      actualReps <= prescribedReps - 2;

    if (shouldReduceWeight) {
      const actualE1RM = calculateE1RM(actualWeight, actualReps, actualRir);
      const targetRirNumber = parseSessionNumber(targetRir) || 0;
      const rawTargetWeight =
        actualE1RM == null
          ? null
          : actualE1RM / (1 + (prescribedReps + targetRirNumber) / 30);
      const reducedWeight =
        rawTargetWeight == null
          ? ""
          : roundWeightToIncrement(
              rawTargetWeight,
              getExerciseWeightIncrement(exercise)
            );

      return {
        targetReps: nextSet.targetReps || String(prescribedReps),
        targetRir: targetRir || nextSet.targetRir,
        targetWeight:
          reducedWeight != null && reducedWeight !== ""
            ? String(reducedWeight)
            : nextSet.targetWeight,
      };
    }

    return {
      targetWeight:
        currentSet.actualWeight || currentSet.targetWeight || nextSet.targetWeight,
      targetReps: currentSet.actualReps || currentSet.targetReps || nextSet.targetReps,
      targetRir: currentSet.actualRir || currentSet.targetRir || nextSet.targetRir,
    };
  }

  function markSetComplete(exerciseId, setId, completedAt = null) {
    const exercise = session.exercises.find((ex) => ex.id === exerciseId);

    const currentSet = exercise.sets.find((s) => s.id === setId);

    const currentIndex = exercise.sets.findIndex((s) => s.id === setId);

    const undo = currentSet.completed;

    if (undo && !canUncompleteSet(exerciseId, setId)) {
      return;
    }

    if (!undo && !canActivateSet(exerciseId, setId)) {
      return;
    }

    const supersetOrdersOverride = undo
      ? null
      : getSupersetOrderOverrideForSet(exerciseId, setId);

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
                  const nextTargets = getNextSetTargetsAfterCompletion(
                    exercise,
                    currentSet,
                    set
                  );

                  return {
                    ...set,
                    ...nextTargets,
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

    if (timerFinished) {
      resetRestTimer();
    }

    const nextActiveSet = getNextActiveSetAfter(exerciseId, setId, {
      supersetOrdersOverride,
    });

    setRestTimerForNextSet(
      nextActiveSet,
      {
        exerciseId,
        set: currentSet,
        setIndex: currentIndex,
      },
      completedAt
    );

    setActiveSet(nextActiveSet);
  }
  function deleteExercise(exerciseId) {
    updateSession((s) => ({
      ...s,

      templateChanged: true,

      exercises: s.exercises.filter((ex) => ex.id !== exerciseId),
    }));
  }

  function updateExerciseSupersetGroup(exerciseId, supersetGroup) {
    updateSession((s) => {
      const currentGroup = s.exercises.find(
        (exercise) => exercise.id === exerciseId
      )?.supersetGroup;
      const groupsToReset = new Set(
        [currentGroup, supersetGroup].filter(Boolean)
      );

      return {
        ...s,

        templateChanged: true,
        supersetOrders: Object.fromEntries(
          Object.entries(s.supersetOrders || {}).filter(
            ([group]) => !groupsToReset.has(group)
          )
        ),

        exercises: s.exercises.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,

                supersetGroup,
              }
            : ex
        ),
      };
    });
  }

  function editExerciseSupersetGroup(exercise) {
    const group = prompt(
      "Superset group (A, B, etc). Leave empty to clear.",
      exercise.supersetGroup || ""
    );

    if (group === null) {
      return;
    }

    updateExerciseSupersetGroup(exercise.id, group.trim() || null);
  }

  function openSessionActions() {
    setSessionActionsClosing(false);
    setSessionActionsOpen(true);
  }

  function closeSessionActions({ immediate = false } = {}) {
    if (immediate) {
      setSessionActionsClosing(false);
      setSessionActionsOpen(false);
      return;
    }

    setSessionActionsClosing(true);
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

              imageAlt: newExercise.imageAlt || "",

              imageUrl: newExercise.imageUrl || "",

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

  function recordPlanWorkoutCompletion(completedWorkout) {
    if (
      !setPlans ||
      !completedWorkout.planId ||
      !completedWorkout.planWorkoutId
    ) {
      return;
    }

    setPlans(
      plans.map((plan) => {
        if (plan.id !== completedWorkout.planId) {
          return plan;
        }

        const weekNumber = completedWorkout.planWeek || plan.currentWeek || 1;
        const existingCompletions = plan.completions || [];
        const alreadyCompleted = existingCompletions.some(
          (completion) =>
            Number(completion.weekNumber) === Number(weekNumber) &&
            completion.planWorkoutId === completedWorkout.planWorkoutId
        );
        const completions = alreadyCompleted
          ? existingCompletions
          : [
              ...existingCompletions,
              {
                completedAt: completedWorkout.completedAt,
                planWorkoutId: completedWorkout.planWorkoutId,
                sessionId: completedWorkout.id,
                weekNumber,
              },
            ];
        const completedThisWeek = completions.filter(
          (completion) => Number(completion.weekNumber) === Number(weekNumber)
        ).length;
        const weekComplete =
          plan.workouts?.length > 0 &&
          completedThisWeek >= plan.workouts.length;
        const finalPlanWeek =
          (Number(plan.durationWeeks) || 1) + (plan.config?.deload ? 1 : 0);
        const finalWeek = weekNumber >= finalPlanWeek;

        return {
          ...plan,
          completions,
          currentWeek:
            weekComplete && !finalWeek
              ? weekNumber + 1
              : plan.currentWeek || weekNumber,
          status: weekComplete && finalWeek ? "completed" : plan.status,
        };
      })
    );
  }

  function createNextTemplateExercisesFromSession() {
    return session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        id: Date.now() + Math.random(),
        targetWeight: set.actualWeight || set.targetWeight || "",
        targetReps: set.actualReps || set.targetReps || "",
        targetRir: set.actualRir || set.targetRir || "",
      })),
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
          exerciseId: exercise.id,
          equipment: exercise.equipment,
          muscles: exercise.muscles,
          imageAlt: exercise.imageAlt || "",
          imageUrl: exercise.imageUrl || "",
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

  const currentExercise =
    session.exercises.find(
      (exercise) => exercise.id === activeSet?.exerciseId
    ) ||
    session.exercises.find((exercise) =>
      exercise.sets.some((set) => !set.completed)
    ) ||
    (allSetsCompleted ? null : session.exercises[0]) ||
    null;
  const currentExerciseIndex = currentExercise
    ? session.exercises.findIndex(
        (exercise) => exercise.id === currentExercise.id
      )
    : -1;
  const visibleExerciseGroups = currentExercise
    ? [
        {
          group: null,
          exercises: [currentExercise],
        },
      ]
    : [];
  const shouldAnimateExercisePanel = exercisePanelTransition.sequence > 0;

  useEffect(() => {
    const currentExerciseId = currentExercise?.id || null;
    const previousExerciseId = previousExercisePanelIdRef.current;

    if (!currentExerciseId || previousExerciseId === currentExerciseId) {
      return;
    }

    if (!previousExerciseId) {
      previousExercisePanelIdRef.current = currentExerciseId;
      return;
    }

    const previousExerciseIndex = session.exercises.findIndex(
      (exercise) => exercise.id === previousExerciseId
    );
    const nextDirection =
      previousExerciseIndex >= 0 && currentExerciseIndex < previousExerciseIndex
        ? "previous"
        : "next";

    previousExercisePanelIdRef.current = currentExerciseId;
    setExercisePanelTransition((current) => ({
      direction: nextDirection,
      sequence: current.sequence + 1,
    }));
  }, [currentExercise?.id, currentExerciseIndex, session.exercises]);

  function getThumbnailSetForExercise(exercise) {
    return (
      exercise.sets.find(
        (set) => !set.completed && canActivateSet(exercise.id, set.id)
      ) ||
      exercise.sets.find((set) => !set.completed) ||
      exercise.sets[0] ||
      null
    );
  }

  function activateExerciseFromThumbnail(exercise) {
    const nextSet = getThumbnailSetForExercise(exercise);

    if (!nextSet) {
      return;
    }

    if (canActivateSet(exercise.id, nextSet.id)) {
      lockSupersetOrderForSet(exercise.id, nextSet.id);
    }

    setActiveSet({
      exerciseId: exercise.id,
      setId: nextSet.id,
    });
  }

  function renderLatestSetHistory(exercise) {
    const latestPerformance = getLatestWorkoutPerformance(
      exercise.exerciseId || exercise.id
    );

    return (
      <div
        style={{
          borderTop: "1px solid var(--border)",
          display: "grid",
          gap: "3px",
          marginTop: "10px",
          paddingTop: "8px",
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          Last completed sets
          {latestPerformance?.completedAt
            ? ` · ${latestPerformance.completedAt}`
            : ""}
        </div>

        {!latestPerformance?.sets?.length ? (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
            }}
          >
            No completed history for this exercise yet.
          </div>
        ) : (
          <>
            <div
              style={{
                alignItems: "center",
                color: "var(--text-muted)",
                display: "flex",
                fontSize: "14px",
                fontWeight: "bold",
                lineHeight: 1,
                marginLeft: "0px",
              }}
            >
              <span
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  fontSize: "14px",
                  gap: "3px",
                  whiteSpace: "nowrap",
                  width: "78px",
                }}
              >
                Set
              </span>

              <span
                title="Weight"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  fontSize: "14px",
                  justifyContent: "center",
                  marginLeft: "4px",
                  whiteSpace: "nowrap",
                  width: "50px",
                }}
              >
                <Weight size={15} aria-label="Weight" />
              </span>

              <span
                title="Reps"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  fontSize: "14px",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  width: "46px",
                }}
              >
                <Hash size={15} aria-label="Reps" />
              </span>

              <span
                title="RIR"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  fontSize: "14px",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  width: "36px",
                }}
              >
                <BatteryMedium size={15} aria-label="RIR" />
              </span>

              <span
                title="e1RM"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  fontSize: "14px",
                  justifyContent: "center",
                  marginLeft: "2px",
                  whiteSpace: "nowrap",
                  width: "42px",
                }}
              >
                <Dumbbell size={15} aria-label="e1RM" />
              </span>
            </div>

            {latestPerformance.sets.map((set, setIndex) => {
              const weight = firstPresentValue(set.actualWeight, set.targetWeight);
              const reps = firstPresentValue(set.actualReps, set.targetReps);
              const rir = firstPresentValue(set.actualRir, set.targetRir);
              const e1rm = isBlankValue(weight)
                ? null
                : calculateE1RM(weight, reps, rir);

              return (
                <div
                  key={set.id || setIndex}
                  style={{
                    alignItems: "center",
                    color: "var(--text-muted)",
                    display: "flex",
                    flexWrap: "nowrap",
                    fontSize: "12px",
                    gap: "4px",
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      width: "78px",
                    }}
                  >
                    {setIndex + 1}
                  </span>
                  <span
                    style={{
                      marginLeft: "4px",
                      textAlign: "center",
                      width: "50px",
                    }}
                  >
                    {displayHistoricalWeight(weight)}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      width: "46px",
                    }}
                  >
                    {displayHistoricalValue(reps)}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      width: "36px",
                    }}
                  >
                    {displayHistoricalValue(rir)}
                  </span>
                  <span
                    style={{
                      marginLeft: "2px",
                      textAlign: "center",
                      width: "42px",
                    }}
                  >
                    {e1rm == null
                      ? "—"
                      : weightUnit === "kg"
                      ? lbsToKg(e1rm.toFixed(1))
                      : e1rm.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

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
        equipment: formatList(ex.equipment),
        exerciseId: ex.exerciseId || null,
        muscles: formatList(ex.muscles),
        name: ex.name,
        setCount: ex.sets?.length || 0,
        supersetGroup: ex.supersetGroup || null,
      }));

    return (
      JSON.stringify(getStructuralSignature(original.exercises)) !==
      JSON.stringify(getStructuralSignature(session.exercises))
    );
  }

  function completeWorkout({ applyStructuralChanges = false } = {}) {
    const structuralChanges = hasStructuralChanges();
    const nextTemplateExercises = createNextTemplateExercisesFromSession();
    const completedAtIso = new Date().toISOString();
    const durationSeconds = getWorkoutDurationSeconds(session);
    let completedWorkout = {
      ...session,
      id: createCompletedWorkoutId(session.id),
      sourceSessionId: session.id,
      completedAt: new Date(completedAtIso).toLocaleDateString(),
      completedAtIso,
      durationSeconds,
    };
    let nextTemplates = templates;

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

      const existing = metadataUpdates[exercise.exerciseId] || {};

      metadataUpdates[exercise.exerciseId] = {
        ...existing,

        latestE1RM: {
          value: bestE1RM,
          date: completedWorkout.completedAt,
        },

        maxE1RM:
          !existing.maxE1RM || bestE1RM > existing.maxE1RM.value
            ? {
                value: bestE1RM,
                date: completedWorkout.completedAt,
              }
            : existing.maxE1RM,
      };
    });

    setExerciseMetadata(metadataUpdates);

    setHistory([completedWorkout, ...history]);

    recordPlanWorkoutCompletion(completedWorkout);

    if (!structuralChanges || applyStructuralChanges) {
      nextTemplates = nextTemplates.map((t) =>
        t.id === session.templateId
          ? {
              ...t,

              name: completedWorkout.templateName,

              lastCompleted: completedWorkout.completedAt,

              exercises: nextTemplateExercises,
            }
          : t
      );
    }

    setTemplates(nextTemplates);

    setSessions(sessions.filter((s) => s.id !== session.id));

    setSelectedSessionId(null);

    setSelectedTemplateId(null);
  }

  const warmupExercise = warmupExerciseId
    ? session.exercises.find((exercise) => exercise.id === warmupExerciseId)
    : null;
  const warmupRecommendations = warmupExercise
    ? getWarmupRecommendations(warmupExercise)
    : null;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>
        {`
          .session-exercise-strip {
            scrollbar-width: none;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
          }

          .session-exercise-strip * {
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
          }

          .session-exercise-strip::-webkit-scrollbar {
            display: none;
          }

          .session-current-exercise-panel {
            animation-duration: 1360ms;
            animation-fill-mode: both;
            animation-timing-function: cubic-bezier(.16, 1, .3, 1);
            will-change: opacity, transform;
          }

          .session-current-exercise-panel[data-direction="next"] {
            animation-name: sessionExerciseSlideNext;
          }

          .session-current-exercise-panel[data-direction="previous"] {
            animation-name: sessionExerciseSlidePrevious;
          }

          .session-workout-actions-sheet,
          .session-target-options-sheet {
            animation: sessionSheetSlideUp 750ms cubic-bezier(.16, 1, .3, 1) both;
            will-change: opacity, transform;
          }

          .session-workout-actions-sheet[data-closing="true"],
          .session-target-options-sheet[data-closing="true"] {
            animation-name: sessionSheetSlideDown;
          }

          @keyframes sessionExerciseSlideNext {
            from {
              opacity: 0.25;
              transform: translateX(288px);
            }

            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes sessionExerciseSlidePrevious {
            from {
              opacity: 0.25;
              transform: translateX(-288px);
            }

            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes sessionSheetSlideUp {
            from {
              opacity: 0.25;
              transform: translateY(calc(100% + 24px));
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes sessionSheetSlideDown {
            from {
              opacity: 1;
              transform: translateY(0);
            }

            to {
              opacity: 0;
              transform: translateY(calc(100% + 24px));
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .session-current-exercise-panel,
            .session-workout-actions-sheet,
            .session-target-options-sheet {
              animation: none;
            }
          }
        `}
      </style>
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
                  <AlertTriangle size={22} />
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
                <IconButton
                  label="Cancel"
                  onClick={() => setConfirmExitWorkout(false)}
                >
                  <X size={18} />
                </IconButton>

                <IconButton
                  label="End workout"
                  tone="danger"
                  onClick={() => {
                    setConfirmExitWorkout(false);

                    setSelectedSessionId(null);

                    setSelectedTemplateId(null);
                  }}
                >
                  <Check size={18} />
                </IconButton>
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
                <AlertTriangle size={22} />
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
                <IconButton
                  label="Cancel"
                  onClick={() => setPendingDeleteExercise(null)}
                >
                  <X size={18} />
                </IconButton>

                <IconButton
                  label="Delete exercise"
                  tone="danger"
                  onClick={() => {
                    deleteExercise(pendingDeleteExercise.id);

                    setPendingDeleteExercise(null);
                  }}
                >
                  <Check size={18} />
                </IconButton>
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
                <AlertTriangle size={22} />
                <span>Delete Set?</span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <IconButton
                  label="Cancel"
                  onClick={() => setPendingDeleteSet(null)}
                >
                  <X size={18} />
                </IconButton>

                <IconButton
                  label="Delete set"
                  tone="danger"
                  onClick={() => {
                    deleteSet(
                      pendingDeleteSet.exerciseId,
                      pendingDeleteSet.setId
                    );

                    setPendingDeleteSet(null);
                  }}
                >
                  <Check size={18} />
                </IconButton>
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            background: timerFinished
              ? "var(--danger-bg)"
              : timerRunning
              ? "var(--warning-bg, rgba(255, 193, 7, .18))"
              : "var(--surface-raised)",

            border: timerFinished
              ? "2px solid #c66"
              : timerRunning
              ? "2px solid #d6a100"
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
          <Timer size={28} />

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
              if (timerFinished) {
                setTimerPaused(false);
                setTimerRunning(false);
                setTimerStartedAt(null);
                setTimerExpiredAt(null);
                setTimerFinished(false);
                setRestSeconds(restMinutes * 60 + restRemainder);
              } else if (timerRunning) {
                setTimerPaused(true);

                setTimerRunning(false);
              } else {
                setTimerPaused(false);
                setTimerExpiredAt(null);

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
            {timerRunning || timerFinished ? "■" : "▶"}
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
              setTimerExpiredAt(null);
              setTimerFinished(false);

              setRestSeconds(restMinutes * 60 + restRemainder);
            }}
          >
            ↺
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          <button
            aria-label={`Open workout controls: ${session.templateName}`}
            onClick={openSessionActions}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-h)",
              display: "block",
              fontSize: "20px",
              fontWeight: "bold",
              lineHeight: 1.15,
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

          <div
            aria-label="Workout exercises"
            className="session-exercise-strip"
            onContextMenu={(event) => event.preventDefault()}
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              margin: "0 -20px",
              overflowX: "auto",
              padding: "2px 20px 4px",
              userSelect: "none",
              WebkitOverflowScrolling: "touch",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
            }}
          >
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleExerciseThumbnailDragEnd}
              onDragStart={() => window.getSelection?.()?.removeAllRanges()}
              sensors={exerciseDragSensors}
            >
              <SortableContext
                items={session.exercises.map((exercise) => exercise.id)}
                strategy={horizontalListSortingStrategy}
              >
                {groupedExercises.map((group) => (
                  <div
                    key={group.group || group.exercises[0].id}
                    style={{
                      border: group.group
                        ? "2px solid color-mix(in srgb, var(--accent) 12%, var(--surface-raised))"
                        : "none",
                      borderRadius: "8px",
                      alignItems: "center",
                      display: "flex",
                      flex: "0 0 auto",
                      gap: "5px",
                      padding: group.group ? "4px" : 0,
                    }}
                  >
                    {group.exercises.map((exercise) => {
                      const exerciseDetail = getExerciseDetailRecord(exercise);
                      const isCurrent = currentExercise?.id === exercise.id;
                      const isExerciseComplete =
                        exercise.sets.length > 0 &&
                        exercise.sets.every((set) => set.completed);

                      return (
                        <SortableExerciseThumbnail
                          exerciseId={exercise.id}
                          key={exercise.id}
                        >
                          {({ attributes, isDragging, listeners }) => (
                            <button
                              {...attributes}
                              {...listeners}
                              aria-label={`Show ${exercise.name}`}
                              onContextMenu={(event) => event.preventDefault()}
                              onClick={() => activateExerciseFromThumbnail(exercise)}
                              style={{
                                alignItems: "center",
                                background: isCurrent
                                  ? "color-mix(in srgb, var(--accent) 12%, var(--surface-raised))"
                                  : "var(--surface-raised)",
                                border: "none",
                                borderRadius: "8px",
                                boxShadow: isCurrent
                                  ? "inset 0 0 0 2px var(--accent)"
                                  : "none",
                                cursor: isDragging ? "grabbing" : "pointer",
                                display: "inline-flex",
                                flex: "0 0 52px",
                                height: "52px",
                                justifyContent: "center",
                                opacity: isDragging ? 0.72 : isCurrent ? 1 : 0.42,
                                padding: "4px",
                                position: "relative",
                                touchAction: "pan-x",
                                userSelect: "none",
                                WebkitTouchCallout: "none",
                                width: "52px",
                              }}
                              title={exercise.name}
                              type="button"
                            >
                              <ExerciseThumbnail
                                active={isCurrent}
                                alt={
                                  exerciseDetail.imageAlt ||
                                  `${exercise.name} demonstration`
                                }
                                imageUrl={exerciseDetail.imageUrl}
                                size={42}
                              />
                              {isExerciseComplete ? (
                                <span
                                  aria-hidden="true"
                                  style={{
                                    alignItems: "center",
                                    background: "#16a34a",
                                    borderRadius: "999px",
                                    color: "white",
                                    display: "inline-flex",
                                    fontWeight: 700,
                                    height: "16px",
                                    justifyContent: "center",
                                    left: "2px",
                                    lineHeight: 1,
                                    position: "absolute",
                                    top: "2px",
                                    width: "16px",
                                  }}
                                >
                                  <Check size={11} strokeWidth={3} />
                                </span>
                              ) : null}
                            </button>
                          )}
                        </SortableExerciseThumbnail>
                      );
                    })}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
            <button
              aria-label={showAddExercise ? "Cancel adding exercise" : "Add exercise"}
              onClick={() => {
                setShowAddExercise((isOpen) => !isOpen);
                setReplacingExerciseId(null);
                setSearch("");
              }}
              title={showAddExercise ? "Cancel" : "Add exercise"}
              type="button"
              style={{
                alignItems: "center",
                background: showAddExercise
                  ? "color-mix(in srgb, var(--accent) 12%, var(--surface-raised))"
                  : "var(--surface-raised)",
                border: "none",
                borderRadius: "8px",
                boxShadow: showAddExercise
                  ? "inset 0 0 0 2px var(--accent)"
                  : "inset 0 0 0 1px var(--border)",
                color: "var(--accent)",
                display: "inline-flex",
                flex: "0 0 52px",
                height: "52px",
                justifyContent: "center",
                padding: 0,
                width: "52px",
              }}
            >
              {showAddExercise ? <X size={30} /> : <Plus size={32} />}
            </button>
          </div>
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
              alignItems: "center",
              background: "rgba(34, 197, 94, .72)",
              color: "white",
              display: "flex",
              fontSize: "28px",
              fontWeight: "bold",
              inset: 0,
              justifyContent: "center",
              letterSpacing: "0.04em",
              pointerEvents: "none",
              position: "fixed",
              textAlign: "center",
              textShadow: "0 2px 12px rgba(0,0,0,.35)",
              zIndex: 20000,
            }}
          >
            REST COMPLETE
          </div>
        )}

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

        <div
          style={{
            overflow: "hidden",
          }}
        >
          <div
            className={
              shouldAnimateExercisePanel ? "session-current-exercise-panel" : ""
            }
            data-direction={exercisePanelTransition.direction}
            key={`${currentExercise?.id || "none"}-${
              exercisePanelTransition.sequence
            }`}
          >
            {visibleExerciseGroups.map((group) => (
              <div
                key={group.group || group.exercises[0].id}
                style={{
                  background: group.group
                    ? "var(--surface-muted)"
                    : "transparent",

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
                        <IconButton
                          label="Exercise notes"
                          size={34}
                          onClick={() =>
                            setExpandedNotes((s) => ({
                              ...s,
                              [exercise.id]: !s[exercise.id],
                            }))
                          }
                        >
                          <NotebookPen size={17} />
                        </IconButton>{" "}
                        <strong>
                          <button
                            type="button"
                            onClick={() =>
                              setDetailExercise(
                                getExerciseDetailRecord(exercise)
                              )
                            }
                            style={{
                              background: "transparent",
                              border: 0,
                              color: "var(--text)",
                              cursor: "pointer",
                              display: "inline-block",
                              font: "inherit",
                              maxWidth: "180px",
                              padding: 0,
                              whiteSpace: "normal",
                              wordBreak: "break-word",
                              lineHeight: "1.05",
                              fontSize: "14px",
                              textAlign: "left",
                              verticalAlign: "middle",
                            }}
                          >
                            {`${exercise.name}${
                              exercise.equipment?.[0]
                                ? ", " + exercise.equipment[0]
                                : ""
                            }`}
                          </button>
                        </strong>
                      </div>

                      <div>
                        <IconButton
                          label="Replace exercise"
                          size={34}
                          onClick={() => {
                            const nextReplacingExerciseId =
                              replacingExerciseId === exercise.id
                                ? null
                                : exercise.id;

                            setShowAddExercise(false);
                            setReplacingExerciseId(nextReplacingExerciseId);

                            if (!nextReplacingExerciseId) {
                              setSelectedMuscle("");
                              setSearch("");
                              return;
                            }

                            const originalExercise =
                              getExerciseDetailRecord(exercise);

                            setSelectedMuscle(
                              originalExercise?.muscles?.[0] || ""
                            );

                            setSearch("");
                          }}
                        >
                          <RefreshCw size={17} />
                        </IconButton>{" "}
                        <IconButton
                          label="Delete exercise"
                          size={34}
                          tone="danger"
                          onClick={() => setPendingDeleteExercise(exercise)}
                        >
                          <Trash2 size={17} />
                        </IconButton>
                      </div>
                    </div>

                    {(expandedNotes[exercise.id] ||
                      exerciseMetadata?.[
                        exercise.exerciseId
                      ]?.note?.trim()) && (
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          marginTop: "8px",
                        }}
                      >
                        <input
                          placeholder="Notes"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            boxSizing: "border-box",
                            fontSize: "0.85rem",
                            height: "28px",
                            padding: "2px",
                            width: "100%",
                          }}
                          value={
                            exerciseMetadata?.[exercise.exerciseId]?.note || ""
                          }
                          onChange={(e) =>
                            setExerciseMetadata({
                              ...exerciseMetadata,

                              [exercise.exerciseId]: {
                                ...(exerciseMetadata?.[exercise.exerciseId] ||
                                  {}),

                                note: e.target.value,
                              },
                            })
                          }
                        />

                        <button
                          type="button"
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
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            minWidth: "28px",
                            padding: "2px 7px",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-start",
                        marginTop: "8px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setWarmupExerciseId(exercise.id)}
                        style={{
                          alignItems: "center",
                          display: "inline-flex",
                          gap: "6px",
                          padding: "7px 10px",
                        }}
                      >
                        <Flame size={15} /> Warmup sets
                      </button>
                    </div>

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
                              alignItems: "center",
                              display: "inline-flex",
                              gap: "3px",
                            }}
                          >
                            <Target size={14} /> Target
                          </span>

                          <span
                            title="Actual weight"
                            style={{
                              marginLeft: "4px",
                              width: "50px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              display: "inline-flex",
                              justifyContent: "center",
                            }}
                          >
                            <Weight size={15} aria-label="Actual weight" />
                          </span>

                          <span
                            title="Actual reps"
                            style={{
                              width: "46px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              display: "inline-flex",
                              justifyContent: "center",
                            }}
                          >
                            <Hash size={15} aria-label="Actual reps" />
                          </span>

                          <span
                            title="Actual RIR"
                            style={{
                              width: "36px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              display: "inline-flex",
                              justifyContent: "center",
                            }}
                          >
                            <BatteryMedium size={15} aria-label="Actual RIR" />
                          </span>

                          <span
                            title="e1RM"
                            style={{
                              marginLeft: "2px",
                              width: "42px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              display: "inline-flex",
                              justifyContent: "center",
                            }}
                          >
                            <Dumbbell size={15} aria-label="e1RM" />
                          </span>

                          <span
                            title="Completed"
                            style={{
                              marginLeft: "8px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              display: "inline-flex",
                            }}
                          >
                            <CheckCircle2 size={15} aria-label="Completed" />
                          </span>
                        </div>

                        {exercise.sets.map((set, setIndex) => {
                          const isActive =
                            activeSet?.exerciseId === exercise.id &&
                            activeSet?.setId === set.id;

                          const isCompleted = !!set.completed;
                          const canActivate = canActivateSet(
                            exercise.id,
                            set.id
                          );
                          const canUncomplete = canUncompleteSet(
                            exercise.id,
                            set.id
                          );

                          const valueColor = isActive
                            ? "var(--accent)"
                            : isCompleted
                            ? "#444"
                            : "#aaa";
                          const actualWeightDisplay = isBlankValue(
                            set.actualWeight
                          )
                            ? "—"
                            : weightUnit === "kg"
                            ? lbsToKg(set.actualWeight)
                            : set.actualWeight;
                          const actualRepsDisplay = isBlankValue(set.actualReps)
                            ? "—"
                            : set.actualReps;
                          const actualRirDisplay = isBlankValue(set.actualRir)
                            ? "—"
                            : set.actualRir;
                          const actualE1RM = isBlankValue(set.actualWeight)
                            ? null
                            : calculateE1RM(
                                set.actualWeight,
                                set.actualReps,
                                set.actualRir
                              );

                          return (
                            <div
                              key={set.id}
                              ref={(el) => {
                                if (el) {
                                  setRowRefs.current[set.id] = el;
                                }
                              }}
                              onClick={() => {
                                if (canActivate) {
                                  lockSupersetOrderForSet(exercise.id, set.id);
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

                                borderLeft: isActive
                                  ? "4px solid var(--accent)"
                                  : "none",

                                background: isActive
                                  ? "color-mix(in srgb, var(--accent) 10%, var(--surface))"
                                  : "transparent",

                                fontWeight: isActive ? "bold" : "normal",
                              }}
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    applyTargetToActual(exercise.id, set.id);
                                  }

                                  if (event.key === " ") {
                                    event.preventDefault();
                                    openTargetAlternatives(
                                      exercise,
                                      set,
                                      setIndex
                                    );
                                  }
                                }}
                                onPointerCancel={() => {
                                  cancelTargetPressTimer();
                                }}
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  targetLongPressRef.current = false;
                                  cancelTargetPressTimer();
                                  targetPressTimerRef.current = setTimeout(
                                    () => {
                                      targetLongPressRef.current = true;
                                      openTargetAlternatives(
                                        exercise,
                                        set,
                                        setIndex
                                      );
                                    },
                                    520
                                  );
                                }}
                                onPointerLeave={() => {
                                  cancelTargetPressTimer();
                                }}
                                onPointerUp={(event) => {
                                  event.stopPropagation();
                                  cancelTargetPressTimer();

                                  if (targetLongPressRef.current) {
                                    targetLongPressRef.current = false;
                                    return;
                                  }

                                  applyTargetToActual(exercise.id, set.id);
                                }}
                                title="Use target values"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "inherit",
                                  cursor: "pointer",
                                  font: "inherit",
                                  padding: 0,
                                  textAlign: "left",
                                  width: "80px",
                                  lineHeight: "1.1",
                                  touchAction: "manipulation",
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    textAlign: "left",
                                  }}
                                >
                                  {displayWeight(set.targetWeight)}×
                                  {set.targetReps}
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
                              </button>

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

                                      value: set.actualWeight,
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
                                  {actualWeightDisplay}
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

                                      value: Number(set.actualReps || 0),
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
                                  {actualRepsDisplay}
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

                                      value: Number(set.actualRir || 0),
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
                                  {actualRirDisplay}
                                </button>

                                <span
                                  style={{
                                    display: "inline-block",
                                    width: "42px",
                                    textAlign: "center",
                                    fontSize: "13px",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {actualE1RM == null
                                    ? "—"
                                    : weightUnit === "kg"
                                    ? lbsToKg(actualE1RM.toFixed(1))
                                    : actualE1RM.toFixed(1)}
                                </span>
                              </span>

                              <IconButton
                                label={
                                  set.completed
                                    ? "Set completed"
                                    : "Complete set"
                                }
                                size={30}
                                style={{
                                  background: set.completed
                                    ? "var(--success-bg)"
                                    : "var(--surface-raised)",
                                }}
                                tone={set.completed ? "success" : "neutral"}
                                disabled={
                                  set.completed ? !canUncomplete : !canActivate
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  lockSupersetOrderForSet(exercise.id, set.id);
                                  markSetComplete(
                                    exercise.id,
                                    set.id,
                                    Date.now()
                                  );
                                }}
                              >
                                {set.completed ? (
                                  <CheckCircle2 size={16} />
                                ) : (
                                  <Circle size={16} />
                                )}
                              </IconButton>

                              <IconButton
                                label="Delete set"
                                size={30}
                                tone="danger"
                                onClick={(e) => {
                                  e.stopPropagation();

                                  setPendingDeleteSet({
                                    exerciseId: exercise.id,
                                    setId: set.id,
                                  });
                                }}
                              >
                                <Trash2 size={15} />
                              </IconButton>
                            </div>
                          );
                        })}
                      </>
                    }

                    <div
                      style={{
                        alignItems: "center",
                        display: "inline-flex",
                        gap: "5px",
                        justifyContent: "center",
                        marginTop: "2px",
                      }}
                    >
                      <button
                        style={{
                          alignItems: "center",
                          display: "inline-flex",
                          gap: "5px",
                        }}
                        onClick={() =>
                          addSet(
                            exercise.id,

                            [...exercise.sets]

                              .reverse()

                              .find((s) => s.actualWeight || s.targetWeight)
                          )
                        }
                      >
                        <Plus size={15} /> Add Set
                      </button>

                      <IconButton
                        label={
                          exercise.supersetGroup
                            ? `Edit superset ${exercise.supersetGroup}`
                            : "Link superset"
                        }
                        onClick={() => editExerciseSupersetGroup(exercise)}
                        size={exercise.supersetGroup ? 40 : 34}
                        style={{
                          color: exercise.supersetGroup
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        }}
                      >
                        <Link2 size={16} />
                        {exercise.supersetGroup && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "bold",
                              marginLeft: "-3px",
                            }}
                          >
                            {exercise.supersetGroup}
                          </span>
                        )}
                      </IconButton>
                    </div>

                    {renderLatestSetHistory(exercise)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <hr />

        {showAddExercise && (
          <ExercisePickerSheet
            title="Add exercise"
            actionLabel="Create exercise"
            exerciseLibrary={exerciseLibrary}
            history={history}
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

              setNewExerciseValues(getAddExerciseDefaults(exercise));
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
              <IconButton
                label="Cancel add exercise"
                onClick={() => {
                  setPendingExercise(null);
                  setShowAddExercise(false);
                }}
              >
                <X size={18} />
              </IconButton>

              <IconButton
                label="Add exercise"
                tone="success"
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
                <Check size={18} />
              </IconButton>
            </div>
          </div>
        )}

        {replacingExerciseId && !showReplaceExercise && (
          <ExercisePickerSheet
            title="Replace exercise"
            exerciseLibrary={exerciseLibrary}
            history={history}
            search={search}
            selectedMuscle={selectedMuscle}
            setSearch={setSearch}
            setSelectedMuscle={setSelectedMuscle}
            onClose={() => {
              setReplacingExerciseId(null);
              setSelectedMuscle("");
              setSearch("");
            }}
            onSelect={(exercise) => {
              setReplacementTarget(replacingExerciseId);
              setReplacementExercise(exercise);
              setReplacementValues(
                getReplacementDefaults(replacingExerciseId, exercise)
              );
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
                        active: EXERCISE_STATUS.active,

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

        {(sessionActionsOpen || sessionActionsClosing) && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Workout actions"
            onClick={() => closeSessionActions()}
            style={{
              alignItems: "flex-end",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              position: "fixed",
              zIndex: 2200,
            }}
          >
            <div
              className="session-workout-actions-sheet"
              data-closing={sessionActionsClosing ? "true" : "false"}
              onAnimationEnd={(event) => {
                if (
                  event.currentTarget === event.target &&
                  sessionActionsClosing
                ) {
                  setSessionActionsClosing(false);
                  setSessionActionsOpen(false);
                }
              }}
              onClick={(event) => event.stopPropagation()}
              style={{
                background: "var(--surface-raised)",
                borderRadius: "18px 18px 0 0",
                boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
                boxSizing: "border-box",
                display: "grid",
                gap: "12px",
                maxWidth: "520px",
                padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h2
                    style={{
                      fontSize: "18px",
                      lineHeight: 1.15,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {session.templateName}
                  </h2>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    Workout controls
                  </div>
                </div>

                <IconButton
                  label="Close workout actions"
                  onClick={() => closeSessionActions()}
                  size={36}
                >
                  <X size={18} />
                </IconButton>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      alignItems: "center",
                      display: "flex",
                      gap: "10px",
                      minWidth: 0,
                    }}
                  >
                    <Timer size={18} color="var(--text-muted)" />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        Workout Duration
                      </div>
                      <div
                        style={{
                          color: "var(--text-h)",
                          fontSize: "26px",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 800,
                          letterSpacing: 0,
                          lineHeight: 1.1,
                        }}
                      >
                        {formatWorkoutDuration(workoutElapsedSeconds)}
                      </div>
                    </div>
                  </div>

                  <button
                    aria-label={
                      session.workoutTimerPaused
                        ? "Resume workout timer"
                        : "Pause workout timer"
                    }
                    onClick={toggleWorkoutTimerPaused}
                    type="button"
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                      justifyContent: "center",
                      minHeight: "40px",
                      minWidth: "104px",
                      padding: "8px 10px",
                    }}
                  >
                    {session.workoutTimerPaused ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}
                    {session.workoutTimerPaused ? "Resume" : "Pause"}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSessionActionsOpen(false);
                    setConfirmExitWorkout(true);
                  }}
                  type="button"
                  style={{
                    alignItems: "center",
                    background: "var(--danger-bg)",
                    border: "1px solid #c66",
                    borderRadius: "8px",
                    color: "var(--danger-text)",
                    display: "flex",
                    fontSize: "15px",
                    fontWeight: 700,
                    justifyContent: "space-between",
                    minHeight: "44px",
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <span>End Workout</span>
                  <AlertTriangle size={18} />
                </button>

                <button
                  onClick={() => setWeightUnit(weightUnit === "lb" ? "kg" : "lb")}
                  type="button"
                  style={{
                    alignItems: "center",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)",
                    display: "flex",
                    fontSize: "15px",
                    fontWeight: 700,
                    justifyContent: "space-between",
                    minHeight: "44px",
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <span>Weight Unit</span>
                  <span>{weightUnit === "lb" ? "LB" : "KG"}</span>
                </button>

                <button
                  onClick={() => setKeepScreenAwake((value) => !value)}
                  type="button"
                  style={{
                    alignItems: "center",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)",
                    display: "flex",
                    fontSize: "15px",
                    fontWeight: 700,
                    justifyContent: "space-between",
                    minHeight: "44px",
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <span>Auto-Lock</span>
                  <span>{keepScreenAwake ? "Off" : "On"}</span>
                </button>

                <button
                  onClick={() => {
                    setSessionActionsOpen(false);
                    setShowSupersetEditor(true);
                  }}
                  type="button"
                  style={{
                    alignItems: "center",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)",
                    display: "flex",
                    fontSize: "15px",
                    fontWeight: 700,
                    justifyContent: "space-between",
                    minHeight: "44px",
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <span>Supersets</span>
                  <Link2 size={18} />
                </button>

                <button
                  ref={completeWorkoutButtonRef}
                  onClick={() => {
                    setSessionActionsOpen(false);
                    setConfirmComplete(true);
                  }}
                  type="button"
                  style={{
                    alignItems: "center",
                    background: allSetsCompleted
                      ? "color-mix(in srgb, #4caf50 16%, var(--surface-muted))"
                      : "var(--surface-muted)",
                    border: allSetsCompleted
                      ? "3px solid #4caf50"
                      : "1px solid var(--border)",
                    borderRadius: "8px",
                    boxShadow: allSetsCompleted
                      ? "0 0 8px rgba(76,175,80,.5)"
                      : undefined,
                    color: "var(--text)",
                    display: "flex",
                    fontSize: "15px",
                    fontWeight: allSetsCompleted ? 800 : 700,
                    justifyContent: "space-between",
                    minHeight: "44px",
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <span>Complete Workout</span>
                  <Trophy size={18} />
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
                      <Trophy size={28} />
                    </div>
                    <div>Complete Workout?</div>
                  </div>
                </div>

                {!allSetsCompleted && (
                  <div
                    style={{
                      alignItems: "center",
                      background: "var(--warning-bg, rgba(255, 193, 7, .14))",
                      border: "1px solid var(--warning-border, #d6a100)",
                      borderRadius: "8px",
                      color: "var(--warning-text, var(--text))",
                      display: "flex",
                      gap: "8px",
                      marginBottom: "16px",
                      padding: "10px",
                    }}
                  >
                    <AlertTriangle size={18} />
                    <span>Warning: not all sets have been completed</span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <IconButton
                    label="Cancel"
                    onClick={() => setConfirmComplete(false)}
                  >
                    <X size={18} />
                  </IconButton>

                  <IconButton
                    label="Complete workout"
                    tone="success"
                    onClick={() => {
                      if (hasStructuralChanges()) {
                        setConfirmComplete(false);
                        setShowApplyChangesPrompt(true);
                        return;
                      }

                      completeWorkout();
                    }}
                  >
                    <Check size={18} />
                  </IconButton>
                </div>
              </div>
            </div>
          )}

          {showApplyChangesPrompt && (
            <div
              style={{
                alignItems: "center",
                background: "rgba(0,0,0,.45)",
                display: "flex",
                height: "100%",
                justifyContent: "center",
                left: 0,
                position: "fixed",
                top: 0,
                width: "100%",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  boxShadow: "0 0 20px rgba(0,0,0,.35)",
                  maxWidth: "320px",
                  padding: "20px",
                  width: "calc(100% - 32px)",
                }}
              >
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  Apply changes to workout?
                </div>

                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
                  Save exercise, set, or superset changes to this workout for
                  next time?
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "1fr 1fr 1fr",
                  }}
                >
                  <button onClick={() => setShowApplyChangesPrompt(false)}>
                    Cancel
                  </button>

                  <button
                    onClick={() => {
                      setShowApplyChangesPrompt(false);
                      completeWorkout({
                        applyStructuralChanges: false,
                      });
                    }}
                  >
                    No
                  </button>

                  <button
                    onClick={() => {
                      setShowApplyChangesPrompt(false);
                      completeWorkout({
                        applyStructuralChanges: true,
                      });
                    }}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>
          )}

          {(targetAlternativesData || targetAlternativesClosing) && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Target alternatives"
              onClick={() => closeTargetAlternatives()}
              style={{
                alignItems: "flex-end",
                background: "rgba(0,0,0,.45)",
                display: "flex",
                inset: 0,
                justifyContent: "center",
                position: "fixed",
                zIndex: 2200,
              }}
            >
              <div
                className="session-target-options-sheet"
                data-closing={targetAlternativesClosing ? "true" : "false"}
                onAnimationEnd={(event) => {
                  if (
                    event.currentTarget === event.target &&
                    targetAlternativesClosing
                  ) {
                    setTargetAlternativesClosing(false);
                    setTargetAlternativesData(null);
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "var(--surface-raised)",
                  borderRadius: "18px 18px 0 0",
                  boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
                  boxSizing: "border-box",
                  maxHeight: "78vh",
                  maxWidth: "520px",
                  overflowY: "auto",
                  padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
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
                  <div>
                    <h2
                      style={{
                        fontSize: "18px",
                        lineHeight: 1.15,
                        margin: 0,
                      }}
                    >
                      Target Options
                    </h2>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "12px",
                        marginTop: "3px",
                      }}
                    >
                      Most recent values and ranked alternatives
                    </div>
                  </div>

                  <IconButton
                    label="Close target options"
                    onClick={() => closeTargetAlternatives()}
                    size={36}
                  >
                    <X size={18} />
                  </IconButton>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      alignItems: "center",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      display: "grid",
                      gap: "10px",
                      gridTemplateColumns: "32px minmax(0, 1fr)",
                      padding: "10px",
                    }}
                  >
                    <span
                      style={{
                        alignItems: "center",
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: "999px",
                        color: "var(--text-muted)",
                        display: "inline-flex",
                        height: "32px",
                        justifyContent: "center",
                        width: "32px",
                      }}
                    >
                      <History size={17} />
                    </span>
                    <div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginBottom: "4px",
                        }}
                      >
                        Most recent actual
                      </div>
                      <strong>
                        {!isBlankValue(targetAlternativesData.current?.weight)
                          ? formatPrescriptionLabel(
                              targetAlternativesData.current
                            )
                          : "No previous actual value"}
                      </strong>
                      {targetAlternativesData.current?.e1rm != null && (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            marginLeft: "8px",
                          }}
                        >
                          e1RM {targetAlternativesData.current.e1rm.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      alignItems: "center",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      display: "grid",
                      gap: "10px",
                      gridTemplateColumns: "32px minmax(0, 1fr)",
                      padding: "10px",
                    }}
                  >
                    <span
                      style={{
                        alignItems: "center",
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: "999px",
                        color: "var(--accent)",
                        display: "inline-flex",
                        height: "32px",
                        justifyContent: "center",
                        width: "32px",
                      }}
                    >
                      <Target size={17} />
                    </span>
                    <div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginBottom: "4px",
                        }}
                      >
                        Suggested target
                      </div>
                      <strong>
                        {!isBlankValue(targetAlternativesData.suggested?.weight)
                          ? formatPrescriptionLabel(
                              targetAlternativesData.suggested
                            )
                          : "No suggested target"}
                      </strong>
                      {targetAlternativesData.suggested?.e1rm != null && (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            marginLeft: "8px",
                          }}
                        >
                          e1RM{" "}
                          {targetAlternativesData.suggested.e1rm.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {targetAlternativesData.alternatives.length === 0 ? (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        padding: "8px 0",
                      }}
                    >
                      No alternatives are available for this target yet.
                    </div>
                  ) : (
                    targetAlternativesData.alternatives.map((option, index) => (
                      <button
                        key={`${option.weight}-${option.reps}-${option.rir}`}
                        onClick={() => {
                          applyPrescriptionToActual(
                            targetAlternativesData.exerciseId,
                            targetAlternativesData.setId,
                            option
                          );
                          closeTargetAlternatives({ immediate: true });
                        }}
                        style={{
                          alignItems: "center",
                          display: "grid",
                          gap: "8px",
                          gridTemplateColumns: "28px minmax(0, 1fr) auto",
                          minHeight: "44px",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            alignItems: "center",
                            background: "var(--surface-muted)",
                            border: "1px solid var(--border)",
                            borderRadius: "999px",
                            color: "var(--text-muted)",
                            display: "inline-flex",
                            fontSize: "12px",
                            fontWeight: "bold",
                            height: "26px",
                            justifyContent: "center",
                            width: "26px",
                          }}
                        >
                          {index + 1}
                        </span>
                        <span>{formatPrescriptionLabel(option)}</span>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "13px",
                          }}
                        >
                          e1RM {option.e1rm.toFixed(1)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

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
            values={RIR_PICKER_VALUES}
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

          {warmupExercise && (
            <div
              style={{
                alignItems: "flex-end",
                background: "rgba(0,0,0,.45)",
                display: "flex",
                inset: 0,
                justifyContent: "center",
                position: "fixed",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  background: "var(--surface-raised)",
                  borderRadius: "18px 18px 0 0",
                  boxSizing: "border-box",
                  maxHeight: "82vh",
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
                    gap: "12px",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        alignItems: "center",
                        display: "flex",
                        gap: "8px",
                        fontWeight: "bold",
                      }}
                    >
                      <Flame size={18} />
                      <span>Warmup sets</span>
                    </div>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        marginTop: "3px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {warmupExercise.name}
                    </div>
                  </div>

                  <IconButton
                    label="Close warmup sets"
                    onClick={() => setWarmupExerciseId(null)}
                    size={34}
                  >
                    <X size={17} />
                  </IconButton>
                </div>

                {!warmupRecommendations?.baseE1RM ? (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text-muted)",
                      fontSize: "14px",
                      padding: "12px",
                    }}
                  >
                    Add actual weight and actual reps to the first working set
                    to calculate warmups.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        background: "var(--surface-muted)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "13px",
                        marginBottom: "12px",
                        padding: "10px",
                      }}
                    >
                      Based on set 1:{" "}
                      <strong>
                        {formatWarmupWeight(warmupRecommendations.baseWeight)}
                        {weightUnit} x {warmupRecommendations.baseReps} @{" "}
                        {warmupRecommendations.targetRir}
                      </strong>
                      <span style={{ color: "var(--text-muted)" }}>
                        {" "}
                        (e1RM{" "}
                        {formatWarmupWeight(warmupRecommendations.baseE1RM)}
                        {weightUnit})
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "12px",
                      }}
                    >
                      {warmupRecommendations.options.map((option) => (
                        <div
                          key={option.label}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            padding: "12px",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "bold",
                              marginBottom: "12px",
                            }}
                          >
                            {option.label}
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                alignItems: "center",
                                color: "var(--text-muted)",
                                display: "grid",
                                fontSize: "12px",
                                fontWeight: "bold",
                                gap: "8px",
                                gridTemplateColumns: "46px 1fr 44px 54px",
                                textAlign: "center",
                              }}
                            >
                              <span style={{ textAlign: "left" }}>Set</span>
                              <span
                                title="Weight"
                                style={{
                                  alignItems: "center",
                                  display: "inline-flex",
                                  justifyContent: "center",
                                }}
                              >
                                <Weight size={15} aria-label="Weight" />
                              </span>
                              <span
                                title="Reps"
                                style={{
                                  alignItems: "center",
                                  display: "inline-flex",
                                  justifyContent: "center",
                                }}
                              >
                                <Hash size={15} aria-label="Reps" />
                              </span>
                              <span>%</span>
                            </div>

                            {option.sets.map((warmupSet, index) => (
                              <div
                                key={`${option.label}-${warmupSet.reps}`}
                                style={{
                                  alignItems: "center",
                                  display: "grid",
                                  gap: "8px",
                                  gridTemplateColumns: "46px 1fr 44px 54px",
                                  textAlign: "center",
                                }}
                              >
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: "13px",
                                    textAlign: "left",
                                  }}
                                >
                                  Set {index + 1}
                                </span>
                                <strong style={{ whiteSpace: "nowrap" }}>
                                  {formatWarmupWeight(warmupSet.target?.weight)}
                                  {weightUnit}
                                </strong>
                                <span>{warmupSet.reps}</span>
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: "13px",
                                  }}
                                >
                                  {formatWarmupPercent(
                                    warmupSet.target?.percent
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {detailExercise && (
            <ExerciseDetailDialog
              exercise={detailExercise}
              history={history}
              onClose={() => setDetailExercise(null)}
            />
          )}
        </>
      </div>
    </div>
  );
}
