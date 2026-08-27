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
  Minus,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
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
import ExerciseLibraryEditDialog from "./ExerciseLibraryEditDialog";
import ExerciseThumbnail from "./ExerciseThumbnail";
import BenchmarkTrophy from "./BenchmarkTrophy";
import PlateLoadingCalculator, {
  getClosestLoadableWeight,
  getPlateCalculatorEquipmentId,
} from "./PlateLoadingCalculator";
import {
  calculateE1RM,
  estimateWeightForE1RM,
  getLatestBodyWeightForDate,
} from "../utils/e1rm";
import { EXERCISE_STATUS } from "../utils/exerciseStatus";
import {
  recommendSetTarget,
  recommendTargetPrescription,
} from "../utils/targetRecommendation";
import {
  getExerciseWeightIncrement,
  roundWeightToIncrement,
} from "../utils/weightIncrement";
import { findLatestExercisePerformance } from "../utils/workoutHistoryLookup";
import { isExerciseBenchmark } from "../utils/exerciseBenchmark";
import {
  canUseNativeRestNotifications,
  cancelNativeRestTimerNotification,
  scheduleNativeRestTimerNotification,
} from "../native/restTimerNotifications";
import {
  endNativeRestTimerLiveActivity,
  getNativeRestTimerLiveActivityState,
  pauseNativeRestTimerLiveActivity,
  resumeNativeRestTimerLiveActivity,
  startNativeRestTimerLiveActivity,
} from "../native/restTimerLiveActivity";
import {
  canUseNativeWorkoutIdleTimer,
  setNativeWorkoutAutoLockEnabled,
} from "../native/workoutIdleTimer";
import {
  cancelWorkoutPauseNotification,
  formatWorkoutPauseDuration,
  scheduleWorkoutPauseNotification,
} from "../native/workoutPauseNotifications";
import {
  cancelWorkoutInactivityNotification,
  scheduleWorkoutInactivityNotification,
} from "../native/workoutInactivityNotifications";
import {
  triggerNativeSetCompletionHaptic,
  triggerNativeWarningHaptic,
  triggerNativeWorkoutCompletionHaptic,
} from "../native/pickerHaptics";
import {
  addSpotifyPlaybackListener,
  canUseNativeSpotifyPlayback,
  connectSpotifyPlayback,
  getSpotifyPlaybackState,
  openSpotifyApp,
  skipSpotifyNext,
  skipSpotifyPrevious,
  toggleSpotifyPlayback,
} from "../native/spotifyPlayback";

const RIR_PICKER_VALUES = Array.from({ length: 13 }, (_, index) => index * 0.5);
const TARGET_RIR_PICKER_VALUES = Array.from({ length: 7 }, (_, index) => index);
const MAIN_TARGET_PROGRESSION_PERCENT = 0.005;
const DELOAD_TARGET_REDUCTION_PERCENT = 0.005;
const FATIGUE_RATIO_BLEND_TOWARD_FLAT = 0.5;
const CLEAR_FATIGUE_DROP_RATIO = 0.995;
const SAME_WEIGHT_TARGET_E1RM_TOLERANCE = 0.05;
const SAME_WEIGHT_TARGET_REP_WINDOW = 2;
const WEIGHT_CHANGE_TARGET_SCORE_PENALTY = 0.025;
const WORKOUT_PAUSE_REMINDER_SECONDS = 300;
const WORKOUT_INACTIVITY_REMINDER_SECONDS = 360;
const REST_NOTIFICATION_ICON = `${import.meta.env.BASE_URL || "/"}icon-192.png`;
const NATIVE_APP_ICON = `${
  import.meta.env.BASE_URL || "/"
}workout-icon-native.png`;
const HISTORY_DEFAULT_SOURCE_FIELDS = [
  "historyDefaultSourceKey",
  "historyDefaultActualWeight",
  "historyDefaultActualReps",
  "historyDefaultActualRir",
];

function getSessionSet(session, activeSet) {
  if (!activeSet?.exerciseId || !activeSet?.setId) {
    return null;
  }

  const exercise = session.exercises?.find(
    (item) => item.id === activeSet.exerciseId
  );
  const set = exercise?.sets?.find((item) => item.id === activeSet.setId);

  return exercise && set ? { exercise, set } : null;
}

function getInitialSessionActiveSet(session) {
  if (getSessionSet(session, session.activeSet)) {
    return session.activeSet;
  }

  const activeExercise = session.activeExerciseId
    ? session.exercises?.find((exercise) => exercise.id === session.activeExerciseId)
    : null;
  const activeExerciseSet =
    activeExercise?.sets?.find((set) => !set.completed) ||
    activeExercise?.sets?.[0];

  if (activeExercise && activeExerciseSet) {
    return {
      exerciseId: activeExercise.id,
      setId: activeExerciseSet.id,
    };
  }

  const firstExercise = session.exercises?.[0];
  const firstSet = firstExercise?.sets?.[0];

  return firstExercise && firstSet
    ? {
        exerciseId: firstExercise.id,
        setId: firstSet.id,
      }
    : null;
}

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

function shouldDefaultPlateLoadingToTricepBar(exercise) {
  const name = normalizeLookupValue(exercise?.name);

  return /\b(crunch|crunches|sit up|sit ups|situp|situps)\b/.test(name);
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

function SpotifyIcon({ size = 28 }) {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.505 17.302a.747.747 0 0 1-1.028.249c-2.817-1.722-6.365-2.111-10.541-1.157a.748.748 0 1 1-.333-1.458c4.57-1.045 8.492-.595 11.653 1.337a.747.747 0 0 1 .249 1.029Zm1.469-3.268a.936.936 0 0 1-1.287.308c-3.225-1.982-8.137-2.557-11.953-1.399a.936.936 0 1 1-.543-1.79c4.363-1.324 9.776-.682 13.475 1.591.44.271.578.848.308 1.29Zm.126-3.404C15.233 8.333 8.85 8.121 5.159 9.242a1.123 1.123 0 1 1-.652-2.149c4.239-1.287 11.289-1.038 15.738 1.602a1.123 1.123 0 0 1-1.145 1.935Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SpotifyArtwork({ imageDataURL, size = 32 }) {
  if (!imageDataURL) return <SpotifyIcon size={size} />;

  return (
    <img
      alt="Spotify playlist cover"
      src={imageDataURL}
      style={{
        borderRadius: "4px",
        display: "block",
        height: `${size}px`,
        objectFit: "contain",
        width: `${size}px`,
      }}
    />
  );
}

export default function SessionView({
  authSession = null,
  canEditBuiltInExercises = false,
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
  plateInventory,
  bodyWeightEntries = [],
  onWorkoutCompleted,
  onWorkoutDataCommitted,
  onPlanCompletionNeeded,
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
  const [lastCompletedExerciseId, setLastCompletedExerciseId] = useState(null);
  const [weightUnit, setWeightUnit] = useState("lb");
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [weightPickerData, setWeightPickerData] = useState(null);
  const [plateCalculatorData, setPlateCalculatorData] = useState(null);
  const [plateCalculatorClosing, setPlateCalculatorClosing] = useState(false);
  const [showRepsPicker, setShowRepsPicker] = useState(false);
  const [repsPickerData, setRepsPickerData] = useState(null);
  const [showRirPicker, setShowRirPicker] = useState(false);
  const [rirPickerData, setRirPickerData] = useState(null);
  const [showApplyChangesPrompt, setShowApplyChangesPrompt] = useState(false);
  const [workoutUpdateSelections, setWorkoutUpdateSelections] = useState({});
  const [targetAlternativesData, setTargetAlternativesData] = useState(null);
  const [targetAlternativesClosing, setTargetAlternativesClosing] =
    useState(false);
  const targetPressTimerRef = useRef(null);
  const targetLongPressRef = useRef(false);
  const appliedHistoryDefaultsRef = useRef(new Map());
  const restNotificationSentKeyRef = useRef(null);
  const nativeRestCompletionHandledRef = useRef(null);
  const wakeLockRef = useRef(null);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const [detailExercise, setDetailExercise] = useState(null);
  const [libraryEditingExercise, setLibraryEditingExercise] = useState(null);
  const [warmupExerciseId, setWarmupExerciseId] = useState(null);
  const exerciseStripRef = useRef(null);
  const exerciseThumbnailRefs = useRef({});
  const addExerciseButtonRef = useRef(null);
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

  function getLoadableWeightForExercise(exercise, weight) {
    const equipmentId = getExercisePlateCalculatorEquipmentId(exercise, null);

    if (!equipmentId) {
      return null;
    }

    const loadable = getClosestLoadableWeight(weight, equipmentId, plateInventory);

    return Number.isFinite(loadable?.weight) ? loadable.weight : null;
  }

  function getExercisePlateCalculatorEquipmentId(exercise, fallback = "barbell") {
    if (shouldDefaultPlateLoadingToTricepBar(exercise)) {
      return "tricepBar";
    }

    return getPlateCalculatorEquipmentId(exercise?.equipment, fallback);
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

  const getLatestMatchingHistoryPerformance = useCallback((sessionExercise) => {
    return findLatestExercisePerformance({
      currentSessionId: session.id,
      exercise: sessionExercise,
      history,
      plan: getLinkedPlan(),
      planWeek: session.planWeek,
      planWorkoutId: session.planWorkoutId,
      templateId: session.templateId,
      templates,
    });
  }, [
    history,
    plans,
    session.id,
    session.planId,
    session.planWeek,
    session.planWorkoutId,
    session.templateId,
    templates,
  ]);

  function getLatestWorkoutPerformance(exerciseOrId) {
    const sessionExercise =
      exerciseOrId && typeof exerciseOrId === "object"
        ? exerciseOrId
        : session.exercises.find(
            (exercise) =>
              exercise.exerciseId === exerciseOrId || exercise.id === exerciseOrId
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
      e1rm: isBlankValue(reps)
        ? null
        : calculateSessionE1RM(sessionExercise, weight, reps, rir),
      reps,
      rir,
      weight,
    };
  }

  function getLinkedPlan() {
    return plans.find((plan) => String(plan.id) === String(session.planId));
  }

  function isDeloadPlanWorkout() {
    const linkedPlan = getLinkedPlan();

    if (!linkedPlan?.config?.deload) {
      return false;
    }

    const planWeek = Number(session.planWeek || linkedPlan.currentWeek || 1);
    const deloadWeek = Number(linkedPlan.durationWeeks || 0) + 1;

    return planWeek === deloadWeek;
  }

  const sessionBodyWeight = getLatestBodyWeightForDate(
    bodyWeightEntries,
    session.workoutStartedAtIso || session.startedAtIso || session.startedAt
  );

  function getExerciseForCalculation(exercise) {
    const libraryExercise =
      exerciseLibrary.find(
        (item) => String(item.id) === String(exercise?.exerciseId)
      ) ||
      exerciseLibrary.find((item) => getExerciseKey(item) === getExerciseKey(exercise));

    return libraryExercise
      ? {
          ...libraryExercise,
          ...exercise,
          bodyweightLoadPercent:
            exercise?.bodyweightLoadPercent ??
            exercise?.bodyweight_load_percent ??
            libraryExercise.bodyweightLoadPercent ??
            libraryExercise.bodyweight_load_percent,
        }
      : exercise;
  }

  function calculateSessionE1RM(
    exercise,
    actualWeight,
    actualReps,
    actualRir,
    targetWeight,
    targetReps,
    targetRir
  ) {
    return calculateE1RM(
      actualWeight,
      actualReps,
      actualRir,
      targetWeight,
      targetReps,
      targetRir,
      {
        bodyWeight: sessionBodyWeight,
        exercise: getExerciseForCalculation(exercise),
      }
    );
  }

  function getGoalMode() {
    if (isDeloadPlanWorkout()) {
      return "maintenance";
    }

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
    const calculationExercise = getExerciseForCalculation(exercise);
    const isDeload = isDeloadPlanWorkout();
    const latestMaxE1RM =
      isDeload || (getGoalMode() === "progress" && setIndex === 0)
        ? getLatestMatchingMaxE1RM(exercise)
        : null;

    if (latestMaxE1RM) {
      const recommendation = getRecommendationFromE1RM(
        calculationExercise,
        latestMaxE1RM,
        reps,
        rir,
        isDeload
          ? {
              maxE1RM: latestMaxE1RM,
              progressionPercent: -DELOAD_TARGET_REDUCTION_PERCENT,
            }
          : undefined
      );
      const weight = recommendation?.weight;

      return weight != null ? String(weight) : "";
    }

    const recommendation = recommendSetTarget({
      bodyWeight: sessionBodyWeight,
      exercise: calculationExercise,
      goalMode: getGoalMode(),
      history,
      normalizeWeight: (weight) =>
        getLoadableWeightForExercise(calculationExercise, weight) ?? weight,
      setIndex,
      targetReps: reps,
      targetRir: rir,
      weightIncrement: (weight) =>
        getExerciseWeightIncrement(calculationExercise, undefined, weight),
    });

    const weight = recommendation.result?.recommendation?.weight;

    return weight != null ? String(weight) : "";
  }

  function getRecommendationFromE1RM(exercise, previousE1RM, reps, rir, options = {}) {
    const calculationExercise = getExerciseForCalculation(exercise);
    const result = recommendTargetPrescription({
      allowedRepWindow: options.allowedRepWindow ?? 2,
      bodyWeight: sessionBodyWeight,
      exercise: calculationExercise,
      goalMode: getGoalMode(),
      normalizeWeight: (weight) =>
        getLoadableWeightForExercise(calculationExercise, weight) ?? weight,
      preferredRepWindow: options.preferredRepWindow ?? 2,
      previousE1RM,
      progressionPercent:
        options.progressionPercent ?? MAIN_TARGET_PROGRESSION_PERCENT,
      targetReps: reps,
      targetRir: rir,
      weightIncrement: (weight) =>
        getExerciseWeightIncrement(calculationExercise, undefined, weight),
    });

    if (options.maxE1RM == null) {
      return result?.recommendation || null;
    }

    return [result?.recommendation, ...(result?.alternatives || [])].find(
      (candidate) => candidate?.e1rm < options.maxE1RM
    ) || null;
  }

  function getHistorySetE1RM(exercise, set, workout = null) {
    if (!set) {
      return null;
    }

    const historicalBodyWeight = workout
      ? getLatestBodyWeightForDate(
          bodyWeightEntries,
          workout.completedAt ||
            workout.workoutStartedAtIso ||
            workout.startedAtIso ||
            workout.startedAt
        )
      : sessionBodyWeight;
    const e1rm = calculateE1RM(
      firstPresentValue(set.actualWeight),
      firstPresentValue(set.actualReps),
      firstPresentValue(set.actualRir),
      null,
      null,
      null,
      {
        bodyWeight: historicalBodyWeight,
        exercise: getExerciseForCalculation(exercise),
      }
    );

    return Number.isFinite(e1rm) ? e1rm : null;
  }

  function getLatestMatchingMaxE1RM(exercise) {
    const latestPerformance = getLatestMatchingHistoryPerformance(exercise);
    const latestSets = latestPerformance?.exercise?.sets || [];
    const maxE1RM = Math.max(
      0,
      ...latestSets
        .map((set) =>
          getHistorySetE1RM(exercise, set, latestPerformance?.workout)
        )
        .filter(Number.isFinite)
    );

    return maxE1RM > 0 ? maxE1RM : null;
  }

  function getCurrentWorkoutBestE1RMThroughSet(exercise, setIndex, currentSetE1RM) {
    const completedE1RMs = (exercise?.sets || [])
      .slice(0, Math.max(0, setIndex))
      .map((set) =>
        set.id === currentSetE1RM?.setId
          ? currentSetE1RM.value
          : calculateSessionE1RM(
              exercise,
              set.actualWeight,
              set.actualReps,
              set.actualRir
            )
      )
      .filter(Number.isFinite);
    const maxE1RM = Math.max(
      0,
      ...completedE1RMs,
      Number(currentSetE1RM?.value) || 0
    );

    return maxE1RM > 0 ? maxE1RM : null;
  }

  function getNormalizedLatestFatigueRatio(exercise, setIndex) {
    const latestSets =
      getLatestMatchingHistoryPerformance(exercise)?.exercise?.sets || [];
    const latestE1RMs = latestSets.map((set) => getHistorySetE1RM(exercise, set));
    const latestMaxE1RM = Math.max(
      0,
      ...latestE1RMs.filter(Number.isFinite)
    );

    if (!latestMaxE1RM || setIndex < 1) {
      return 1;
    }

    let previousCurveE1RM = latestMaxE1RM;

    for (let index = 1; index <= setIndex; index += 1) {
      const rawSetE1RM = Number.isFinite(latestE1RMs[index])
        ? latestE1RMs[index]
        : previousCurveE1RM;

      previousCurveE1RM = Math.min(previousCurveE1RM, rawSetE1RM);
    }

    const rawRatio = Math.min(1, Math.max(0, previousCurveE1RM / latestMaxE1RM));

    return 1 - (1 - rawRatio) * FATIGUE_RATIO_BLEND_TOWARD_FLAT;
  }

  function getLatestAdjacentFatigueRatio(exercise, setIndex) {
    const latestSets =
      getLatestMatchingHistoryPerformance(exercise)?.exercise?.sets || [];
    const previousSetE1RM = getHistorySetE1RM(exercise, latestSets[setIndex - 1]);
    const matchingSetE1RM = getHistorySetE1RM(exercise, latestSets[setIndex]);

    if (
      !Number.isFinite(previousSetE1RM) ||
      previousSetE1RM <= 0 ||
      !Number.isFinite(matchingSetE1RM)
    ) {
      return null;
    }

    return Math.min(1, Math.max(0, matchingSetE1RM / previousSetE1RM));
  }

  function getRankedProgressionCandidates({
    balanceAroundE1RM = null,
    baselineE1RM,
    currentWeight,
    exercise,
    excludedPrescription = null,
    fatigueCeilingE1RM = null,
    minimumReps = null,
    progressionFloorE1RM = null,
    prescribedReps,
    targetRir,
  }) {
    const numericCurrentWeight = parseSessionNumber(currentWeight);
    const numericBalanceE1RM = parseSessionNumber(balanceAroundE1RM);
    const excludedWeight = parseSessionNumber(excludedPrescription?.weight);
    const excludedReps = parseSessionNumber(excludedPrescription?.reps);
    const excludedRir = parseSessionNumber(excludedPrescription?.rir);
    const numericPrescribedReps = parseSessionNumber(prescribedReps);
    const numericMinimumReps = parseSessionNumber(minimumReps);
    const numericRir = parseSessionNumber(targetRir) || 0;

    if (
      baselineE1RM == null ||
      !Number.isFinite(Number(baselineE1RM)) ||
      numericPrescribedReps == null
    ) {
      return [];
    }

    const maxCandidateReps = Math.max(1, Math.round(numericPrescribedReps));
    const minReps = Math.max(
      1,
      Math.min(
        maxCandidateReps,
        Math.round(
          numericMinimumReps ??
            maxCandidateReps - SAME_WEIGHT_TARGET_REP_WINDOW
        )
      )
    );
    const calculationExercise = getExerciseForCalculation(exercise);
    const candidates = [];
    const seenKeys = new Set();

    function addCandidate(weight, reps) {
      const numericWeight = parseSessionNumber(weight);

      if (numericWeight == null || reps == null) {
        return;
      }

      const normalizedWeight =
        getLoadableWeightForExercise(calculationExercise, numericWeight) ??
        numericWeight;
      const key = `${normalizedWeight}|${reps}|${numericRir}`;

      if (seenKeys.has(key)) {
        return;
      }

      const e1rm = calculateSessionE1RM(
        calculationExercise,
        normalizedWeight,
        reps,
        numericRir
      );

      if (!Number.isFinite(e1rm)) {
        return;
      }

      seenKeys.add(key);
      candidates.push({
        clearsProgressionFloor:
          progressionFloorE1RM == null || e1rm >= progressionFloorE1RM,
        e1rm,
        e1rmDeviation: Math.abs(e1rm - baselineE1RM) / baselineE1RM,
        isProgressionCandidate: e1rm >= baselineE1RM,
        isSameWeight:
          numericCurrentWeight != null &&
          Math.abs(normalizedWeight - numericCurrentWeight) < 0.001,
        repDeviation: Math.abs(reps - maxCandidateReps),
        reps,
        rir: numericRir,
        respectsFatigueCeiling:
          fatigueCeilingE1RM == null || e1rm < fatigueCeilingE1RM,
        weight: normalizedWeight,
      });
    }

    for (let reps = minReps; reps <= maxCandidateReps; reps += 1) {
      addCandidate(numericCurrentWeight, reps);

      const rawWeight = estimateWeightForE1RM(baselineE1RM, reps, numericRir, {
        bodyWeight: sessionBodyWeight,
        exercise: calculationExercise,
      });
      const increment = getExerciseWeightIncrement(
        calculationExercise,
        undefined,
        rawWeight
      );
      const roundedWeight = roundWeightToIncrement(
        Math.max(0, rawWeight ?? 0),
        increment
      );

      [roundedWeight - increment, roundedWeight, roundedWeight + increment]
        .filter((weight) => Number.isFinite(weight) && weight >= 0)
        .forEach((weight) => addCandidate(weight, reps));

      if (numericBalanceE1RM != null) {
        const displayedTargetRawWeight = estimateWeightForE1RM(
          numericBalanceE1RM,
          reps,
          numericRir,
          {
            bodyWeight: sessionBodyWeight,
            exercise: calculationExercise,
          }
        );
        const displayedTargetIncrement = getExerciseWeightIncrement(
          calculationExercise,
          undefined,
          displayedTargetRawWeight
        );
        const displayedTargetRoundedWeight = roundWeightToIncrement(
          Math.max(0, displayedTargetRawWeight ?? 0),
          displayedTargetIncrement
        );

        [
          displayedTargetRoundedWeight - displayedTargetIncrement,
          displayedTargetRoundedWeight,
          displayedTargetRoundedWeight + displayedTargetIncrement,
        ]
          .filter((weight) => Number.isFinite(weight) && weight >= 0)
          .forEach((weight) => addCandidate(weight, reps));
      }
    }

    const eligibleCandidates = candidates.filter((candidate) => {
      if (
        excludedWeight == null ||
        excludedReps == null ||
        excludedRir == null
      ) {
        return true;
      }

      return !(
        Math.abs(candidate.weight - excludedWeight) < 0.001 &&
        candidate.reps === excludedReps &&
        Math.abs(candidate.rir - excludedRir) < 0.001
      );
    });
    const progressionCandidates =
      progressionFloorE1RM != null &&
      eligibleCandidates.some((candidate) => candidate.clearsProgressionFloor)
        ? eligibleCandidates.filter((candidate) => candidate.clearsProgressionFloor)
        : eligibleCandidates;
    const closeProgressionCandidates = progressionCandidates.filter(
      (candidate) =>
        candidate.e1rmDeviation <= SAME_WEIGHT_TARGET_E1RM_TOLERANCE
    );
    const candidatePool = closeProgressionCandidates.length
      ? closeProgressionCandidates
      : progressionCandidates;
    if (
      fatigueCeilingE1RM != null &&
      candidatePool.length > 0 &&
      !candidatePool.some((candidate) => candidate.respectsFatigueCeiling)
    ) {
      return [];
    }
    const fatigueCandidatePool =
      fatigueCeilingE1RM != null &&
      candidatePool.some((candidate) => candidate.respectsFatigueCeiling)
        ? candidatePool.filter((candidate) => candidate.respectsFatigueCeiling)
        : candidatePool;

    const sortCandidates = (candidateList) =>
      [...candidateList].sort((a, b) => {
        const progressionComparison =
          Number(b.isProgressionCandidate) - Number(a.isProgressionCandidate);
        const candidateScore = (candidate) =>
          candidate.e1rmDeviation +
          (candidate.isSameWeight ? 0 : WEIGHT_CHANGE_TARGET_SCORE_PENALTY) +
          candidate.repDeviation * 0.002;

        return (
          candidateScore(a) - candidateScore(b) ||
          progressionComparison ||
          Number(b.isSameWeight) - Number(a.isSameWeight) ||
          a.repDeviation - b.repDeviation ||
          b.reps - a.reps
        );
      });
    const primaryCandidate = sortCandidates(fatigueCandidatePool)[0] || null;
    const broaderCandidatePool =
      fatigueCeilingE1RM != null &&
      eligibleCandidates.some((candidate) => candidate.respectsFatigueCeiling)
        ? eligibleCandidates.filter(
            (candidate) => candidate.respectsFatigueCeiling
          )
        : eligibleCandidates;
    const broaderRankedCandidates = sortCandidates(broaderCandidatePool);
    const selectedCandidates = [];

    function selectCandidate(candidate) {
      if (candidate && !selectedCandidates.includes(candidate)) {
        selectedCandidates.push(candidate);
      }
    }

    if (numericBalanceE1RM != null) {
      const comparisonTolerance = Math.max(0.01, numericBalanceE1RM * 0.0001);
      const byDistanceFromDisplayedTarget = (a, b) =>
        Math.abs(a.e1rm - numericBalanceE1RM) -
          Math.abs(b.e1rm - numericBalanceE1RM) ||
        broaderRankedCandidates.indexOf(a) -
          broaderRankedCandidates.indexOf(b);
      const belowTarget = broaderRankedCandidates
        .filter(
          (candidate) =>
            candidate.e1rm < numericBalanceE1RM - comparisonTolerance
        )
        .sort(byDistanceFromDisplayedTarget);
      const nearTarget = broaderRankedCandidates
        .filter(
          (candidate) =>
            Math.abs(candidate.e1rm - numericBalanceE1RM) <=
            comparisonTolerance
        )
        .sort(byDistanceFromDisplayedTarget);
      const aboveTarget = broaderRankedCandidates
        .filter(
          (candidate) =>
            candidate.e1rm > numericBalanceE1RM + comparisonTolerance
        )
        .sort(byDistanceFromDisplayedTarget);

      for (let index = 0; index < 4; index += 1) {
        selectCandidate(belowTarget[index]);
        selectCandidate(aboveTarget[index]);
      }
      nearTarget.forEach(selectCandidate);
      [...broaderRankedCandidates]
        .sort(byDistanceFromDisplayedTarget)
        .forEach((candidate) => {
          if (selectedCandidates.length < 8) {
            selectCandidate(candidate);
          }
        });

      return selectedCandidates.slice(0, 8);
    }

    // Keep the established best recommendation first, then deliberately reserve
    // room for choices across the prescribed range and in both load directions.
    selectCandidate(primaryCandidate);

    const midpointReps = Math.round((minReps + maxCandidateReps) / 2);
    [minReps, midpointReps, maxCandidateReps].forEach((reps) => {
      selectCandidate(
        broaderRankedCandidates.find(
          (candidate) => candidate.reps === reps && candidate.isSameWeight
        ) ||
          broaderRankedCandidates.find((candidate) => candidate.reps === reps)
      );
    });

    if (numericCurrentWeight != null) {
      selectCandidate(
        broaderRankedCandidates.find(
          (candidate) => candidate.weight < numericCurrentWeight
        )
      );
      selectCandidate(
        broaderRankedCandidates.find((candidate) => candidate.isSameWeight)
      );
      selectCandidate(
        broaderRankedCandidates.find(
          (candidate) => candidate.weight > numericCurrentWeight
        )
      );
    }

    selectCandidate(
      broaderRankedCandidates.find(
        (candidate) => !candidate.clearsProgressionFloor
      )
    );
    broaderRankedCandidates.forEach((candidate) => {
      if (selectedCandidates.length < 8) {
        selectCandidate(candidate);
      }
    });

    return selectedCandidates.slice(0, 8);
  }

  function getTargetRecommendation(exercise, set, setIndex) {
    const calculationExercise = getExerciseForCalculation(exercise);

    return recommendSetTarget({
      allowedRepWindow: 2,
      bodyWeight: sessionBodyWeight,
      exercise: calculationExercise,
      goalMode: getGoalMode(),
      history,
      normalizeWeight: (weight) =>
        getLoadableWeightForExercise(calculationExercise, weight) ?? weight,
      preferredRepWindow: 2,
      setIndex,
      targetReps: getSetTargetReps(set),
      targetRir: getSetTargetRir(set),
      weightIncrement: (weight) =>
        getExerciseWeightIncrement(calculationExercise, undefined, weight),
    });
  }

  function firstPresentValue(...values) {
    const value = values.find((item) => item != null && item !== "");

    return value == null ? "" : value;
  }

  function formatSetupDefault(value) {
    return value == null || value === "" ? "" : String(value);
  }

  function getSetPrescribedReps(set, fallback = "") {
    return firstPresentValue(set?.prescribedReps, set?.reps, set?.targetReps, fallback);
  }

  function getSetMinimumReps(set, fallback = "") {
    return firstPresentValue(
      set?.prescribedMinimumReps,
      set?.minimumReps,
      set?.minimum_reps,
      set?.targetMinimumReps,
      fallback
    );
  }

  function getSetPrescribedRir(set, fallback = "") {
    return firstPresentValue(set?.prescribedRir, set?.rir, set?.targetRir, fallback);
  }

  function getSetPrescribedRestSeconds(set, fallback = null) {
    const parsed = Number(
      firstPresentValue(
        set?.prescribedRestSeconds,
        set?.restSeconds,
        set?.rest_seconds,
        fallback
      )
    );

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  function getSetTargetReps(set, fallback = "") {
    return firstPresentValue(set?.targetReps, getSetPrescribedReps(set), fallback);
  }

  function getSetTargetRepDisplay(set) {
    const maximumReps = getSetTargetReps(set);
    const minimumReps = getSetMinimumReps(set);

    return minimumReps && String(minimumReps) !== String(maximumReps)
      ? `${minimumReps}–${maximumReps}`
      : maximumReps;
  }

  function getSetTargetRir(set, fallback = "") {
    return getSetPrescribedRir(set, fallback);
  }

  const getHistoryDefaultsForSet = useCallback((sessionExercise, setIndex) => {
    const latestPerformance =
      getLatestMatchingHistoryPerformance(sessionExercise);
    const historySet = latestPerformance?.exercise?.sets?.[setIndex];

    if (!historySet) {
      return null;
    }

    const sourceWorkoutId =
      latestPerformance?.workout?.id ||
      latestPerformance?.workout?.source_key ||
      latestPerformance?.workout?.sourceKey ||
      "";
    const sourceExerciseId =
      latestPerformance?.exercise?.id ||
      latestPerformance?.exercise?.exerciseId ||
      "";
    const sourceSetId = historySet.id || historySet.setId || setIndex;

    return {
      actualReps: formatSetupDefault(
        firstPresentValue(historySet.actualReps)
      ),
      actualRir: formatSetupDefault(
        firstPresentValue(historySet.actualRir)
      ),
      actualWeight: formatSetupDefault(
        firstPresentValue(historySet.actualWeight)
      ),
      sourceKey: `history:${sourceWorkoutId}:${sourceExerciseId}:${sourceSetId}`,
    };
  }, [getLatestMatchingHistoryPerformance]);

  function isBlankValue(value) {
    return value == null || value === "";
  }

  function valuesMatch(left, right) {
    if (isBlankValue(left) || isBlankValue(right)) {
      return isBlankValue(left) && isBlankValue(right);
    }

    const leftNumber = parseSessionNumber(left);
    const rightNumber = parseSessionNumber(right);

    if (leftNumber != null && rightNumber != null) {
      return Math.abs(leftNumber - rightNumber) < 0.001;
    }

    return String(left) === String(right);
  }

  function getStoredHistoryDefault(set) {
    if (!set?.historyDefaultSourceKey) {
      return null;
    }

    return {
      actualReps: set.historyDefaultActualReps || "",
      actualRir: set.historyDefaultActualRir || "",
      actualWeight: set.historyDefaultActualWeight || "",
      sourceKey: set.historyDefaultSourceKey,
    };
  }

  function buildHistoryDefaultMetadata(defaults) {
    if (!defaults?.sourceKey) {
      return null;
    }

    return {
      actualReps: formatSetupDefault(defaults.actualReps),
      actualRir: formatSetupDefault(defaults.actualRir),
      actualWeight: formatSetupDefault(defaults.actualWeight),
      sourceKey: defaults.sourceKey,
    };
  }

  function stripHistoryDefaultMetadata(set) {
    const nextSet = { ...set };

    HISTORY_DEFAULT_SOURCE_FIELDS.forEach((field) => {
      delete nextSet[field];
    });

    return nextSet;
  }

  function getHistoryDefaultUpdates(set, defaults, previousDefault) {
    const metadata = buildHistoryDefaultMetadata(defaults);

    if (!metadata) {
      return null;
    }

    const sourceChanged =
      previousDefault?.sourceKey &&
      previousDefault.sourceKey !== metadata.sourceKey;
    const defaultChanged =
      previousDefault &&
      (!valuesMatch(previousDefault.actualWeight, metadata.actualWeight) ||
        !valuesMatch(previousDefault.actualReps, metadata.actualReps) ||
        !valuesMatch(previousDefault.actualRir, metadata.actualRir));
    const canReplacePreviousDefault = sourceChanged || defaultChanged;
    const updates = {};

    if (
      metadata.actualWeight &&
      (isBlankValue(set.actualWeight) ||
        (canReplacePreviousDefault &&
          valuesMatch(set.actualWeight, previousDefault.actualWeight)))
    ) {
      updates.actualWeight = metadata.actualWeight;
    }

    if (
      metadata.actualReps &&
      (isBlankValue(set.actualReps) ||
        (canReplacePreviousDefault &&
          valuesMatch(set.actualReps, previousDefault.actualReps)))
    ) {
      updates.actualReps = metadata.actualReps;
    }

    if (
      metadata.actualRir !== "" &&
      (isBlankValue(set.actualRir) ||
        (canReplacePreviousDefault &&
          valuesMatch(set.actualRir, previousDefault.actualRir)))
    ) {
      updates.actualRir = metadata.actualRir;
    }

    if (!Object.keys(updates).length) {
      return null;
    }

    return {
      metadata,
      updates: {
        ...updates,
        historyDefaultActualReps: metadata.actualReps,
        historyDefaultActualRir: metadata.actualRir,
        historyDefaultActualWeight: metadata.actualWeight,
        historyDefaultSourceKey: metadata.sourceKey,
      },
    };
  }

  function actualsMatchPrescription(set, prescription) {
    if (!prescription) {
      return false;
    }

    const maximumReps = parseSessionNumber(prescription.reps);
    const minimumReps = Math.max(
      1,
      Math.min(
        maximumReps,
        parseSessionNumber(prescription.minimumReps) ??
          maximumReps - SAME_WEIGHT_TARGET_REP_WINDOW
      )
    );
    const actualReps = parseSessionNumber(set.actualReps);

    return (
      !isBlankValue(set.actualWeight) &&
      !isBlankValue(set.actualReps) &&
      !isBlankValue(set.actualRir) &&
      valuesMatch(set.actualWeight, prescription.weight) &&
      actualReps >= minimumReps &&
      actualReps <= maximumReps &&
      valuesMatch(set.actualRir, prescription.rir)
    );
  }

  function hasCompleteTargetPrescription(set) {
    return (
      !isBlankValue(set.targetWeight) &&
      !isBlankValue(getSetTargetReps(set)) &&
      !isBlankValue(getSetTargetRir(set))
    );
  }

  function getRankedProgressionAlternativesForSet(exercise, set, setIndex) {
    const previousSet = setIndex > 0 ? exercise.sets?.[setIndex - 1] : null;

    if (getGoalMode() !== "progress" || !previousSet) {
      return [];
    }

    const prescribedReps = parseSessionNumber(
      getSetPrescribedReps(set, getSetPrescribedReps(previousSet))
    );
    const minimumReps = parseSessionNumber(
      getSetMinimumReps(set, getSetMinimumReps(previousSet))
    );

    if (prescribedReps == null) {
      return [];
    }

    const targetRir = getSetPrescribedRir(set, getSetPrescribedRir(previousSet));
    const actualWeight = firstPresentValue(previousSet.actualWeight);
    const actualReps = parseSessionNumber(previousSet.actualReps);
    const actualRir = firstPresentValue(previousSet.actualRir);
    const actualE1RM = calculateSessionE1RM(
      exercise,
      actualWeight,
      actualReps,
      actualRir
    );
    const currentTargetWeight = firstPresentValue(
      previousSet.actualWeight,
      previousSet.targetWeight
    );
    const latestMatchingSet =
      getLatestMatchingHistoryPerformance(exercise)?.exercise?.sets?.[setIndex];
    const latestMatchingSetE1RM = getHistorySetE1RM(exercise, latestMatchingSet);
    const todayBestE1RM = getCurrentWorkoutBestE1RMThroughSet(exercise, setIndex, {
      setId: previousSet.id,
      value: actualE1RM,
    });
    const fatigueRatio = getNormalizedLatestFatigueRatio(exercise, setIndex);
    const adjacentFatigueRatio = getLatestAdjacentFatigueRatio(exercise, setIndex);
    const progressTargetE1RM =
      latestMatchingSetE1RM == null
        ? null
        : latestMatchingSetE1RM * (1 + MAIN_TARGET_PROGRESSION_PERCENT);
    const fatigueTargetE1RM =
      actualE1RM != null && adjacentFatigueRatio != null
        ? actualE1RM * adjacentFatigueRatio
        : todayBestE1RM == null
          ? null
          : todayBestE1RM * fatigueRatio;
    const hasClearPriorFatigueDrop =
      (adjacentFatigueRatio ?? fatigueRatio) < CLEAR_FATIGUE_DROP_RATIO;
    const baselineE1RM =
      progressTargetE1RM != null && fatigueTargetE1RM != null
        ? hasClearPriorFatigueDrop
          ? Math.max(latestMatchingSetE1RM || 0, fatigueTargetE1RM)
          : Math.max(progressTargetE1RM, fatigueTargetE1RM)
        : progressTargetE1RM ?? fatigueTargetE1RM ?? actualE1RM;
    const displayedTarget = {
      reps: getSetTargetReps(set),
      rir: getSetTargetRir(set),
      weight: set.targetWeight,
    };
    const displayedTargetE1RM = calculateSessionE1RM(
      exercise,
      "",
      "",
      "",
      displayedTarget.weight,
      displayedTarget.reps,
      displayedTarget.rir
    );

    return getRankedProgressionCandidates({
      balanceAroundE1RM: displayedTargetE1RM,
      baselineE1RM,
      currentWeight: currentTargetWeight,
      exercise,
      excludedPrescription: displayedTarget,
      fatigueCeilingE1RM: hasClearPriorFatigueDrop ? actualE1RM : null,
      minimumReps,
      progressionFloorE1RM: hasClearPriorFatigueDrop
        ? latestMatchingSetE1RM
        : null,
      prescribedReps,
      targetRir,
    });
  }

  function getActualTargetMatchStatus(exercise, set, setIndex) {
    if (!hasCompleteTargetPrescription(set)) {
      return "match";
    }

    if (
      isBlankValue(set.actualWeight) &&
      isBlankValue(set.actualReps) &&
      isBlankValue(set.actualRir)
    ) {
      return "match";
    }

    const targetPrescription = {
      minimumReps: getSetMinimumReps(set),
      reps: getSetTargetReps(set),
      rir: getSetTargetRir(set),
      weight: set.targetWeight,
    };

    if (actualsMatchPrescription(set, targetPrescription)) {
      return "suggested";
    }

    const rankedProgressionAlternatives =
      getRankedProgressionAlternativesForSet(exercise, set, setIndex) || [];
    const alternatives =
      rankedProgressionAlternatives.length > 0
        ? rankedProgressionAlternatives
        : getTargetRecommendation(exercise, set, setIndex).result?.alternatives ||
          [];
    const matchesAlternative = alternatives.some((option) =>
      actualsMatchPrescription(set, option)
    );

    return matchesAlternative ? "alternative" : "off-target";
  }

  function formatPrescriptionLabel(prescription) {
    if (!prescription) {
      return "";
    }

    return `${prescription.weight} × ${prescription.reps} @ ${prescription.rir}`;
  }

  function formatPrescriptionValue(value) {
    return isBlankValue(value) ? "—" : String(value);
  }

  function getExercisePrescriptionDisplay(exercise) {
    const targetSet =
      exercise?.sets?.find((set) => !set.completed) || exercise?.sets?.[0];

    return {
      reps: formatPrescriptionValue(getSetTargetRepDisplay(targetSet)),
      rir: formatPrescriptionValue(getSetPrescribedRir(targetSet)),
    };
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

  function formatSessionE1RMDisplay(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "—";
    }

    return weightUnit === "kg"
      ? lbsToKg(numericValue.toFixed(1))
      : numericValue.toFixed(1);
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
    weightIncrement,
    normalizeWeight,
    calculationOptions = {}
  ) {
    const rawWeight = estimateWeightForE1RM(
      baseE1RM * targetPercent,
      reps,
      rir,
      calculationOptions
    );
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
      .map((candidate) =>
        typeof normalizeWeight === "function"
          ? normalizeWeight(candidate)
          : candidate
      )
      .filter((candidate) => Number.isFinite(candidate) && candidate >= 0)
      .map((candidate) => {
        const e1rm = calculateE1RM(
          candidate,
          reps,
          rir,
          null,
          null,
          null,
          calculationOptions
        );

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
    weightIncrement,
    normalizeWeight,
    calculationOptions = {}
  ) {
    const midpoint = (minPercent + maxPercent) / 2;
    const rawWeight = estimateWeightForE1RM(
      baseE1RM * midpoint,
      reps,
      rir,
      calculationOptions
    );
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
      .map((candidate) =>
        typeof normalizeWeight === "function"
          ? normalizeWeight(candidate)
          : candidate
      )
      .filter((candidate) => Number.isFinite(candidate) && candidate >= 0)
      .map((candidate) => {
        const e1rm = calculateE1RM(
          candidate,
          reps,
          rir,
          null,
          null,
          null,
          calculationOptions
        );
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
    const calculationExercise = getExerciseForCalculation(exercise);
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
    const baseE1RM = calculateE1RM(
      baseWeight,
      baseReps,
      targetRir,
      null,
      null,
      null,
      {
        bodyWeight: sessionBodyWeight,
        exercise: calculationExercise,
      }
    );
    const weightIncrement = getExerciseWeightIncrement(calculationExercise);
    const normalizeWarmupWeight = (weight) =>
      getLoadableWeightForExercise(calculationExercise, weight) ?? weight;
    const warmupCalculationOptions = {
      bodyWeight: sessionBodyWeight,
      exercise: calculationExercise,
    };

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
                weightIncrement,
                normalizeWarmupWeight,
                warmupCalculationOptions
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
                weightIncrement,
                normalizeWarmupWeight,
                warmupCalculationOptions
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
                weightIncrement,
                normalizeWarmupWeight,
                warmupCalculationOptions
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
    const reps = getSetPrescribedReps(firstSet);
    const rir = getSetPrescribedRir(firstSet);

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
      getSetPrescribedReps(previousFirstSet)
    );
    const rir = firstPresentValue(
      planTargets.rir,
      getSetPrescribedRir(previousFirstSet)
    );

    return {
      reps: formatSetupDefault(reps),
      rir: formatSetupDefault(rir),
      sets: "3",
      weight: getRecommendedTargetWeight(exercise, reps, rir),
    };
  }

  const [selectedMuscle, setSelectedMuscle] = useState("");

  const initialActiveSet = getInitialSessionActiveSet(session);
  const initialActiveExerciseId =
    session.activeExerciseId ||
    initialActiveSet?.exerciseId ||
    session.exercises[0]?.id ||
    null;
  const [activeSet, setActiveSet] = useState(initialActiveSet);
  const [activeExerciseId, setActiveExerciseId] = useState(
    initialActiveExerciseId
  );

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

  function setActiveWorkoutFocus(nextActiveSet, nextActiveExerciseId) {
    const resolvedExerciseId =
      nextActiveExerciseId || nextActiveSet?.exerciseId || null;

    setActiveSet(nextActiveSet || null);
    setActiveExerciseId(resolvedExerciseId);
    updateSession((s) => ({
      ...s,
      activeExerciseId: resolvedExerciseId,
      activeSet: nextActiveSet || null,
    }));
  }

  useEffect(() => {
    let hasUpdates = false;
    const nextAppliedDefaults = new Map(appliedHistoryDefaultsRef.current);

    const exercises = session.exercises.map((exercise) => {
      let exerciseChanged = false;
      const sets = exercise.sets.map((set, setIndex) => {
        const defaultKey = `${session.id}:${exercise.id}:${set.id}`;
        const defaults = getHistoryDefaultsForSet(exercise, setIndex);

        if (!defaults) {
          return set;
        }

        const defaultUpdate = getHistoryDefaultUpdates(
          set,
          defaults,
          getStoredHistoryDefault(set) || nextAppliedDefaults.get(defaultKey)
        );

        if (!defaultUpdate) {
          return set;
        }

        nextAppliedDefaults.set(defaultKey, defaultUpdate.metadata);
        hasUpdates = true;
        exerciseChanged = true;

        return {
          ...set,
          ...defaultUpdate.updates,
        };
      });

      return exerciseChanged
        ? {
            ...exercise,
            sets,
          }
        : exercise;
    });

    appliedHistoryDefaultsRef.current = nextAppliedDefaults;

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

    if (session.workoutTimerPaused) {
      return;
    }

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
      if (session.workoutTimerPaused) {
        return;
      }

      appliedHistoryDefaultsRef.current.delete(`${session.id}:${exerciseId}:${setId}`);

      updateSession((s) => ({
        ...s,

        exercises: s.exercises.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,

                sets: ex.sets.map((set) =>
                  set.id === setId
                    ? stripHistoryDefaultMetadata({
                        ...set,
                        [field]: value,
                      })
                    : set
                ),
              }
            : ex
        ),
      }));
    },
    [session.id, session.workoutTimerPaused, updateSession]
  );

  function applyTargetToActual(exerciseId, setId) {
    if (session.workoutTimerPaused) {
      return;
    }

    const exercise = session.exercises.find((ex) => ex.id === exerciseId);
    const set = exercise?.sets.find((item) => item.id === setId);

    if (!set) {
      return;
    }

    applyPrescriptionToActual(exerciseId, setId, {
      reps: getSetTargetReps(set),
      rir: getSetTargetRir(set),
      weight: set.targetWeight,
    });
  }

  function applyPrescriptionToActual(exerciseId, setId, prescription) {
    if (session.workoutTimerPaused) {
      return;
    }

    appliedHistoryDefaultsRef.current.delete(`${session.id}:${exerciseId}:${setId}`);

    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              sets: ex.sets.map((set) =>
                set.id === setId
                  ? stripHistoryDefaultMetadata({
                      ...set,
                      actualReps: formatSetupDefault(prescription.reps),
                      actualRir: formatSetupDefault(prescription.rir),
                      actualWeight: formatSetupDefault(prescription.weight),
                    })
                  : set
              ),
            }
          : ex
      ),
    }));
  }

  function shouldUpdatePlanPrescriptionWeek(week, currentWeek) {
    const weekNumber = Number(week.weekNumber);

    return week.isDeload
      ? weekNumber === currentWeek
      : weekNumber >= currentWeek;
  }

  function updateWeeklyPrescriptions(weeklyPrescriptions, currentWeek, updates) {
    if (!Array.isArray(weeklyPrescriptions)) {
      return weeklyPrescriptions;
    }

    return weeklyPrescriptions.map((week) => {
      if (!shouldUpdatePlanPrescriptionWeek(week, currentWeek)) {
        return week;
      }

      const nextWeek = { ...week };

      Object.entries(updates).forEach(([field, value]) => {
        if (!isBlankValue(value)) {
          nextWeek[field] = value;
        }
      });

      return nextWeek;
    });
  }

  function updateExercisePrescription(exerciseId, field, value) {
    if (session.workoutTimerPaused) {
      return;
    }

    const nextValue = formatSetupDefault(value);
    const prescriptionField = field === "prescribedRir" ? "rir" : "reps";
    const targetField = field === "prescribedRir" ? "targetRir" : "targetReps";

    updateSession((s) => ({
      ...s,
      prescriptionEditFieldsByExercise: {
        ...(s.prescriptionEditFieldsByExercise || {}),
        [exerciseId]: [
          ...new Set([
            ...(s.prescriptionEditFieldsByExercise?.[exerciseId] || []),
            prescriptionField,
          ]),
        ],
      },
      exercises: s.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const hasIncompleteSets = exercise.sets.some((set) => !set.completed);

        return {
          ...exercise,
          ...(session.planId && Array.isArray(exercise.weeklyPrescriptions)
            ? {
                weeklyPrescriptions: updateWeeklyPrescriptions(
                  exercise.weeklyPrescriptions,
                  Number(session.planWeek || getLinkedPlan()?.currentWeek || 1),
                  { [prescriptionField]: nextValue }
                ),
              }
            : {}),
          sets: exercise.sets.map((set, setIndex) => {
            if (hasIncompleteSets && set.completed) {
              return set;
            }

            const targetReps =
              field === "prescribedReps" ? nextValue : getSetTargetReps(set);
            const targetRir =
              field === "prescribedRir" ? nextValue : getSetTargetRir(set);
            const targetWeight =
              getRecommendedTargetWeight(
                exercise,
                targetReps,
                targetRir,
                setIndex
              ) || set.targetWeight;

            return {
              ...set,
              [field]: nextValue,
              [prescriptionField]: nextValue,
              [targetField]: nextValue,
              targetWeight,
            };
          }),
        };
      }),
    }));
  }

  function openTargetAlternatives(exercise, set, setIndex) {
    if (session.workoutTimerPaused) {
      return;
    }

    const recommendation = getTargetRecommendation(exercise, set, setIndex);
    const current = getLatestActualForSet(exercise, setIndex);
    const suggested = {
      e1rm: calculateSessionE1RM(
        exercise,
        "",
        "",
        "",
        set.targetWeight,
        getSetTargetReps(set),
        getSetTargetRir(set)
      ),
      reps: getSetTargetReps(set),
      rir: getSetTargetRir(set),
      weight: set.targetWeight,
    };
    let alternatives = recommendation.result?.alternatives || [];
    const rankedProgressionAlternatives =
      getRankedProgressionAlternativesForSet(exercise, set, setIndex) || [];

    if (rankedProgressionAlternatives.length > 0) {
      alternatives = rankedProgressionAlternatives;
    }

    const targetOptions = [
      ...alternatives
        .filter(
          (option) =>
            !(
              valuesMatch(option.weight, suggested.weight) &&
              valuesMatch(option.reps, suggested.reps) &&
              valuesMatch(option.rir, suggested.rir)
            )
        )
        .map((option) => ({ ...option, isSuggested: false })),
      { ...suggested, isSuggested: true },
    ].sort((a, b) => (b.e1rm ?? -Infinity) - (a.e1rm ?? -Infinity));

    window.getSelection?.()?.removeAllRanges();

    setTargetAlternativesClosing(false);
    setTargetAlternativesData({
      alternatives,
      current,
      exerciseId: exercise.id,
      setId: set.id,
      suggested,
      targetOptions,
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

  function openPlateLoadingCalculator(exercise, set) {
    if (session.workoutTimerPaused || !exercise || !set) {
      return;
    }

    const weight = firstPresentValue(set.actualWeight, set.targetWeight);

    setPlateCalculatorClosing(false);
    setPlateCalculatorData({
      equipmentId: getExercisePlateCalculatorEquipmentId(exercise),
      exerciseId: exercise.id,
      exerciseName: exercise.name || "Exercise",
      setId: set.id,
      weight: isBlankValue(weight) ? "" : String(weight),
    });
  }

  function openWarmupPlateLoadingCalculator(exercise, option) {
    const warmupLoadContexts = (option?.sets || [])
      .filter((warmupSet) => Number.isFinite(Number(warmupSet.target?.weight)))
      .map((warmupSet) => ({
        baseE1RM: warmupRecommendations?.baseE1RM || null,
        bodyWeight: sessionBodyWeight,
        exercise: getExerciseForCalculation(exercise),
        reps: warmupSet.reps,
        rir: warmupRecommendations?.targetRir,
        weight: warmupSet.target.weight,
      }));
    const weights = warmupLoadContexts.map((context) => context.weight);

    if (!exercise || weights.length === 0) {
      return;
    }

    const targetSet =
      exercise.sets?.find((set) => idsMatch(activeSet?.setId, set.id)) ||
      exercise.sets?.find((set) => !set.completed) ||
      exercise.sets?.[0];

    setPlateCalculatorClosing(false);
    setPlateCalculatorData({
      equipmentId: getExercisePlateCalculatorEquipmentId(exercise),
      exerciseId: exercise.id,
      exerciseName: exercise.name || "Exercise",
      fixedWeights: weights.map((weight) => String(weight)),
      setId: targetSet?.id || null,
      subtitle: option?.label || "Warmup sets",
      warmupLoadContexts,
    });
  }

  function closePlateLoadingCalculator({ immediate = false } = {}) {
    if (immediate) {
      setPlateCalculatorClosing(false);
      setPlateCalculatorData(null);
      return;
    }

    setPlateCalculatorClosing(true);
  }

  function applyManualLoadingToCurrentSet(weight) {
    if (session.workoutTimerPaused) {
      return;
    }

    const exerciseId = plateCalculatorData?.exerciseId;
    const setId = plateCalculatorData?.setId;

    if (!exerciseId || !setId) {
      return;
    }

    const nextWeight = formatSetupDefault(weight);
    appliedHistoryDefaultsRef.current.delete(`${session.id}:${exerciseId}:${setId}`);

    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((exercise) => {
        if (!idsMatch(exercise.id, exerciseId)) {
          return exercise;
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set) => {
            if (!idsMatch(set.id, setId)) {
              return set;
            }

            const updatedSet = stripHistoryDefaultMetadata({
              ...set,
              actualWeight: nextWeight,
            });

            return updatedSet;
          }),
        };
      }),
    }));

    if (activeSet && idsMatch(activeSet.setId, setId)) {
      setActiveSet({
        ...activeSet,
        actualWeight: nextWeight,
      });
    }

    closePlateLoadingCalculator();
  }

  useEffect(() => {
    if (!plateCalculatorClosing) {
      return undefined;
    }

    const closeTimer = window.setTimeout(() => {
      setPlateCalculatorClosing(false);
      setPlateCalculatorData(null);
    }, 850);

    return () => window.clearTimeout(closeTimer);
  }, [plateCalculatorClosing]);

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

    const defaultKey = `${session.id}:${exercise.id}:${currentSet.id}`;
    const defaults = getHistoryDefaultsForSet(exercise, setIndex) || {
      actualReps: formatSetupDefault(getSetTargetReps(currentSet)),
      actualRir: formatSetupDefault(getSetTargetRir(currentSet)),
      actualWeight: "",
      sourceKey: `target:${defaultKey}`,
    };
    const defaultUpdate = getHistoryDefaultUpdates(
      currentSet,
      defaults,
      getStoredHistoryDefault(currentSet) ||
        appliedHistoryDefaultsRef.current.get(defaultKey)
    );

    if (!defaultUpdate) {
      return;
    }

    appliedHistoryDefaultsRef.current.set(defaultKey, defaultUpdate.metadata);

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
                      ...defaultUpdate.updates,
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
    session.id,
    updateSession,
  ]);

  const [expandedNotes, setExpandedNotes] = useState({});
  const [noteEditSnapshots, setNoteEditSnapshots] = useState({});

  const [replacingExerciseId, setReplacingExerciseId] = useState(null);

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [showSupersetEditor, setShowSupersetEditor] = useState(false);

  function openExerciseNoteEditor(exercise) {
    if (session.workoutTimerPaused) {
      return;
    }

    const noteKey = String(exercise.id);
    const metadata = exerciseMetadata?.[exercise.exerciseId] || {};

    setNoteEditSnapshots((snapshots) =>
      snapshots[noteKey]
        ? snapshots
        : {
            ...snapshots,
            [noteKey]: {
              exerciseId: exercise.exerciseId,
              hadNote: Object.prototype.hasOwnProperty.call(metadata, "note"),
              note: metadata.note || "",
            },
          }
    );
    setExpandedNotes((notes) => ({
      ...notes,
      [exercise.id]: true,
    }));
  }

  function acceptExerciseNoteEdit(exercise) {
    const noteKey = String(exercise.id);

    setNoteEditSnapshots((snapshots) => {
      const next = { ...snapshots };

      delete next[noteKey];

      return next;
    });
    setExpandedNotes((notes) => ({
      ...notes,
      [exercise.id]: false,
    }));
  }

  function cancelExerciseNoteEdit(exercise) {
    const noteKey = String(exercise.id);
    const snapshot = noteEditSnapshots[noteKey];

    if (snapshot) {
      setExerciseMetadata((metadata) => {
        const next = { ...(metadata || {}) };
        const currentExerciseMetadata = {
          ...(next[snapshot.exerciseId] || {}),
        };

        if (snapshot.hadNote) {
          currentExerciseMetadata.note = snapshot.note;
        } else {
          delete currentExerciseMetadata.note;
        }

        if (Object.keys(currentExerciseMetadata).length) {
          next[snapshot.exerciseId] = currentExerciseMetadata;
        } else {
          delete next[snapshot.exerciseId];
        }

        return next;
      });
    }

    setNoteEditSnapshots((snapshots) => {
      const next = { ...snapshots };

      delete next[noteKey];

      return next;
    });
    setExpandedNotes((notes) => ({
      ...notes,
      [exercise.id]: false,
    }));
  }

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
  const restSecondsRef = useRef(90);
  const localRestTimerAdjustmentUntilRef = useRef(0);
  const [restTimerRunDuration, setRestTimerRunDuration] = useState(90);
  const [restTimerProgressTotal, setRestTimerProgressTotal] = useState(90);
  const restTimerProgressTotalRef = useRef(90);

  const [timerRunning, setTimerRunning] = useState(false);

  const [timerFinished, setTimerFinished] = useState(false);

  const [timerPaused, setTimerPaused] = useState(false);

  const [timerStartedAt, setTimerStartedAt] = useState(null);

  const [timerExpiredAt, setTimerExpiredAt] = useState(null);

  const [spotifyState, setSpotifyState] = useState({
    available: false,
    authorized: false,
    connected: false,
  });
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [expandedSessionUtility, setExpandedSessionUtility] = useState(null);

  const [restComplete, setRestComplete] = useState(false);
  const [pauseReminderOpen, setPauseReminderOpen] = useState(false);
  const [pauseWarningFlash, setPauseWarningFlash] = useState(false);
  const pauseReminderHandledKeyRef = useRef(null);
  const [inactivityReminderOpen, setInactivityReminderOpen] = useState(false);
  const [inactivityWarningFlash, setInactivityWarningFlash] = useState(false);
  const inactivityReminderHandledKeyRef = useRef(null);
  useEffect(() => {
    restSecondsRef.current = restSeconds;
  }, [restSeconds]);

  useEffect(() => {
    restTimerProgressTotalRef.current = restTimerProgressTotal;
  }, [restTimerProgressTotal]);
  const [workoutTimerNow, setWorkoutTimerNow] = useState(() => Date.now());
  const workoutElapsedSeconds = getWorkoutDurationSeconds(session, workoutTimerNow);

  useEffect(() => {
    if (!canUseNativeSpotifyPlayback()) {
      return undefined;
    }

    let disposed = false;
    let listenerHandle;

    void getSpotifyPlaybackState()
      .then((state) => {
        if (!disposed) setSpotifyState(state);
      })
      .catch((error) => {
        if (!disposed) {
          setSpotifyState((state) => ({
            ...state,
            available: true,
            error: error?.message || "Unable to read Spotify playback state.",
          }));
        }
      });

    void addSpotifyPlaybackListener((state) => {
      if (!disposed) {
        setSpotifyState(state);
        setSpotifyBusy(false);
      }
    }).then((handle) => {
      listenerHandle = handle;
      if (disposed) void handle.remove();
    });

    return () => {
      disposed = true;
      if (listenerHandle) void listenerHandle.remove();
    };
  }, []);

  async function handleSpotifyPlayback() {
    if (spotifyBusy) return;

    setSpotifyBusy(true);
    try {
      const state = spotifyState.connected
        ? await toggleSpotifyPlayback()
        : await connectSpotifyPlayback();
      setSpotifyState((current) => ({ ...current, ...state }));
    } catch (error) {
      setSpotifyState((state) => ({
        ...state,
        error: error?.message || "Spotify playback control failed.",
      }));
    } finally {
      setSpotifyBusy(false);
    }
  }

  async function handleSpotifySkip(direction) {
    if (spotifyBusy || !spotifyState.connected) return;

    setSpotifyBusy(true);
    try {
      const state =
        direction === "next"
          ? await skipSpotifyNext()
          : await skipSpotifyPrevious();
      setSpotifyState((current) => ({ ...current, ...state }));
    } catch (error) {
      setSpotifyState((state) => ({
        ...state,
        error: error?.message || "Spotify skip control failed.",
      }));
    } finally {
      setSpotifyBusy(false);
    }
  }

  async function requestRestNotificationPermission() {
    if (canUseNativeRestNotifications() || !("Notification" in window)) {
      return "unsupported";
    }

    if (Notification.permission === "default") {
      return Notification.requestPermission();
    }

    return Notification.permission;
  }

  async function showRestCompleteNotification() {
    if (
      canUseNativeRestNotifications() ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return false;
    }

    const options = {
      body: "Ready for next set",
      icon: REST_NOTIFICATION_ICON,
      tag: "workout-rest-complete",
      renotify: true,
    };

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;

        if (registration?.showNotification) {
          await registration.showNotification("Rest complete", options);
          return true;
        }
      }
    } catch (error) {
      console.warn("Service-worker notification failed:", error);
    }

    try {
      new Notification("Rest complete", options);
      return true;
    } catch (error) {
      console.warn("Page notification failed:", error);
      return false;
    }
  }

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
          workoutTimerPausedAtIso: null,
          workoutPauseReminderStartedAtIso: null,
          workoutInactivityReminderStartedAtIso: nowIso,
          workoutTimerResumedAtIso: nowIso,
        };
      }

      const durationSeconds = getWorkoutDurationSeconds(s);

      setWorkoutTimerNow(Date.now());

      return {
        ...s,
        workoutTimerBaseSeconds: durationSeconds,
        workoutTimerPaused: true,
        workoutTimerPausedAtIso: nowIso,
        workoutPauseReminderStartedAtIso: nowIso,
        workoutTimerResumedAtIso: null,
      };
    });
  }

  useEffect(() => {
    if (!session.workoutTimerPaused) {
      pauseReminderHandledKeyRef.current = null;
      setPauseReminderOpen(false);
      setPauseWarningFlash(false);
      void cancelWorkoutPauseNotification();
      return undefined;
    }

    const reminderStartedAtIso =
      session.workoutPauseReminderStartedAtIso ||
      session.workoutTimerPausedAtIso;
    const reminderStartedAtMs = reminderStartedAtIso
      ? new Date(reminderStartedAtIso).getTime()
      : NaN;

    if (!Number.isFinite(reminderStartedAtMs)) {
      return undefined;
    }

    const reminderKey = `${session.id}:${reminderStartedAtIso}`;
    const elapsedSeconds = Math.max(
      0,
      (Date.now() - reminderStartedAtMs) / 1000
    );
    const remainingSeconds = Math.max(
      0,
      WORKOUT_PAUSE_REMINDER_SECONDS - elapsedSeconds
    );

    if (remainingSeconds > 0) {
      void scheduleWorkoutPauseNotification(
        remainingSeconds,
        WORKOUT_PAUSE_REMINDER_SECONDS
      );
    }

    const showReminder = () => {
      if (pauseReminderHandledKeyRef.current === reminderKey) {
        return;
      }

      pauseReminderHandledKeyRef.current = reminderKey;
      setPauseWarningFlash(true);
      setPauseReminderOpen(true);
      void triggerNativeWarningHaptic();
      window.setTimeout(() => setPauseWarningFlash(false), 1200);
    };

    const timeoutId = window.setTimeout(showReminder, remainingSeconds * 1000);

    return () => {
      window.clearTimeout(timeoutId);
      void cancelWorkoutPauseNotification();
    };
  }, [
    session.id,
    session.workoutPauseReminderStartedAtIso,
    session.workoutTimerPaused,
    session.workoutTimerPausedAtIso,
  ]);

  useEffect(() => {
    if (session.workoutTimerPaused) {
      inactivityReminderHandledKeyRef.current = null;
      setInactivityReminderOpen(false);
      setInactivityWarningFlash(false);
      void cancelWorkoutInactivityNotification();
      return undefined;
    }

    const reminderStartedAtIso =
      session.workoutInactivityReminderStartedAtIso ||
      session.workoutStartedAtIso ||
      session.startedAtIso;
    const reminderStartedAtMs = reminderStartedAtIso
      ? new Date(reminderStartedAtIso).getTime()
      : NaN;

    if (!Number.isFinite(reminderStartedAtMs)) {
      return undefined;
    }

    const reminderKey = `${session.id}:${reminderStartedAtIso}`;
    const elapsedSeconds = Math.max(
      0,
      (Date.now() - reminderStartedAtMs) / 1000
    );
    const remainingSeconds = Math.max(
      0,
      WORKOUT_INACTIVITY_REMINDER_SECONDS - elapsedSeconds
    );

    if (remainingSeconds > 0) {
      void scheduleWorkoutInactivityNotification(remainingSeconds);
    }

    const showReminder = () => {
      if (inactivityReminderHandledKeyRef.current === reminderKey) {
        return;
      }

      inactivityReminderHandledKeyRef.current = reminderKey;
      setInactivityWarningFlash(true);
      setInactivityReminderOpen(true);
      void triggerNativeWarningHaptic();
      window.setTimeout(() => setInactivityWarningFlash(false), 1200);
    };

    const timeoutId = window.setTimeout(showReminder, remainingSeconds * 1000);

    return () => {
      window.clearTimeout(timeoutId);
      void cancelWorkoutInactivityNotification();
    };
  }, [
    session.id,
    session.startedAtIso,
    session.workoutInactivityReminderStartedAtIso,
    session.workoutStartedAtIso,
    session.workoutTimerPaused,
  ]);

  useEffect(
    () => () => {
      if (targetPressTimerRef.current) {
        clearTimeout(targetPressTimerRef.current);
      }
    },
    []
  );

  useEffect(
    () => () => {
      void endNativeRestTimerLiveActivity();
    },
    []
  );

  useEffect(() => {
    async function reconcileNativeRestTimer() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const nativeState = await getNativeRestTimerLiveActivityState();

      if (!nativeState?.active) {
        return;
      }

      if (Date.now() < localRestTimerAdjustmentUntilRef.current) {
        return;
      }

      const seconds = Math.max(0, Number(nativeState.seconds) || 0);

      if (seconds > restTimerProgressTotalRef.current) {
        restTimerProgressTotalRef.current = seconds;
        setRestTimerProgressTotal(seconds);
      }

      if (!nativeState.paused && seconds <= 0) {
        const endsAtMs = Number(nativeState.endsAtMs) || Date.now();
        const completionKey = String(endsAtMs);

        setRestSeconds(Math.max(0, Math.floor((Date.now() - endsAtMs) / 1000)));
        setTimerExpiredAt(endsAtMs);
        setTimerFinished(true);
        setTimerPaused(false);
        setTimerRunning(false);
        setTimerStartedAt(null);
        void endNativeRestTimerLiveActivity();

        if (nativeRestCompletionHandledRef.current !== completionKey) {
          nativeRestCompletionHandledRef.current = completionKey;
          setRestComplete(true);
          window.setTimeout(() => setRestComplete(false), 1200);
        }
        return;
      }

      setRestSeconds(seconds);
      setRestTimerRunDuration(seconds);
      setTimerExpiredAt(null);
      setTimerFinished(false);
      setTimerPaused(Boolean(nativeState.paused));
      setTimerRunning(!nativeState.paused && seconds > 0);
      if (nativeState.paused) {
        setTimerStartedAt(null);
        return;
      }

      setTimerStartedAt(Date.now());
    }

    void reconcileNativeRestTimer();
    document.addEventListener("visibilitychange", reconcileNativeRestTimer);
    const reconciliationInterval = window.setInterval(
      reconcileNativeRestTimer,
      1000
    );

    return () => {
      document.removeEventListener("visibilitychange", reconcileNativeRestTimer);
      window.clearInterval(reconciliationInterval);
    };
  }, [restMinutes, restRemainder]);

  useEffect(() => {
    if (!timerRunning || !timerStartedAt) return;

    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);

      const remaining = Math.max(restTimerRunDuration - elapsed, 0);

      setRestSeconds(remaining);
    }, 1000);

    return () => clearInterval(id);
  }, [timerRunning, timerStartedAt, restTimerRunDuration]);

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
        const configuredSeconds = restMinutes * 60 + restRemainder;
        restSecondsRef.current = configuredSeconds;
        setRestSeconds(configuredSeconds);
        setRestTimerRunDuration(configuredSeconds);
        restTimerProgressTotalRef.current = configuredSeconds;
        setRestTimerProgressTotal(configuredSeconds);
      }, 0);
    }
  }, [restMinutes, restRemainder, timerRunning, timerPaused, timerFinished]);

  useEffect(() => {
    if (restSeconds === 0 && timerRunning) {
      const notificationKey = `${timerStartedAt || ""}:${restTimerRunDuration}`;

      if (!canUseNativeRestNotifications()) {
        navigator.vibrate?.([200, 100, 200]);

        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();

          osc.connect(ctx.destination);
          osc.frequency.value = 1000;
          osc.start();

          setTimeout(() => {
            osc.stop();
            ctx.close();
          }, 200);
        } catch {
          // Audio feedback is optional.
        }
      }

      if (restNotificationSentKeyRef.current !== notificationKey) {
        restNotificationSentKeyRef.current = notificationKey;
        void showRestCompleteNotification();
      }

      setTimeout(() => {
        void endNativeRestTimerLiveActivity();
        setRestComplete(true);

        setTimeout(() => setRestComplete(false), 1200);

        setTimerExpiredAt(Date.now());
        setTimerFinished(true);
        setTimerRunning(false);
        setTimerPaused(false);
      }, 0);
    }
  }, [restSeconds, timerRunning, timerStartedAt, restTimerRunDuration]);

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
    if (canUseNativeWorkoutIdleTimer()) {
      setNativeWorkoutAutoLockEnabled(!keepScreenAwake);

      return () => {
        setNativeWorkoutAutoLockEnabled(true);
      };
    }

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
    if (session.workoutTimerPaused) {
      return;
    }

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
      setActiveWorkoutFocus({
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
      setActiveWorkoutFocus({
        exerciseId: nextExercise.id,
        setId: nextExercise.sets[0].id,
      });
    } else {
      setActiveWorkoutFocus(null);
    }
  }

  function addSet(exerciseId, lastSet) {
    if (session.workoutTimerPaused) {
      return;
    }

    const prescribedReps = getSetPrescribedReps(lastSet);
    const minimumReps = getSetMinimumReps(lastSet);
    const prescribedRir = getSetPrescribedRir(lastSet);
    const prescribedRestSeconds = getSetPrescribedRestSeconds(lastSet);
    const newSet = {
      id: Date.now(),

      targetWeight: lastSet?.targetWeight || lastSet?.actualWeight || "",

      targetReps: getSetTargetReps(lastSet, prescribedReps),

      ...(minimumReps
        ? {
            minimumReps,
            prescribedMinimumReps: minimumReps,
            targetMinimumReps: minimumReps,
          }
        : {}),

      targetRir: getSetTargetRir(lastSet, prescribedRir),

      prescribedReps,

      prescribedRestSeconds: prescribedRestSeconds || undefined,

      prescribedRir,

      reps: prescribedReps,

      restSeconds: prescribedRestSeconds || undefined,

      rir: prescribedRir,

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
            getSetPrescribedReps(completedSetContext.set),
            getSetPrescribedReps(nextSet),
            planTargets.reps
          )
        : firstPresentValue(
            getSetPrescribedReps(nextSet),
            planTargets.reps
          );

    return parseTimerReps(nextTargetReps);
  }

  function getNextSetTimerRestSeconds(nextActiveSet) {
    if (!nextActiveSet) {
      return null;
    }

    const nextExercise = session.exercises.find(
      (exercise) => exercise.id === nextActiveSet.exerciseId
    );
    const nextSet = nextExercise?.sets.find(
      (set) => set.id === nextActiveSet.setId
    );

    return getSetPrescribedRestSeconds(nextSet);
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

    const prescribedRestSeconds = getNextSetTimerRestSeconds(nextActiveSet);
    const reps = getNextSetTimerReps(nextActiveSet, completedSetContext);

    if (prescribedRestSeconds == null && reps == null) {
      return;
    }

    const duration = prescribedRestSeconds || getRestDurationForReps(reps);

    setRestMinutes(Math.floor(duration / 60));
    setRestRemainder(duration % 60);
    setRestTimerRunDuration(duration);
    restTimerProgressTotalRef.current = duration;
    setRestTimerProgressTotal(duration);
    restSecondsRef.current = duration;
    setRestSeconds(duration);
    setTimerExpiredAt(null);
    setTimerFinished(false);
    setTimerPaused(false);
    setTimerStartedAt(startedAt);
    restNotificationSentKeyRef.current = null;
    nativeRestCompletionHandledRef.current = null;
    void requestRestNotificationPermission();
    void scheduleNativeRestTimerNotification(duration);
    void startNativeRestTimerLiveActivity(duration, {
      exerciseName: nextExercise?.name,
      setNumber: nextSetIndex >= 0 ? nextSetIndex + 1 : undefined,
      totalSets: nextExercise?.sets?.length,
      workoutName: session.templateName,
      startedAtMs: startedAt,
    });
    setTimerRunning(true);
  }

  function resetRestTimer() {
    const resetSeconds = restMinutes * 60 + restRemainder;
    setTimerPaused(false);
    setTimerRunning(false);
    setTimerStartedAt(null);
    setTimerExpiredAt(null);
    setTimerFinished(false);
    restNotificationSentKeyRef.current = null;
    nativeRestCompletionHandledRef.current = null;
    void cancelNativeRestTimerNotification();
    void endNativeRestTimerLiveActivity();
    setRestTimerRunDuration(resetSeconds);
    restTimerProgressTotalRef.current = resetSeconds;
    setRestTimerProgressTotal(resetSeconds);
    restSecondsRef.current = resetSeconds;
    setRestSeconds(resetSeconds);
  }

  function getActiveRestTimerContext() {
    const exercise = session.exercises.find(
      (candidate) => candidate.id === activeSet?.exerciseId
    );
    const setIndex = exercise?.sets?.findIndex(
      (set) => set.id === activeSet?.setId
    );

    return {
      exerciseName: exercise?.name,
      setNumber: setIndex != null && setIndex >= 0 ? setIndex + 1 : undefined,
      totalSets: exercise?.sets?.length,
      workoutName: session.templateName,
    };
  }

  function setConfiguredRestDuration(seconds) {
    const normalizedSeconds = Math.max(0, Math.min(10 * 60, seconds));
    setRestMinutes(Math.floor(normalizedSeconds / 60));
    setRestRemainder(normalizedSeconds % 60);
    return normalizedSeconds;
  }

  function toggleRestTimer() {
    if (timerFinished) {
      return;
    }

    if (timerRunning) {
      setTimerPaused(true);
      setTimerRunning(false);
      void cancelNativeRestTimerNotification();
      void pauseNativeRestTimerLiveActivity(restSeconds);
      return;
    }

    const configuredSeconds = restMinutes * 60 + restRemainder;
    const liveActivitySeconds = timerPaused ? restSeconds : configuredSeconds;

    if (liveActivitySeconds <= 0) {
      return;
    }

    setTimerPaused(false);
    setTimerExpiredAt(null);
    restNotificationSentKeyRef.current = null;
    void requestRestNotificationPermission();
    setRestSeconds(liveActivitySeconds);
    setRestTimerRunDuration(liveActivitySeconds);
    if (!timerPaused) {
      restTimerProgressTotalRef.current = liveActivitySeconds;
      setRestTimerProgressTotal(liveActivitySeconds);
    }
    setTimerStartedAt(Date.now());
    setTimerFinished(false);
    void scheduleNativeRestTimerNotification(liveActivitySeconds);

    if (timerPaused) {
      void resumeNativeRestTimerLiveActivity(liveActivitySeconds);
    } else {
      void startNativeRestTimerLiveActivity(
        liveActivitySeconds,
        getActiveRestTimerContext()
      );
    }

    setTimerRunning(true);
  }

  function adjustRestTimer(deltaSeconds) {
    localRestTimerAdjustmentUntilRef.current = Date.now() + 1500;

    if (timerFinished) {
      const signedRemaining = -restSecondsRef.current + deltaSeconds;

      if (signedRemaining > 0) {
        const adjustedSeconds = Math.max(0, Math.min(10 * 60, signedRemaining));
        restSecondsRef.current = adjustedSeconds;
        setRestSeconds(adjustedSeconds);
        setRestTimerRunDuration(adjustedSeconds);
        restTimerProgressTotalRef.current = adjustedSeconds;
        setRestTimerProgressTotal(adjustedSeconds);
        setTimerExpiredAt(null);
        setTimerFinished(false);
        setTimerPaused(false);
        setTimerStartedAt(Date.now());
        restNotificationSentKeyRef.current = null;
        void scheduleNativeRestTimerNotification(adjustedSeconds);
        void startNativeRestTimerLiveActivity(
          adjustedSeconds,
          getActiveRestTimerContext()
        );
        setTimerRunning(true);
      } else {
        const overdueSeconds = Math.abs(signedRemaining);
        restSecondsRef.current = overdueSeconds;
        setRestSeconds(overdueSeconds);
        setTimerExpiredAt(Date.now() - overdueSeconds * 1000);
      }
      return;
    }

    if (timerRunning || timerPaused) {
      const adjustedSeconds = Math.max(
        0,
        Math.min(10 * 60, restSecondsRef.current + deltaSeconds)
      );
      restSecondsRef.current = adjustedSeconds;
      setRestSeconds(adjustedSeconds);
      setRestTimerRunDuration(adjustedSeconds);
      const adjustedProgressTotal = Math.max(
        adjustedSeconds,
        restTimerProgressTotalRef.current + deltaSeconds
      );
      restTimerProgressTotalRef.current = adjustedProgressTotal;
      setRestTimerProgressTotal(adjustedProgressTotal);

      if (adjustedSeconds <= 0) {
        setTimerRunning(false);
        setTimerPaused(false);
        setTimerStartedAt(null);
        setTimerExpiredAt(Date.now());
        setTimerFinished(true);
        void cancelNativeRestTimerNotification();
        void endNativeRestTimerLiveActivity();
        return;
      }

      if (timerPaused) {
        setTimerStartedAt(null);
        void pauseNativeRestTimerLiveActivity(adjustedSeconds);
      } else {
        setTimerStartedAt(Date.now());
        void scheduleNativeRestTimerNotification(adjustedSeconds);
        void resumeNativeRestTimerLiveActivity(adjustedSeconds);
      }
      return;
    }

    const adjustedSeconds = setConfiguredRestDuration(
      restSecondsRef.current + deltaSeconds
    );
    setRestTimerRunDuration(adjustedSeconds);
    restTimerProgressTotalRef.current = adjustedSeconds;
    setRestTimerProgressTotal(adjustedSeconds);
    restSecondsRef.current = adjustedSeconds;
    setRestSeconds(adjustedSeconds);
  }

  function getNextSetTargetsAfterCompletion(exercise, currentSet, nextSet) {
    const calculationExercise = getExerciseForCalculation(exercise);
    const actualReps = parseSessionNumber(currentSet.actualReps);
    const prescribedReps = parseSessionNumber(
      getSetPrescribedReps(nextSet, getSetPrescribedReps(currentSet))
    );
    const explicitMinimumReps = parseSessionNumber(
      getSetMinimumReps(nextSet, getSetMinimumReps(currentSet))
    );
    const minimumAcceptableReps =
      prescribedReps == null
        ? null
        : Math.max(
            1,
            Math.min(
              prescribedReps,
              explicitMinimumReps ??
                prescribedReps - SAME_WEIGHT_TARGET_REP_WINDOW
            )
          );
    const targetRir = getSetPrescribedRir(nextSet, getSetPrescribedRir(currentSet));
    const actualWeight = firstPresentValue(currentSet.actualWeight);
    const actualRir = firstPresentValue(currentSet.actualRir);
    const currentTargetWeight = firstPresentValue(
      currentSet.actualWeight,
      currentSet.targetWeight
    );
    const nextSetIndex = exercise.sets.findIndex((set) => set.id === nextSet.id);
    const latestMatchingSet =
      getLatestMatchingHistoryPerformance(exercise)?.exercise?.sets?.[nextSetIndex];
    const latestMatchingSetE1RM = getHistorySetE1RM(exercise, latestMatchingSet);
    const actualE1RM = calculateSessionE1RM(
      exercise,
      actualWeight,
      actualReps,
      actualRir
    );
    const actualRirNumber = parseSessionNumber(actualRir);
    const targetRirNumber = parseSessionNumber(targetRir);
    const effortExceededPrescription =
      actualRirNumber != null &&
      targetRirNumber != null &&
      actualRirNumber < targetRirNumber;
    const rangeMissed =
      actualReps != null &&
      minimumAcceptableReps != null &&
      actualReps < minimumAcceptableReps;
    const rangeMetBelowUpperTarget =
      actualReps != null &&
      minimumAcceptableReps != null &&
      prescribedReps != null &&
      actualReps >= minimumAcceptableReps &&
      actualReps < prescribedReps;

    if (rangeMissed || effortExceededPrescription) {
      const rawTargetWeight =
        actualE1RM == null || prescribedReps == null
          ? null
          : estimateWeightForE1RM(
              actualE1RM,
              prescribedReps,
              targetRirNumber || 0,
              {
                bodyWeight: sessionBodyWeight,
                exercise: calculationExercise,
              }
            );
      const reducedWeight =
        rawTargetWeight == null
          ? ""
          : roundWeightToIncrement(
              Math.max(0, rawTargetWeight),
              getExerciseWeightIncrement(calculationExercise)
            );

      return {
        targetMinimumReps: getSetMinimumReps(nextSet, explicitMinimumReps),
        targetReps: getSetTargetReps(nextSet, String(prescribedReps ?? "")),
        targetRir: targetRir || getSetTargetRir(nextSet),
        targetWeight:
          reducedWeight != null && reducedWeight !== ""
            ? String(reducedWeight)
            : nextSet.targetWeight,
      };
    }

    if (rangeMetBelowUpperTarget) {
      return {
        targetMinimumReps: getSetMinimumReps(nextSet, explicitMinimumReps),
        targetWeight:
          currentSet.actualWeight || currentSet.targetWeight || nextSet.targetWeight,
        targetReps: getSetTargetReps(nextSet, getSetTargetReps(currentSet)),
        targetRir: getSetPrescribedRir(nextSet, getSetPrescribedRir(currentSet)),
      };
    }

    if (getGoalMode() === "progress" && prescribedReps != null) {
      const todayBestE1RM = getCurrentWorkoutBestE1RMThroughSet(
        exercise,
        nextSetIndex,
        {
          setId: currentSet.id,
          value: actualE1RM,
        }
      );
      const fatigueRatio = getNormalizedLatestFatigueRatio(exercise, nextSetIndex);
      const adjacentFatigueRatio =
        getLatestAdjacentFatigueRatio(exercise, nextSetIndex);
      const progressTargetE1RM =
        latestMatchingSetE1RM == null
          ? null
          : latestMatchingSetE1RM * (1 + MAIN_TARGET_PROGRESSION_PERCENT);
      const fatigueTargetE1RM =
        actualE1RM != null && adjacentFatigueRatio != null
          ? actualE1RM * adjacentFatigueRatio
          : todayBestE1RM == null
            ? null
            : todayBestE1RM * fatigueRatio;
      const hasClearPriorFatigueDrop =
        (adjacentFatigueRatio ?? fatigueRatio) < CLEAR_FATIGUE_DROP_RATIO;
      const baselineE1RM =
        progressTargetE1RM != null && fatigueTargetE1RM != null
          ? hasClearPriorFatigueDrop
            ? Math.max(latestMatchingSetE1RM || 0, fatigueTargetE1RM)
            : Math.max(progressTargetE1RM, fatigueTargetE1RM)
          : progressTargetE1RM ?? fatigueTargetE1RM ?? actualE1RM;
      const rankedProgressionCandidates = getRankedProgressionCandidates({
        baselineE1RM,
        currentWeight: currentTargetWeight,
        exercise,
        fatigueCeilingE1RM: hasClearPriorFatigueDrop ? actualE1RM : null,
        minimumReps: explicitMinimumReps,
        progressionFloorE1RM: hasClearPriorFatigueDrop
          ? latestMatchingSetE1RM
          : null,
        prescribedReps,
        targetRir,
      }) || [];
      const nextProgressionCandidate = rankedProgressionCandidates[0] || null;

      if (nextProgressionCandidate) {
        return {
          targetMinimumReps: getSetMinimumReps(nextSet, explicitMinimumReps),
          targetReps: String(nextProgressionCandidate.reps),
          targetRir: targetRir || getSetTargetRir(nextSet),
          targetWeight: String(nextProgressionCandidate.weight),
        };
      }

      const progressedTarget =
        baselineE1RM == null
          ? null
          : getRecommendationFromE1RM(
              calculationExercise,
              baselineE1RM,
              prescribedReps,
              targetRir,
              {
                allowedRepWindow: 2,
                progressionPercent: 0,
                preferredRepWindow: 2,
              }
            );

      if (progressedTarget?.weight != null) {
        return {
          targetMinimumReps: getSetMinimumReps(nextSet, explicitMinimumReps),
          targetReps: String(progressedTarget.reps ?? prescribedReps),
          targetRir: targetRir || getSetTargetRir(nextSet),
          targetWeight: String(progressedTarget.weight),
        };
      }
    }

    return {
      targetMinimumReps: getSetMinimumReps(nextSet, explicitMinimumReps),
      targetWeight:
        currentSet.actualWeight || currentSet.targetWeight || nextSet.targetWeight,
      targetReps: getSetTargetReps(nextSet, getSetTargetReps(currentSet)),
      targetRir: getSetPrescribedRir(nextSet, getSetPrescribedRir(currentSet)),
    };
  }

  function markSetComplete(exerciseId, setId, completedAt = null) {
    if (session.workoutTimerPaused) {
      return;
    }

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
    const inactivityResetAtIso = new Date(completedAt || Date.now()).toISOString();

    updateSession((s) => ({
      ...s,
      ...(!undo
        ? { workoutInactivityReminderStartedAtIso: inactivityResetAtIso }
        : {}),
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
      setLastCompletedExerciseId((currentExerciseId) =>
        currentExerciseId === exerciseId ? null : currentExerciseId
      );
      setActiveWorkoutFocus({ exerciseId, setId });
      return;
    }

    inactivityReminderHandledKeyRef.current = null;
    setInactivityReminderOpen(false);
    setInactivityWarningFlash(false);
    void cancelWorkoutInactivityNotification();
    setLastCompletedExerciseId(exerciseId);
    void triggerNativeSetCompletionHaptic();

    if (timerFinished) {
      resetRestTimer();
    }

    const nextActiveSet = getNextActiveSetAfter(exerciseId, setId, {
      supersetOrdersOverride,
    });

    if (!nextActiveSet) {
      resetRestTimer();
      setActiveWorkoutFocus(null);
      return;
    }

    setRestTimerForNextSet(
      nextActiveSet,
      {
        exerciseId,
        set: currentSet,
        setIndex: currentIndex,
      },
      completedAt
    );

    setActiveWorkoutFocus(nextActiveSet);
  }
  function deleteExercise(exerciseId) {
    const deletingActiveExercise = activeExerciseId === exerciseId;
    const nextExercise = deletingActiveExercise
      ? session.exercises.find((exercise) => exercise.id !== exerciseId)
      : null;
    const nextSet = nextExercise?.sets?.find((set) => !set.completed) ||
      nextExercise?.sets?.[0];

    updateSession((s) => ({
      ...s,

      templateChanged: true,

      exercises: s.exercises.filter((ex) => ex.id !== exerciseId),
    }));
    setLastCompletedExerciseId((currentExerciseId) =>
      currentExerciseId === exerciseId ? null : currentExerciseId
    );

    if (deletingActiveExercise) {
      setActiveWorkoutFocus(
        nextExercise && nextSet
          ? {
              exerciseId: nextExercise.id,
              setId: nextSet.id,
            }
          : null,
        nextExercise?.id || null
      );
    }
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
    if (session.workoutTimerPaused) {
      return;
    }

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

      exercises: s.exercises.map((ex) => {
        if (ex.id !== oldExerciseId) {
          return ex;
        }

        const existingSets = ex.sets || [];
        const firstSet = existingSets[0] || {};
        const defaultReps = formatSetupDefault(
          getSetPrescribedReps(firstSet)
        );
        const defaultRir = formatSetupDefault(
          getSetPrescribedRir(firstSet)
        );
        const requestedSetCount = Number(replacementValues.sets) || 1;
        const preservingExistingSetCount =
          requestedSetCount === existingSets.length;
        const shouldPreserveSetReps =
          String(replacementValues.reps ?? "") === String(defaultReps ?? "");
        const shouldPreserveSetRir =
          String(replacementValues.rir ?? "") === String(defaultRir ?? "");
        const sourceSets = preservingExistingSetCount
          ? existingSets
          : Array.from({ length: requestedSetCount }, () => ({}));

        const nextRepsForSet = (set) =>
          shouldPreserveSetReps
            ? firstPresentValue(getSetPrescribedReps(set), replacementValues.reps)
            : replacementValues.reps;
        const nextRirForSet = (set) =>
          shouldPreserveSetRir
            ? firstPresentValue(getSetPrescribedRir(set), replacementValues.rir)
            : replacementValues.rir;

        return {
          ...ex,

          name: newExercise.name,

          equipment: newExercise.equipment,

          muscles: newExercise.muscles,

          imageAlt: newExercise.imageAlt || "",

          imageUrl: newExercise.imageUrl || "",

          originalExerciseId: newExercise.id,

          exerciseId: newExercise.id,

          sets: sourceSets.map((set, i) => {
            const prescribedReps = nextRepsForSet(set);
            const prescribedRir = nextRirForSet(set);

            return {
              id: Date.now() + i,

              targetWeight: replacementValues.weight,

              targetReps: prescribedReps,

              targetRir: prescribedRir,

              prescribedReps,

              prescribedRir,

              reps: prescribedReps,

              rir: prescribedRir,

              actualWeight: "",
              actualReps: "",
              actualRir: "",
            };
          }),
        };
      }),
    }));

    if (activeSet?.exerciseId === oldExerciseId) {
      setActiveWorkoutFocus(activeSet, oldExerciseId);
    }

    setReplacingExerciseId(null);

    setSearch("");

    setExpandedNotes((notes) => ({
      ...notes,

      [oldExerciseId]: !!exerciseMetadata?.[newExercise.id]?.note?.trim(),
    }));
  }

  function getPlanCompletionUpdate(completedWorkout) {
    if (
      !setPlans ||
      !completedWorkout.planId ||
      !completedWorkout.planWorkoutId
    ) {
      return {
        completedPlan: null,
        plans,
      };
    }

    let completedPlan = null;
    const nextPlans = plans.map((plan) => {
      if (String(plan.id) !== String(completedWorkout.planId)) {
        return plan;
      }

      const weekNumber = completedWorkout.planWeek || plan.currentWeek || 1;
      const existingCompletions = plan.completions || [];
      const alreadyCompleted = existingCompletions.some(
        (completion) =>
          Number(completion.weekNumber) === Number(weekNumber) &&
          String(completion.planWorkoutId) ===
            String(completedWorkout.planWorkoutId)
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
        plan.workouts?.length > 0 && completedThisWeek >= plan.workouts.length;
      const finalPlanWeek =
        (Number(plan.durationWeeks) || 1) + (plan.config?.deload ? 1 : 0);
      const finalWeek = weekNumber >= finalPlanWeek;
      const planCompleted = weekComplete && finalWeek;
      const nextPlan = {
        ...plan,
        completions,
        currentWeek:
          weekComplete && !finalWeek
            ? weekNumber + 1
            : plan.currentWeek || weekNumber,
        status: planCompleted ? "completed" : plan.status,
      };

      if (planCompleted && plan.status !== "completed") {
        completedPlan = nextPlan;
      }

      return nextPlan;
    });

    return {
      completedPlan,
      plans: nextPlans,
    };
  }

  function finishCompletedWorkout(completedWorkout) {
    onWorkoutCompleted?.(completedWorkout);

    setSessions(sessions.filter((s) => s.id !== session.id));

    setSelectedSessionId(null);

    setSelectedTemplateId(null);
  }

  function applyPlanPrescriptionUpdates(exercise) {
    if (!session.planId || !Array.isArray(exercise.weeklyPrescriptions)) {
      return exercise;
    }

    const originalTemplate = templates.find((item) => item.id === session.templateId);
    const originalExercise = originalTemplate?.exercises?.find(
      (item) => item.id === exercise.id
    );
    const weekPrescription = originalExercise?.weeklyPrescriptions?.find(
      (week) => Number(week.weekNumber) === Number(session.planWeek)
    );
    const expectedSetCount = Math.max(
      1,
      Number(weekPrescription?.sets) || originalExercise?.sets?.length || 0
    );
    const setCountChanged =
      originalExercise &&
      expectedSetCount !== (exercise.sets?.length || 0);

    if (!setCountChanged) {
      return exercise;
    }

    const linkedPlan = getLinkedPlan();
    const currentWeek = Number(session.planWeek || linkedPlan?.currentWeek || 1);

    return {
      ...exercise,
      weeklyPrescriptions: updateWeeklyPrescriptions(
        exercise.weeklyPrescriptions,
        currentWeek,
        {
          sets: String(exercise.sets?.length || 1),
        }
      ),
    };
  }

  function createNextTemplateExercisesFromSession() {
    return session.exercises.map((exercise) => {
      const exerciseWithUpdatedPlanPrescription =
        applyPlanPrescriptionUpdates(exercise);

      return {
        ...exerciseWithUpdatedPlanPrescription,
        sets: exercise.sets.map((set) => ({
          id: Date.now() + Math.random(),
          ...(getSetMinimumReps(set)
            ? { minimumReps: getSetMinimumReps(set) }
            : {}),
          reps: getSetPrescribedReps(set),
          restSeconds: getSetPrescribedRestSeconds(set) || undefined,
          rir: getSetPrescribedRir(set),
        })),
      };
    });
  }

  function addExercise(exercise, weight, reps, numSets, rir) {
    const sets = Array.from({ length: Number(numSets) }, () => ({
      id: Date.now() + Math.random(),
      targetWeight: weight,
      targetReps: reps,
      targetRir: rir,
      prescribedReps: reps,
      prescribedRir: rir,
      reps,
      rir,
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

  function stripSessionOnlySetValuesForHistory(workout) {
    const { prescriptionEditFieldsByExercise, ...historyWorkout } = workout;

    return {
      ...historyWorkout,
      exercises: (historyWorkout.exercises || [])
        .map((exercise) => ({
          ...exercise,
          sets: (exercise.sets || [])
            .filter((set) => set.completed)
            .map(
              ({
                reps,
                rir,
                targetReps,
                targetRir,
                targetWeight,
                historyDefaultActualReps,
                historyDefaultActualRir,
                historyDefaultActualWeight,
                historyDefaultSourceKey,
                ...set
              }) => set
            ),
        }))
        .filter((exercise) => exercise.sets.length > 0),
    };
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
    session.exercises.find((exercise) => exercise.id === activeExerciseId) ||
    session.exercises.find(
      (exercise) => exercise.id === activeSet?.exerciseId
    ) ||
    session.exercises.find((exercise) =>
      exercise.sets.some((set) => !set.completed)
    ) ||
    (allSetsCompleted
      ? session.exercises.find(
          (exercise) => exercise.id === lastCompletedExerciseId
        )
      : null) ||
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

  useEffect(() => {
    const strip = exerciseStripRef.current;
    const currentExerciseId = currentExercise?.id || null;
    const activeThumbnail = currentExerciseId
      ? exerciseThumbnailRefs.current[currentExerciseId]
      : null;

    if (!strip || !activeThumbnail) {
      return;
    }

    const stripRect = strip.getBoundingClientRect();
    const thumbnailRect = activeThumbnail.getBoundingClientRect();
    const visibleLeft = stripRect.left;
    const visibleRight = stripRect.right;

    if (
      thumbnailRect.left >= visibleLeft &&
      thumbnailRect.right <= visibleRight
    ) {
      return;
    }

    const plusButton = addExerciseButtonRef.current;
    const styles = window.getComputedStyle(strip);
    const leftPadding = Number.parseFloat(styles.paddingLeft) || 0;
    const activeLeftInScroll =
      thumbnailRect.left - stripRect.left + strip.scrollLeft;
    const targetActiveLeft = activeLeftInScroll - leftPadding;
    let targetScrollLeft = targetActiveLeft;

    if (plusButton) {
      const plusRect = plusButton.getBoundingClientRect();
      const plusRightInScroll = plusRect.right - stripRect.left + strip.scrollLeft;
      const targetPlusRight = plusRightInScroll - strip.clientWidth;

      targetScrollLeft = Math.min(targetActiveLeft, targetPlusRight);
    }

    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const nextScrollLeft = Math.min(
      Math.max(0, targetScrollLeft),
      maxScrollLeft
    );

    strip.scrollTo({
      behavior: "smooth",
      left: nextScrollLeft,
    });
  }, [currentExercise?.id]);

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

    setActiveWorkoutFocus({
      exerciseId: exercise.id,
      setId: nextSet.id,
    });
  }

  function renderLatestSetHistory(exercise) {
    const latestPerformance = getLatestWorkoutPerformance(exercise);

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
              const weight = firstPresentValue(set.actualWeight);
              const reps = firstPresentValue(set.actualReps);
              const rir = firstPresentValue(set.actualRir);
              const e1rm = isBlankValue(reps)
                ? null
                : calculateSessionE1RM(exercise, weight, reps, rir);

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
                    {formatSessionE1RMDisplay(e1rm)}
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

    const originalById = new Map(
      (original.exercises || []).map((exercise) => [String(exercise.id), exercise])
    );
    const getExpectedSetCount = (exercise) => {
      if (!session.planId || !Array.isArray(exercise?.weeklyPrescriptions)) {
        return exercise?.sets?.length || 0;
      }

      const weekPrescription = exercise.weeklyPrescriptions.find(
        (week) => Number(week.weekNumber) === Number(session.planWeek)
      );

      return Math.max(
        1,
        Number(weekPrescription?.sets) || exercise?.sets?.length || 0
      );
    };
    const getStructuralSignature = (exercises, { usePlanExpectedSets = false } = {}) =>
      exercises.map((ex) => ({
        equipment: formatList(ex.equipment),
        exerciseId: ex.exerciseId || null,
        muscles: formatList(ex.muscles),
        name: ex.name,
        setCount: usePlanExpectedSets && originalById.has(String(ex.id))
          ? getExpectedSetCount(originalById.get(String(ex.id)))
          : ex.sets?.length || 0,
        supersetGroup: ex.supersetGroup || null,
      }));

    return (
      JSON.stringify(
        getStructuralSignature(original.exercises, {
          usePlanExpectedSets: true,
        })
      ) !== JSON.stringify(getStructuralSignature(session.exercises))
    );
  }

  function getWorkoutUpdateOptions() {
    const original = templates.find((t) => t.id === session.templateId);

    if (!original) {
      return [];
    }

    const originalById = new Map(
      (original.exercises || []).map((exercise) => [String(exercise.id), exercise])
    );
    const sessionById = new Map(
      (session.exercises || []).map((exercise) => [String(exercise.id), exercise])
    );
    const changes = [];
    const formatValueChange = (before, after) =>
      `${before || "—"} -> ${after || "—"}`;
    const formatExercisePrescriptionRange = (exercise, getter) => {
      const values = [...new Set((exercise?.sets || []).map((set) => getter(set)).filter(Boolean))];

      return values.length > 1 ? values.join("-") : values[0] || "—";
    };
    const getExpectedSetCount = (exercise) => {
      if (!session.planId || !Array.isArray(exercise?.weeklyPrescriptions)) {
        return exercise?.sets?.length || 0;
      }

      const weekPrescription = exercise.weeklyPrescriptions.find(
        (week) => Number(week.weekNumber) === Number(session.planWeek)
      );

      return Math.max(
        1,
        Number(weekPrescription?.sets) || exercise?.sets?.length || 0
      );
    };
    const originalOrder = (original.exercises || []).map((exercise) => String(exercise.id));
    const sessionOrder = (session.exercises || []).map((exercise) => String(exercise.id));
    const getSessionPrescriptionEditFields = (exerciseId) =>
      new Set(session.prescriptionEditFieldsByExercise?.[exerciseId] || []);

    if (
      originalOrder.length === sessionOrder.length &&
      originalOrder.some((id, index) => id !== sessionOrder[index])
    ) {
      changes.push({
        id: "order",
        label: "Exercise order changed",
        type: "order",
      });
    }

    (session.exercises || []).forEach((exercise) => {
      const originalExercise = originalById.get(String(exercise.id));

      if (!originalExercise) {
        changes.push({
          exerciseId: exercise.id,
          id: `exercise-add:${exercise.id}`,
          label: `Add exercise: ${exercise.name || "Exercise"}`,
          type: "exercise-add",
        });
        return;
      }

      const exerciseChanged =
        String(originalExercise.exerciseId || "") !== String(exercise.exerciseId || "") ||
        String(originalExercise.name || "") !== String(exercise.name || "") ||
        formatList(originalExercise.equipment) !== formatList(exercise.equipment) ||
        formatList(originalExercise.muscles) !== formatList(exercise.muscles);

      if (exerciseChanged) {
        changes.push({
          exerciseId: exercise.id,
          id: `exercise-replace:${exercise.id}`,
          label: `${originalExercise.name || "Exercise"} -> ${exercise.name || "Exercise"}`,
          type: "exercise-replace",
        });
      }

      const expectedSetCount = getExpectedSetCount(originalExercise);

      if (expectedSetCount !== (exercise.sets?.length || 0)) {
        changes.push({
          exerciseId: exercise.id,
          id: `sets:${exercise.id}`,
          label: `${exercise.name || "Exercise"}: sets ${formatValueChange(
            expectedSetCount,
            exercise.sets?.length || 0
          )}`,
          type: "sets",
        });
      }

      const originalReps = formatExercisePrescriptionRange(
        originalExercise,
        getSetPrescribedReps
      );
      const sessionReps = formatExercisePrescriptionRange(exercise, getSetPrescribedReps);
      const prescriptionEditFields = getSessionPrescriptionEditFields(exercise.id);

      if (prescriptionEditFields.has("reps") && originalReps !== sessionReps) {
        changes.push({
          exerciseId: exercise.id,
          id: `reps:${exercise.id}`,
          label: `${exercise.name || "Exercise"}: reps ${formatValueChange(
            originalReps,
            sessionReps
          )}`,
          type: "reps",
        });
      }

      const originalRir = formatExercisePrescriptionRange(
        originalExercise,
        getSetPrescribedRir
      );
      const sessionRir = formatExercisePrescriptionRange(exercise, getSetPrescribedRir);

      if (prescriptionEditFields.has("rir") && originalRir !== sessionRir) {
        changes.push({
          exerciseId: exercise.id,
          id: `rir:${exercise.id}`,
          label: `${exercise.name || "Exercise"}: RIR ${formatValueChange(
            originalRir,
            sessionRir
          )}`,
          type: "rir",
        });
      }

      if (
        String(originalExercise.supersetGroup || "") !==
        String(exercise.supersetGroup || "")
      ) {
        changes.push({
          exerciseId: exercise.id,
          id: `superset:${exercise.id}`,
          label: `${exercise.name || "Exercise"}: superset ${formatValueChange(
            originalExercise.supersetGroup || "",
            exercise.supersetGroup || ""
          )}`,
          type: "superset",
        });
      }
    });

    (original.exercises || []).forEach((exercise) => {
      if (!sessionById.has(String(exercise.id))) {
        changes.push({
          exerciseId: exercise.id,
          id: `exercise-remove:${exercise.id}`,
          label: `Remove exercise: ${exercise.name || "Exercise"}`,
          type: "exercise-remove",
        });
      }
    });

    return changes;
  }

  function hasWorkoutTemplateUpdates() {
    return getWorkoutUpdateOptions().length > 0;
  }

  function getDefaultWorkoutUpdateSelections(options = getWorkoutUpdateOptions()) {
    return Object.fromEntries(options.map((option) => [option.id, true]));
  }

  function getSelectedWorkoutChangeState(selections, changes = getWorkoutUpdateOptions()) {
    const selectedChanges = changes.filter((change) => selections[change.id] !== false);
    const selectedExerciseChanges = new Map();
    const getSelectedExerciseFields = (exerciseId) => {
      const key = String(exerciseId);
      const fields = selectedExerciseChanges.get(key) || new Set();

      selectedExerciseChanges.set(key, fields);
      return fields;
    };

    selectedChanges.forEach((change) => {
      if (change.type === "order") {
        return;
      }

      getSelectedExerciseFields(change.exerciseId).add(change.type);
    });

    return {
      order: selectedChanges.some((change) => change.type === "order"),
      selectedChanges,
      selectedExerciseChanges,
    };
  }

  function mergeWeeklyPrescriptions(originalExercise, sessionExercise, selectedFields) {
    if (!Array.isArray(originalExercise?.weeklyPrescriptions)) {
      return sessionExercise?.weeklyPrescriptions;
    }

    if (!Array.isArray(sessionExercise?.weeklyPrescriptions)) {
      return originalExercise.weeklyPrescriptions;
    }

    const sessionWeeksByNumber = new Map(
      sessionExercise.weeklyPrescriptions.map((week) => [
        Number(week.weekNumber),
        week,
      ])
    );

    return originalExercise.weeklyPrescriptions.map((originalWeek) => {
      const sessionWeek = sessionWeeksByNumber.get(Number(originalWeek.weekNumber));

      if (!sessionWeek) {
        return originalWeek;
      }

      return {
        ...originalWeek,
        ...(selectedFields?.has("sets") ? { sets: sessionWeek.sets } : {}),
        ...(selectedFields?.has("reps") ? { reps: sessionWeek.reps } : {}),
        ...(selectedFields?.has("rir") ? { rir: sessionWeek.rir } : {}),
      };
    });
  }

  function mergeSetPrescription(originalSet, sessionSet, selectedFields) {
    if (!sessionSet) {
      return originalSet;
    }

    return {
      ...originalSet,
      ...(selectedFields?.has("reps")
        ? {
            ...(getSetMinimumReps(sessionSet)
              ? { minimumReps: getSetMinimumReps(sessionSet) }
              : {}),
            prescribedReps: getSetPrescribedReps(sessionSet),
            reps: getSetPrescribedReps(sessionSet),
          }
        : {}),
      ...(getSetPrescribedRestSeconds(sessionSet)
        ? {
            prescribedRestSeconds: getSetPrescribedRestSeconds(sessionSet),
            restSeconds: getSetPrescribedRestSeconds(sessionSet),
          }
        : {}),
      ...(selectedFields?.has("rir")
        ? {
            prescribedRir: getSetPrescribedRir(sessionSet),
            rir: getSetPrescribedRir(sessionSet),
          }
        : {}),
    };
  }

  function buildTemplateExercisesFromSelectedUpdates(selections) {
    const original = templates.find((t) => t.id === session.templateId);
    const changeState = getSelectedWorkoutChangeState(selections);
    const { order, selectedExerciseChanges } = changeState;

    if (!original) {
      return createNextTemplateExercisesFromSession();
    }

    const sessionTemplateExercises = createNextTemplateExercisesFromSession();
    const getSessionTemplateExercise = (exerciseId) =>
      sessionTemplateExercises.find((item) => idsMatch(item.id, exerciseId));
    const buildMergedExercise = (originalExercise, sessionExercise) => {
      const selectedFields =
        selectedExerciseChanges.get(String(originalExercise.id)) || new Set();
      const sourceExercise = selectedFields.has("exercise-replace")
        ? sessionExercise || originalExercise
        : originalExercise;
      const setCount = selectedFields.has("sets")
        ? sessionExercise?.sets?.length || originalExercise.sets?.length || 1
        : originalExercise.sets?.length || 1;
      const sourceSets = Array.from({ length: setCount }, (_, index) => {
        const originalSet =
          originalExercise.sets?.[index] ||
          originalExercise.sets?.at(-1) ||
          {};
        const sessionSet = sessionExercise?.sets?.[index];

        return {
          ...mergeSetPrescription(originalSet, sessionSet, selectedFields),
          id: originalSet.id || Date.now() + Math.random() + index,
        };
      });

      return {
        ...sourceExercise,
        id: originalExercise.id,
        supersetGroup: selectedFields.has("superset")
          ? sessionExercise?.supersetGroup || null
          : originalExercise.supersetGroup || null,
        weeklyPrescriptions: mergeWeeklyPrescriptions(
          originalExercise,
          sessionExercise,
          selectedFields
        ),
        sets: sourceSets,
      };
    };
    const buildAddedExercise = (sessionExercise) =>
      selectedExerciseChanges.get(String(sessionExercise.id))?.has("exercise-add")
        ? sessionExercise
        : null;

    if (order) {
      return sessionTemplateExercises
        .map((sessionExercise) => {
          const originalExercise = (original.exercises || []).find((item) =>
            idsMatch(item.id, sessionExercise.id)
          );

          if (!originalExercise) {
            return buildAddedExercise(sessionExercise);
          }

          return buildMergedExercise(originalExercise, sessionExercise);
        })
        .filter(Boolean);
    }

    const mergedOriginalExercises = (original.exercises || []).map((originalExercise) => {
      const sessionExercise = getSessionTemplateExercise(originalExercise.id);
      const selectedFields =
        selectedExerciseChanges.get(String(originalExercise.id)) || new Set();

      if (selectedFields.has("exercise-remove")) {
        return null;
      }

      return buildMergedExercise(originalExercise, sessionExercise);
    });
    const addedExercises = sessionTemplateExercises
      .filter(
        (sessionExercise) =>
          !(original.exercises || []).some((originalExercise) =>
            idsMatch(originalExercise.id, sessionExercise.id)
          )
      )
      .map(buildAddedExercise);

    return [...mergedOriginalExercises, ...addedExercises].filter(Boolean);
  }

  function completeWorkout({ workoutUpdateSelections: selections = {} } = {}) {
    if (session.workoutTimerPaused) {
      return;
    }

    resetRestTimer();
    void triggerNativeWorkoutCompletionHaptic();

    const hasTemplateUpdates = hasWorkoutTemplateUpdates();
    const selectedTemplateExercises =
      hasTemplateUpdates && Object.values(selections).some(Boolean)
        ? buildTemplateExercisesFromSelectedUpdates(selections)
        : null;
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

      exercise.sets.filter((set) => set.completed).forEach((set) => {
        const e1rm = calculateSessionE1RM(
          exercise,
          set.actualWeight,
          set.actualReps,
          set.actualRir
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

    completedWorkout = stripSessionOnlySetValuesForHistory(completedWorkout);

    const nextHistory = [completedWorkout, ...history];
    const planCompletionUpdate = getPlanCompletionUpdate(completedWorkout);
    const completedPlan = planCompletionUpdate.completedPlan;

    nextTemplates = nextTemplates.map((t) =>
      t.id === session.templateId
        ? {
            ...t,

            name: completedWorkout.templateName,

            lastCompleted: completedWorkout.completedAt,

            ...(selectedTemplateExercises
              ? {
                  exercises: selectedTemplateExercises,
                }
              : {}),
          }
        : t
    );

    setExerciseMetadata(metadataUpdates);

    setHistory(nextHistory);

    setPlans(planCompletionUpdate.plans);

    setTemplates(nextTemplates);

    setConfirmComplete(false);

    const committedWorkoutData = {
      exerciseMetadata: metadataUpdates,
      history: nextHistory,
      plans: planCompletionUpdate.plans,
      selectedSessionId: null,
      sessions: sessions.filter((s) => s.id !== session.id),
      templates: nextTemplates,
    };

    onWorkoutDataCommitted?.(committedWorkoutData);

    if (completedPlan) {
      onPlanCompletionNeeded?.({
        completedWorkout,
        planId: completedPlan.id,
        planName: completedPlan.name,
      });
    }

    finishCompletedWorkout(completedWorkout);
  }

  const warmupExercise = warmupExerciseId
    ? session.exercises.find((exercise) => exercise.id === warmupExerciseId)
    : null;
  const warmupRecommendations = warmupExercise
    ? getWarmupRecommendations(warmupExercise)
    : null;
  const workoutUpdateOptions = getWorkoutUpdateOptions();

  return (
    <div
      style={{
        background: session.workoutTimerPaused
          ? "linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.16)), var(--bg)"
          : "var(--bg)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "background 180ms ease",
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
          .session-target-options-sheet,
          .session-plate-loading-sheet {
            animation: sessionSheetSlideUp 750ms cubic-bezier(.16, 1, .3, 1) both;
            will-change: opacity, transform;
          }

          .session-workout-actions-sheet[data-closing="true"],
          .session-target-options-sheet[data-closing="true"],
          .session-plate-loading-sheet[data-closing="true"] {
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
            .session-target-options-sheet,
            .session-plate-loading-sheet {
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
          aria-label="Workout utilities"
          style={{
            background: "color-mix(in srgb, var(--surface-raised) 88%, transparent)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            marginBottom: "12px",
            marginTop: "10px",
            padding: "6px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "6px",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: timerFinished
                  ? "var(--danger-bg)"
                  : timerRunning || timerPaused
                  ? "var(--warning-bg, rgba(255, 193, 7, .18))"
                  : expandedSessionUtility === "timer"
                  ? "color-mix(in srgb, var(--accent) 12%, var(--surface-raised))"
                  : "var(--surface-raised)",
                border: timerFinished
                  ? "1px solid #c66"
                  : timerRunning || timerPaused
                  ? "1px solid #d6a100"
                  : "1px solid var(--border)",
                borderRadius: "999px",
                color: "var(--text)",
                display: "inline-flex",
                fontSize: "13px",
                fontWeight: 700,
                gap: "3px",
                minHeight: "36px",
                padding: "4px 6px",
              }}
            >
              <button
                aria-expanded={expandedSessionUtility === "timer"}
                aria-label={
                  expandedSessionUtility === "timer"
                    ? "Collapse rest timer"
                    : "Show rest timer"
                }
                onClick={() =>
                  setExpandedSessionUtility((current) =>
                    current === "timer" ? null : "timer"
                  )
                }
                style={{
                  alignItems: "center",
                  background: "transparent",
                  border: 0,
                  color: "inherit",
                  display: "inline-flex",
                  fontSize: "13px",
                  fontWeight: 700,
                  gap: "6px",
                  minHeight: "26px",
                  padding: "2px 4px",
                }}
                type="button"
              >
                <Timer size={21} />
                {expandedSessionUtility === "timer" ? (
                  <span
                    aria-hidden="true"
                    style={{
                      background: "color-mix(in srgb, currentColor 20%, transparent)",
                      borderRadius: "999px",
                      display: "block",
                      height: "5px",
                      overflow: "hidden",
                      width: "56px",
                    }}
                  >
                    <span
                      style={{
                        background: timerFinished ? "#c66" : "currentColor",
                        borderRadius: "inherit",
                        display: "block",
                        height: "100%",
                        transition: timerPaused ? "none" : "width 1s linear",
                        width: `${
                          timerFinished
                            ? 0
                            : Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((timerRunning || timerPaused
                                    ? restSeconds
                                    : restMinutes * 60 + restRemainder) /
                                    Math.max(1, restTimerProgressTotal)) *
                                    100
                                )
                              )
                        }%`,
                      }}
                    />
                  </span>
                ) : (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {timerFinished ? "+" : ""}
                    {String(Math.floor(
                      (timerRunning || timerPaused || timerFinished
                        ? restSeconds
                        : restMinutes * 60 + restRemainder) / 60
                    )).padStart(2, "0")}:
                    {String(
                      (timerRunning || timerPaused || timerFinished
                        ? restSeconds
                        : restMinutes * 60 + restRemainder) % 60
                    ).padStart(2, "0")}
                  </span>
                )}
              </button>

              {expandedSessionUtility !== "timer" && (
                <>
                  {!timerFinished && (
                    <button
                      aria-label={timerRunning ? "Pause rest timer" : "Start rest timer"}
                      disabled={
                        !timerRunning &&
                        !timerPaused &&
                        restMinutes * 60 + restRemainder <= 0
                      }
                      onClick={toggleRestTimer}
                      style={{
                        alignItems: "center",
                        background: "transparent",
                        border: 0,
                        color: "inherit",
                        display: "inline-flex",
                        height: "28px",
                        justifyContent: "center",
                        padding: "4px",
                        width: "28px",
                      }}
                      type="button"
                    >
                      {timerRunning ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  )}
                  <button
                    aria-label="Reset rest timer"
                    disabled={!timerRunning && !timerPaused && !timerFinished}
                    onClick={resetRestTimer}
                    style={{
                      alignItems: "center",
                      background: "transparent",
                      border: 0,
                      color: "inherit",
                      display: "inline-flex",
                      height: "28px",
                      justifyContent: "center",
                      padding: "4px",
                      width: "28px",
                    }}
                    type="button"
                  >
                    <RefreshCw size={15} />
                  </button>
                </>
              )}
            </div>

            {canUseNativeSpotifyPlayback() && (
              <div
                style={{
                  alignItems: "center",
                  background:
                    expandedSessionUtility === "spotify"
                      ? "color-mix(in srgb, #1db954 12%, var(--surface-raised))"
                      : "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  color: "var(--text)",
                  display: "inline-flex",
                  gap: "3px",
                  minHeight: "36px",
                  padding: "4px 6px",
                }}
              >
                <button
                  aria-expanded={expandedSessionUtility === "spotify"}
                  aria-label={
                    expandedSessionUtility === "spotify"
                      ? "Collapse Spotify controls"
                      : "Show Spotify controls"
                  }
                  onClick={() =>
                    setExpandedSessionUtility((current) =>
                      current === "spotify" ? null : "spotify"
                    )
                  }
                  style={{
                    alignItems: "center",
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    display: "inline-flex",
                    gap: "7px",
                    minHeight: "26px",
                    padding: "2px",
                  }}
                  type="button"
                >
                  <SpotifyIcon size={21} />
                  {expandedSessionUtility === "spotify" && (
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        maxWidth: "min(34vw, 150px)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {spotifyState.trackName || "Spotify"}
                    </span>
                  )}
                </button>

                {expandedSessionUtility !== "spotify" && (
                  <div
                    aria-label="Spotify playback controls"
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "1px",
                    }}
                  >
                    <button
                      aria-label="Previous Spotify track"
                      disabled={
                        spotifyBusy ||
                        !spotifyState.connected ||
                        !spotifyState.canSkipPrevious
                      }
                      onClick={() => void handleSpotifySkip("previous")}
                      style={{
                        alignItems: "center",
                        background: "transparent",
                        border: 0,
                        color: "inherit",
                        display: "inline-flex",
                        height: "26px",
                        justifyContent: "center",
                        opacity:
                          spotifyBusy ||
                          !spotifyState.connected ||
                          !spotifyState.canSkipPrevious
                            ? 0.38
                            : 1,
                        padding: "4px",
                        width: "26px",
                      }}
                      type="button"
                    >
                      <SkipBack size={15} />
                    </button>
                    <button
                      aria-label={
                        spotifyState.connected
                          ? spotifyState.isPaused
                            ? "Resume Spotify"
                            : "Pause Spotify"
                          : "Connect Spotify"
                      }
                      disabled={spotifyBusy}
                      onClick={() => void handleSpotifyPlayback()}
                      style={{
                        alignItems: "center",
                        background: "transparent",
                        border: 0,
                        color: "inherit",
                        display: "inline-flex",
                        height: "28px",
                        justifyContent: "center",
                        opacity: spotifyBusy ? 0.38 : 1,
                        padding: "4px",
                        width: "28px",
                      }}
                      type="button"
                    >
                      {spotifyState.connected &&
                      spotifyState.isPaused === false ? (
                        <Pause size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                    <button
                      aria-label="Next Spotify track"
                      disabled={
                        spotifyBusy ||
                        !spotifyState.connected ||
                        !spotifyState.canSkipNext
                      }
                      onClick={() => void handleSpotifySkip("next")}
                      style={{
                        alignItems: "center",
                        background: "transparent",
                        border: 0,
                        color: "inherit",
                        display: "inline-flex",
                        height: "26px",
                        justifyContent: "center",
                        opacity:
                          spotifyBusy ||
                          !spotifyState.connected ||
                          !spotifyState.canSkipNext
                            ? 0.38
                            : 1,
                        padding: "4px",
                        width: "26px",
                      }}
                      type="button"
                    >
                      <SkipForward size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {expandedSessionUtility === "timer" && (
        <div
          style={{
            background: timerFinished
              ? "var(--danger-bg)"
              : timerRunning || timerPaused
              ? "var(--warning-bg, rgba(255, 193, 7, .18))"
              : "var(--surface-raised)",

            border: timerFinished
              ? "2px solid #c66"
              : timerRunning || timerPaused
              ? "2px solid #d6a100"
              : "1px solid var(--border)",

            padding: "6px",
            marginTop: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            flexWrap: "nowrap",
          }}
        >
          <Timer size={28} />

          <button
            aria-label="Subtract 15 seconds from rest timer"
            onClick={() => adjustRestTimer(-15)}
            style={{
              alignItems: "center",
              borderRadius: "999px",
              display: "inline-flex",
              height: "34px",
              justifyContent: "center",
              minWidth: "34px",
              padding: "6px",
            }}
            type="button"
          >
            <Minus size={18} />
          </button>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "center",
              minWidth:
                timerRunning || timerPaused || timerFinished ? "72px" : "112px",
            }}
          >
            {timerRunning || timerPaused || timerFinished ? (
              <strong
                aria-live={timerFinished ? "polite" : "off"}
                style={{
                  fontSize: "20px",
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "center",
                }}
              >
                {timerFinished ? "+" : ""}
                {String(Math.floor(restSeconds / 60)).padStart(2, "0")}:
                {String(restSeconds % 60).padStart(2, "0")}
              </strong>
            ) : (
              <>
                <select
                  aria-label="Rest timer minutes"
                  style={{
                    fontSize: "16px",
                    padding: "4px",
                  }}
                  value={restMinutes}
                  onChange={(e) => setRestMinutes(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" style={{ padding: "0 2px" }}>
                  :
                </span>
                <select
                  aria-label="Rest timer seconds"
                  style={{
                    fontSize: "16px",
                    padding: "4px",
                  }}
                  value={restRemainder}
                  onChange={(e) => setRestRemainder(Number(e.target.value))}
                >
                  {Array.from(
                    new Set([0, 5, 15, 30, 45, restRemainder])
                  )
                    .sort((left, right) => left - right)
                    .map((n) => (
                    <option key={n} value={n}>
                      {String(n).padStart(2, "0")}
                    </option>
                    ))}
                </select>
              </>
            )}
          </div>

          <button
            aria-label="Add 15 seconds to rest timer"
            onClick={() => adjustRestTimer(15)}
            style={{
              alignItems: "center",
              borderRadius: "999px",
              display: "inline-flex",
              height: "34px",
              justifyContent: "center",
              minWidth: "34px",
              padding: "6px",
            }}
            type="button"
          >
            <Plus size={18} />
          </button>

          <button
            aria-hidden={timerFinished ? "true" : undefined}
            aria-label={
              timerFinished
                ? "Rest timer finished"
                : timerRunning
                ? "Pause rest timer"
                : timerPaused
                ? "Resume rest timer"
                : "Start rest timer"
            }
            disabled={
              timerFinished ||
              (!timerPaused && restMinutes * 60 + restRemainder <= 0)
            }
            style={{
              alignItems: "center",
              display: "inline-flex",
              justifyContent: "center",
              lineHeight: "1",
              minHeight: "38px",
              minWidth: "38px",
              padding: "8px 6px",
              visibility: timerFinished ? "hidden" : "visible",
            }}
            tabIndex={timerFinished ? -1 : undefined}
            onClick={toggleRestTimer}
          >
            {timerRunning ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button
            aria-label="Reset rest timer"
            disabled={!timerRunning && !timerPaused && !timerFinished}
            style={{
              alignItems: "center",
              display: "inline-flex",
              justifyContent: "center",
              minHeight: "38px",
              minWidth: "38px",
              padding: "8px 6px",
            }}
            onClick={() => {
              resetRestTimer();
              setExpandedSessionUtility("timer");
            }}
          >
            <RefreshCw size={19} />
          </button>
        </div>
        )}

        {canUseNativeSpotifyPlayback() &&
          expandedSessionUtility === "spotify" && (
          <div
            style={{
              alignItems: "center",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              display: "flex",
              gap: "10px",
              marginTop: "6px",
              padding: "8px 10px",
            }}
          >
            <button
              aria-label="Open Spotify"
              onClick={() => void openSpotifyApp()}
              style={{
                alignItems: "center",
                background: "transparent",
                border: 0,
                display: "inline-flex",
                flexShrink: 0,
                justifyContent: "center",
                padding: "6px",
              }}
              type="button"
            >
              <SpotifyArtwork
                imageDataURL={
                  spotifyState.connected && spotifyState.isPaused === false
                    ? spotifyState.playlistImageDataURL
                    : null
                }
              />
            </button>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {spotifyState.trackName ||
                  (spotifyState.connected
                    ? "Spotify connected"
                    : spotifyState.error
                    ? "Reconnect Spotify"
                    : spotifyState.authorized
                    ? "Connecting to Spotify…"
                    : "Connect Spotify")}
              </div>
              <div
                style={{
                  color: spotifyState.error
                    ? "var(--danger, #b42318)"
                    : "var(--text-muted)",
                  fontSize: "11px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {spotifyState.error ||
                  spotifyState.artistName ||
                  "Control playback without leaving your workout"}
              </div>
            </div>
            <div
              style={{
                alignItems: "center",
                display: "flex",
                flexShrink: 0,
                gap: "4px",
              }}
            >
              <button
                aria-label="Previous Spotify track"
                disabled={
                  spotifyBusy ||
                  !spotifyState.connected ||
                  !spotifyState.canSkipPrevious
                }
                onClick={() => void handleSpotifySkip("previous")}
                style={{ padding: "8px" }}
                title="Previous"
                type="button"
              >
                <SkipBack size={18} />
              </button>
              <button
                aria-label={
                  spotifyState.connected
                    ? spotifyState.isPaused
                      ? "Resume Spotify"
                      : "Pause Spotify"
                    : "Connect Spotify"
                }
                disabled={spotifyBusy}
                onClick={() => void handleSpotifyPlayback()}
                style={{ padding: "8px" }}
                title={spotifyState.connected ? "Play or pause" : "Connect Spotify"}
                type="button"
              >
                {spotifyState.connected && spotifyState.isPaused === false ? (
                  <Pause size={18} />
                ) : (
                  <Play size={18} />
                )}
              </button>
              <button
                aria-label="Next Spotify track"
                disabled={
                  spotifyBusy ||
                  !spotifyState.connected ||
                  !spotifyState.canSkipNext
                }
                onClick={() => void handleSpotifySkip("next")}
                style={{ padding: "8px" }}
                title="Next"
                type="button"
              >
                <SkipForward size={18} />
              </button>
            </div>
          </div>
        )}
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
              display: "grid",
              gap: "6px",
              gridTemplateColumns: "1fr minmax(0, auto) 38px 1fr",
              justifyItems: "center",
            }}
          >
            <span />
            <button
              aria-label={`Open workout controls: ${session.templateName}`}
              onClick={openSessionActions}
              style={{
                alignItems: "center",
                background: session.workoutTimerPaused
                  ? "var(--text-h)"
                  : "transparent",
                border: session.workoutTimerPaused
                  ? "1px solid var(--text-h)"
                  : "none",
                borderRadius: session.workoutTimerPaused ? "999px" : 0,
                color: session.workoutTimerPaused
                  ? "var(--surface-raised)"
                  : "var(--text-h)",
                display: "inline-flex",
                fontSize: "20px",
                fontWeight: session.workoutTimerPaused ? 900 : "bold",
                gap: "6px",
                justifyContent: "center",
                lineHeight: 1.15,
                minWidth: 0,
                overflow: "hidden",
                padding: session.workoutTimerPaused ? "5px 10px" : 0,
                textAlign: "center",
                textOverflow: "ellipsis",
                transition:
                  "background 160ms ease, border-color 160ms ease, color 160ms ease",
                whiteSpace: "nowrap",
              }}
            >
              {session.workoutTimerPaused && (
                <Pause aria-hidden="true" size={16} />
              )}
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {session.templateName}
              </span>
            </button>
            <button
              aria-label={`Open workout controls: ${session.templateName}`}
              onClick={openSessionActions}
              title="Workout controls"
              type="button"
              style={{
                alignItems: "center",
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: "999px",
                color: "var(--text)",
                display: "inline-flex",
                height: "38px",
                justifyContent: "center",
                padding: 0,
                width: "38px",
              }}
            >
              <SlidersHorizontal size={21} />
            </button>
            <span />
          </div>

          <div
            aria-label="Workout exercises"
            className="session-exercise-strip"
            onContextMenu={(event) => event.preventDefault()}
            ref={exerciseStripRef}
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
                      const isBenchmark = isExerciseBenchmark(exerciseDetail);
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
                              ref={(element) => {
                                if (element) {
                                  exerciseThumbnailRefs.current[exercise.id] = element;
                                } else {
                                  delete exerciseThumbnailRefs.current[exercise.id];
                                }
                              }}
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
                              {isBenchmark ? (
                                <span
                                  title="Benchmark exercise"
                                  style={{
                                    alignItems: "center",
                                    background: "var(--surface-raised)",
                                    borderRadius: "999px",
                                    boxShadow: "0 0 0 1px color-mix(in srgb, #ca8a04 35%, transparent)",
                                    display: "inline-flex",
                                    height: "18px",
                                    justifyContent: "center",
                                    left: "1px",
                                    position: "absolute",
                                    top: "1px",
                                    width: "18px",
                                  }}
                                >
                                  <BenchmarkTrophy size={12} />
                                </span>
                              ) : null}
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
                                    right: "2px",
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
              disabled={session.workoutTimerPaused}
              onClick={() => {
                setShowAddExercise((isOpen) => !isOpen);
                setReplacingExerciseId(null);
                setSearch("");
              }}
              ref={addExerciseButtonRef}
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

        {(pauseWarningFlash || inactivityWarningFlash) && (
          <div
            aria-hidden="true"
            style={{
              background: "rgba(245, 158, 11, .64)",
              inset: 0,
              pointerEvents: "none",
              position: "fixed",
              zIndex: 20000,
            }}
          />
        )}

        {pauseReminderOpen && session.workoutTimerPaused && (
          <div
            aria-label="Workout pause reminder"
            aria-modal="true"
            role="alertdialog"
            style={{
              alignItems: "center",
              background: "rgba(0, 0, 0, .48)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              padding: "20px",
              position: "fixed",
              zIndex: 20001,
            }}
          >
            <div
              style={{
                background: "var(--surface-raised)",
                border: "2px solid #d6a100",
                borderRadius: "18px",
                boxShadow: "0 18px 50px rgba(0, 0, 0, .3)",
                display: "grid",
                gap: "16px",
                maxWidth: "360px",
                padding: "22px",
                textAlign: "center",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <img
                  alt="Workout app"
                  src={NATIVE_APP_ICON}
                  style={{
                    borderRadius: "14px",
                    height: "64px",
                    width: "64px",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    alignItems: "center",
                    background: "#f59e0b",
                    border: "3px solid var(--surface-raised)",
                    borderRadius: "999px",
                    bottom: "-6px",
                    color: "#111",
                    display: "inline-flex",
                    height: "28px",
                    justifyContent: "center",
                    marginLeft: "42px",
                    position: "absolute",
                    width: "28px",
                  }}
                >
                  <AlertTriangle size={16} />
                </span>
              </div>

              <div>
                <h2 style={{ fontSize: "21px", margin: "0 0 8px" }}>
                  Workout paused for{" "}
                  {formatWorkoutPauseDuration(WORKOUT_PAUSE_REMINDER_SECONDS)}
                </h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "15px",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  Are you still working out?
                </p>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                <button
                  autoFocus
                  onClick={() => {
                    setPauseReminderOpen(false);
                    toggleWorkoutTimerPaused();
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    fontSize: "15px",
                    fontWeight: 800,
                    gap: "8px",
                    justifyContent: "center",
                    minHeight: "46px",
                  }}
                  type="button"
                >
                  <Play size={17} />
                  Resume Workout
                </button>
                <button
                  onClick={() => {
                    const nextReminderStartedAtIso = new Date().toISOString();
                    pauseReminderHandledKeyRef.current = null;
                    setPauseReminderOpen(false);
                    updateSession((currentSession) => ({
                      ...currentSession,
                      workoutPauseReminderStartedAtIso:
                        nextReminderStartedAtIso,
                    }));
                  }}
                  style={{ minHeight: "42px" }}
                  type="button"
                >
                  Keep Paused
                </button>
              </div>
            </div>
          </div>
        )}

        {inactivityReminderOpen && !session.workoutTimerPaused && (
          <div
            aria-label="Workout inactivity reminder"
            aria-modal="true"
            role="alertdialog"
            style={{
              alignItems: "center",
              background: "rgba(0, 0, 0, .48)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              padding: "20px",
              position: "fixed",
              zIndex: 20001,
            }}
          >
            <div
              style={{
                background: "var(--surface-raised)",
                border: "2px solid #d6a100",
                borderRadius: "18px",
                boxShadow: "0 18px 50px rgba(0, 0, 0, .3)",
                display: "grid",
                gap: "16px",
                maxWidth: "360px",
                padding: "22px",
                textAlign: "center",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <img
                  alt="Workout app"
                  src={NATIVE_APP_ICON}
                  style={{
                    borderRadius: "14px",
                    height: "64px",
                    width: "64px",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    alignItems: "center",
                    background: "#f59e0b",
                    border: "3px solid var(--surface-raised)",
                    borderRadius: "999px",
                    bottom: "-6px",
                    color: "#111",
                    display: "inline-flex",
                    height: "28px",
                    justifyContent: "center",
                    marginLeft: "42px",
                    position: "absolute",
                    width: "28px",
                  }}
                >
                  <AlertTriangle size={16} />
                </span>
              </div>

              <div>
                <h2 style={{ fontSize: "21px", margin: "0 0 8px" }}>
                  No sets completed in{" "}
                  {formatWorkoutPauseDuration(
                    WORKOUT_INACTIVITY_REMINDER_SECONDS
                  )}
                </h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "15px",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  Are you still working out?
                </p>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                <button
                  autoFocus
                  onClick={() => {
                    const nextReminderStartedAtIso = new Date().toISOString();
                    inactivityReminderHandledKeyRef.current = null;
                    setInactivityReminderOpen(false);
                    updateSession((currentSession) => ({
                      ...currentSession,
                      workoutInactivityReminderStartedAtIso:
                        nextReminderStartedAtIso,
                    }));
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    fontSize: "15px",
                    fontWeight: 800,
                    gap: "8px",
                    justifyContent: "center",
                    minHeight: "46px",
                  }}
                  type="button"
                >
                  <Dumbbell size={17} />
                  Keep Working Out
                </button>
                <button
                  onClick={() => {
                    setInactivityReminderOpen(false);
                    toggleWorkoutTimerPaused();
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "7px",
                    justifyContent: "center",
                    minHeight: "42px",
                  }}
                  type="button"
                >
                  <Pause size={16} />
                  Pause Workout
                </button>
              </div>
            </div>
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
                {group.exercises.map((exercise) => {
                  const exerciseNote =
                    exerciseMetadata?.[exercise.exerciseId]?.note || "";
                  const exerciseNoteText = exerciseNote.trim();
                  const editingNote = !!expandedNotes[exercise.id];
                  const prescriptionDisplay =
                    getExercisePrescriptionDisplay(exercise);

                  return (
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
                          disabled={session.workoutTimerPaused}
                          label="Exercise notes"
                          size={34}
                          onClick={() => openExerciseNoteEditor(exercise)}
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
                          onClick={() => {
                            void triggerNativeWarningHaptic();
                            setPendingDeleteExercise(exercise);
                          }}
                        >
                          <Trash2 size={17} />
                        </IconButton>
                      </div>
                    </div>

                    {editingNote ? (
                      <div
                        style={{
                          alignItems: "flex-start",
                          display: "grid",
                          gap: "4px",
                          gridTemplateColumns: "minmax(0, 1fr) auto auto",
                          marginTop: "8px",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <textarea
                          disabled={session.workoutTimerPaused}
                          placeholder="Notes"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            boxSizing: "border-box",
                            fontSize: "0.85rem",
                            lineHeight: 1.35,
                            minHeight: "42px",
                            minWidth: 0,
                            padding: "6px",
                            resize: "vertical",
                            textAlign: "left",
                            width: "100%",
                          }}
                          value={
                            exerciseMetadata?.[exercise.exerciseId]?.note || ""
                          }
                          onChange={(e) => {
                            if (session.workoutTimerPaused) {
                              return;
                            }

                            setExerciseMetadata((metadata) => ({
                              ...(metadata || {}),
                              [exercise.exerciseId]: {
                                ...(metadata?.[exercise.exerciseId] || {}),
                                note: e.target.value,
                              },
                            }));
                          }}
                        />

                        <button
                          disabled={session.workoutTimerPaused}
                          type="button"
                          onClick={() => acceptExerciseNoteEdit(exercise)}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            minHeight: "32px",
                            minWidth: "32px",
                            padding: "2px 7px",
                          }}
                        >
                          <Check size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => cancelExerciseNoteEdit(exercise)}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            minHeight: "32px",
                            minWidth: "28px",
                            padding: "2px 7px",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : exerciseNoteText ? (
                      <button
                        disabled={session.workoutTimerPaused}
                        type="button"
                        onClick={() => openExerciseNoteEditor(exercise)}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          lineHeight: 1.35,
                          marginTop: "8px",
                          overflowWrap: "anywhere",
                          padding: 0,
                          textAlign: "left",
                          whiteSpace: "pre-wrap",
                          width: "100%",
                          wordBreak: "break-word",
                        }}
                      >
                        {exerciseNoteText}
                      </button>
                    ) : null}

                    <div
                      style={{
                        alignItems: "stretch",
                        display: "flex",
                        gap: "8px",
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
                          minHeight: "24px",
                          padding: "2px 8px",
                        }}
                      >
                        <Flame size={15} /> Warmup sets
                      </button>
                      <div
                        aria-label="Prescribed reps and RIR"
                        title="Prescribed reps and RIR"
                        style={{
                          alignItems: "center",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--text)",
                          display: "inline-flex",
                          fontSize: "13px",
                          fontWeight: 700,
                          justifyContent: "center",
                          minHeight: "24px",
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {prescriptionDisplay.reps} reps ·{" "}
                        {prescriptionDisplay.rir} RIR
                      </div>
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

                          <button
                            aria-label="Open plate loading calculator"
                            disabled={session.workoutTimerPaused}
                            onClick={() => {
                              const targetSet =
                                exercise.sets.find(
                                  (set) => activeSet?.setId === set.id
                                ) ||
                                exercise.sets.find((set) => !set.completed) ||
                                exercise.sets[0];

                              openPlateLoadingCalculator(exercise, targetSet);
                            }}
                            title="Actual weight"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "inherit",
                              marginLeft: "4px",
                              width: "50px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              cursor: "pointer",
                              display: "inline-flex",
                              font: "inherit",
                              justifyContent: "center",
                              padding: 0,
                            }}
                            type="button"
                          >
                            <Weight size={15} aria-label="Actual weight" />
                          </button>

                          <button
                            aria-label="Edit prescribed reps"
                            disabled={session.workoutTimerPaused}
                            onClick={() => {
                              const targetSet =
                                exercise.sets.find((set) => !set.completed) ||
                                exercise.sets[0];

                              setRepsPickerData({
                                exerciseId: exercise.id,
                                field: "prescribedReps",
                                value: Number(getSetPrescribedReps(targetSet) || 0),
                              });
                              setShowRepsPicker(true);
                            }}
                            title="Prescribed reps"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "inherit",
                              width: "46px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              cursor: "pointer",
                              display: "inline-flex",
                              font: "inherit",
                              justifyContent: "center",
                              padding: 0,
                            }}
                            type="button"
                          >
                            <Hash size={15} aria-label="Target reps" />
                          </button>

                          <button
                            aria-label="Edit prescribed RIR"
                            disabled={session.workoutTimerPaused}
                            onClick={() => {
                              const targetSet =
                                exercise.sets.find((set) => !set.completed) ||
                                exercise.sets[0];

                              setRirPickerData({
                                exerciseId: exercise.id,
                                field: "prescribedRir",
                                value: Number(getSetPrescribedRir(targetSet) || 0),
                              });
                              setShowRirPicker(true);
                            }}
                            title="Prescribed RIR"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "inherit",
                              width: "36px",
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              alignItems: "center",
                              cursor: "pointer",
                              display: "inline-flex",
                              font: "inherit",
                              justifyContent: "center",
                              padding: 0,
                            }}
                            type="button"
                          >
                            <BatteryMedium size={15} aria-label="Target RIR" />
                          </button>

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
                          const targetMatchStatus = isActive
                            ? getActualTargetMatchStatus(exercise, set, setIndex)
                            : "match";
                          const showTargetStatus =
                            targetMatchStatus !== "match";
                          const targetStatusStyle =
                            targetMatchStatus === "suggested"
                              ? {
                                  iconColor: "#16a34a",
                                  label:
                                    "Actual values match the first suggested target",
                                }
                              : targetMatchStatus === "alternative"
                              ? {
                                  iconColor: "#ca8a04",
                                  label:
                                    "Actual values match an alternate target",
                                }
                              : {
                                  iconColor: "#ef4444",
                                  label:
                                    "Actual values do not match target options",
                                };
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
                          const actualE1RM = isBlankValue(set.actualReps)
                            ? null
                            : calculateSessionE1RM(
                                exercise,
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
                                if (!session.workoutTimerPaused && canActivate) {
                                  lockSupersetOrderForSet(exercise.id, set.id);
                                  setActiveWorkoutFocus({
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
                                disabled={session.workoutTimerPaused}
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
                                  {getSetTargetReps(set)}
                                  {getSetTargetRir(set) ? `@${getSetTargetRir(set)}` : ""}
                                </div>

                                <div
                                  style={{
                                    alignItems: "center",
                                    fontSize: "10px",
                                    color: "var(--text-muted)",
                                    display: "flex",
                                    gap: "4px",
                                    minHeight: "13px",
                                    textAlign: "left",
                                  }}
                                >
                                  <span>
                                    (
                                    {formatSessionE1RMDisplay(
                                      calculateSessionE1RM(
                                        exercise,
                                        "",
                                        "",
                                        "",
                                        set.targetWeight,
                                        getSetTargetReps(set),
                                        getSetTargetRir(set)
                                      )
                                    )}
                                    )
                                  </span>
                                  {showTargetStatus && (
                                    <span
                                      aria-label={targetStatusStyle.label}
                                      title={targetStatusStyle.label}
                                      style={{
                                        alignItems: "center",
                                        color: targetStatusStyle.iconColor,
                                        display: "inline-flex",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Target size={12} strokeWidth={3.2} />
                                    </span>
                                  )}
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
                                  disabled={session.workoutTimerPaused}
                                  type="button"
                                  onClick={() => {
                                    const calculationExercise =
                                      getExerciseForCalculation(exercise);

                                    setWeightPickerData({
                                      exerciseId: exercise.id,
                                      increment: getExerciseWeightIncrement(
                                        calculationExercise,
                                        undefined,
                                        set.actualWeight
                                      ),
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
                                  disabled={session.workoutTimerPaused}
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
                                  disabled={session.workoutTimerPaused}
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
                                  {formatSessionE1RMDisplay(actualE1RM)}
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
                                  session.workoutTimerPaused ||
                                  (set.completed ? !canUncomplete : !canActivate)
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
                                disabled={session.workoutTimerPaused}
                                label="Delete set"
                                size={30}
                                tone="danger"
                                onClick={(e) => {
                                  e.stopPropagation();

                                  void triggerNativeWarningHaptic();
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
                        disabled={session.workoutTimerPaused}
                        style={{
                          alignItems: "center",
                          boxSizing: "border-box",
                          display: "inline-flex",
                          gap: "5px",
                          minHeight: exercise.supersetGroup ? "40px" : "34px",
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
                        disabled={session.workoutTimerPaused}
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
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <hr />

        {showAddExercise && (
          <ExercisePickerSheet
            bodyWeightEntries={bodyWeightEntries}
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
            bodyWeightEntries={bodyWeightEntries}
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

        {(plateCalculatorData || plateCalculatorClosing) && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Plate loading calculator"
            onClick={() => closePlateLoadingCalculator()}
            style={{
              alignItems: "flex-end",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              position: "fixed",
              zIndex: 10000,
            }}
          >
            <div
              className="session-plate-loading-sheet"
              data-closing={plateCalculatorClosing ? "true" : "false"}
              onAnimationEnd={(event) => {
                if (
                  event.currentTarget === event.target &&
                  plateCalculatorClosing
                ) {
                  setPlateCalculatorClosing(false);
                  setPlateCalculatorData(null);
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
                maxHeight: "94dvh",
                maxWidth: "760px",
                overflowY: "auto",
                padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: "12px",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h2
                    style={{
                      fontSize: "18px",
                      margin: 0,
                    }}
                  >
                    {plateCalculatorData?.fixedWeights
                      ? "Warmup Loading"
                      : "Plate Loading"}
                  </h2>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plateCalculatorData?.subtitle
                      ? `${plateCalculatorData.subtitle} · `
                      : ""}
                    {plateCalculatorData?.exerciseName}
                  </div>
                </div>

                <button
                  aria-label="Close plate loading calculator"
                  onClick={() => closePlateLoadingCalculator()}
                  style={{
                    alignItems: "center",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    color: "var(--text)",
                    display: "inline-flex",
                    height: "32px",
                    justifyContent: "center",
                    width: "32px",
                  }}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>

              <PlateLoadingCalculator
                fixedWeights={plateCalculatorData?.fixedWeights || null}
                fullWidth
                initialEquipmentId={plateCalculatorData?.equipmentId || "barbell"}
                initialWeight={plateCalculatorData?.weight || ""}
                inventory={plateInventory}
                onApplyManualLoading={
                  plateCalculatorData?.setId && !plateCalculatorData?.fixedWeights
                    ? applyManualLoadingToCurrentSet
                    : null
                }
                showInputs={!plateCalculatorData?.fixedWeights}
                warmupLoadContexts={plateCalculatorData?.warmupLoadContexts || []}
              />
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
                    void triggerNativeWarningHaptic();
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
                  disabled={session.workoutTimerPaused}
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
                  disabled={session.workoutTimerPaused}
                  ref={completeWorkoutButtonRef}
                  onClick={() => {
                    if (!allSetsCompleted) {
                      void triggerNativeWarningHaptic();
                    }
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
	                      const options = getWorkoutUpdateOptions();

	                      if (options.length) {
	                        setWorkoutUpdateSelections(
	                          getDefaultWorkoutUpdateSelections(options)
	                        );
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
	                  Update workout prescription?
	                </div>

                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "13px",
                    marginBottom: "16px",
                  }}
                >
	                  Choose which changes should be saved to this workout for
	                  next time.
	                </div>

	                <div
	                  style={{
	                    display: "grid",
	                    gap: "8px",
	                    marginBottom: "16px",
	                  }}
	                >
	                  {workoutUpdateOptions.map((option) => (
	                    <label
	                      key={option.id}
	                      style={{
	                        alignItems: "center",
	                        background: "var(--surface-muted)",
	                        border: "1px solid var(--border)",
	                        borderRadius: "8px",
	                        display: "flex",
	                        gap: "8px",
	                        padding: "8px 10px",
	                      }}
	                    >
	                      <input
	                        checked={workoutUpdateSelections[option.id] !== false}
	                        onChange={(event) => {
	                          setWorkoutUpdateSelections((current) => ({
	                            ...current,
	                            [option.id]: event.target.checked,
	                          }));
	                        }}
	                        type="checkbox"
	                      />
	                      <span>{option.label}</span>
	                    </label>
	                  ))}
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
	                        workoutUpdateSelections: {},
	                      });
	                    }}
	                  >
                    No
                  </button>

	                  <button
	                    onClick={() => {
	                      setShowApplyChangesPrompt(false);
	                      completeWorkout({
	                        workoutUpdateSelections,
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
                      Alternatives ordered by estimated strength
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
                          e1RM{" "}
                          {formatSessionE1RMDisplay(
                            targetAlternativesData.current.e1rm
                          )}
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
                  {targetAlternativesData.targetOptions.length === 0 ? (
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
                    targetAlternativesData.targetOptions.map((option) => (
                      <button
                        key={`${option.isSuggested ? "suggested" : "alternative"}-${option.weight}-${option.reps}-${option.rir}`}
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
                          background: option.isSuggested
                            ? "color-mix(in srgb, var(--accent) 12%, var(--surface-raised))"
                            : undefined,
                          borderColor: option.isSuggested
                            ? "var(--accent)"
                            : undefined,
                          display: "grid",
                          gap: "8px",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          minHeight: "44px",
                          textAlign: "left",
                        }}
                      >
                        <span>
                          {option.isSuggested && (
                            <span
                              style={{
                                alignItems: "center",
                                color: "var(--accent)",
                                display: "inline-flex",
                                fontSize: "11px",
                                fontWeight: 700,
                                gap: "4px",
                                marginRight: "8px",
                                textTransform: "uppercase",
                              }}
                            >
                              <Target size={14} />
                              Suggested
                            </span>
                          )}
                          {formatPrescriptionLabel(option)}
                        </span>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "13px",
                          }}
                        >
                          e1RM {formatSessionE1RMDisplay(option.e1rm)}
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
            increment={weightPickerData?.increment}
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
            values={
              rirPickerData?.field === "prescribedRir"
                ? TARGET_RIR_PICKER_VALUES
                : RIR_PICKER_VALUES
            }
            onSelect={(value) => {
              if (!rirPickerData) {
                return;
              }

              if (rirPickerData.field === "prescribedRir") {
                updateExercisePrescription(
                  rirPickerData.exerciseId,
                  "prescribedRir",
                  String(value)
                );
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

              if (repsPickerData.field === "prescribedReps") {
                updateExercisePrescription(
                  repsPickerData.exerciseId,
                  "prescribedReps",
                  String(value)
                );
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
                              <button
                                aria-label={`Open plate loading calculator for ${option.label}`}
                                onClick={() =>
                                  openWarmupPlateLoadingCalculator(
                                    warmupExercise,
                                    option
                                  )
                                }
                                title="Weight"
                                style={{
                                  alignItems: "center",
                                  background: "transparent",
                                  border: "none",
                                  color: "inherit",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  font: "inherit",
                                  justifyContent: "center",
                                  padding: 0,
                                }}
                                type="button"
                              >
                                <Weight size={15} aria-label="Weight" />
                              </button>
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
              bodyWeightEntries={bodyWeightEntries}
              exercise={detailExercise}
              exerciseLibrary={exerciseLibrary}
              history={history}
              onClose={() => setDetailExercise(null)}
              onEdit={
                !detailExercise.builtin || canEditBuiltInExercises
                  ? (exercise) => {
                      const exerciseKey = getExerciseKey(exercise);
                      const libraryExercise = exerciseLibrary.find(
                        (item) =>
                          String(item.id) === String(exercise.id) ||
                          String(item.exerciseId || "") === String(exercise.id) ||
                          getExerciseKey(item) === exerciseKey
                      );

                      if (libraryExercise) {
                        setLibraryEditingExercise(libraryExercise);
                      }
                    }
                  : undefined
              }
            />
          )}
          {libraryEditingExercise && (
            <ExerciseLibraryEditDialog
              canEditBuiltIn={canEditBuiltInExercises}
              exercise={libraryEditingExercise}
              exerciseLibrary={exerciseLibrary}
              onCancel={() => setLibraryEditingExercise(null)}
              onSaved={(savedExercise) => {
                setDetailExercise(savedExercise);
                setLibraryEditingExercise(null);
              }}
              session={authSession}
              setExerciseLibrary={setExerciseLibrary}
            />
          )}
        </>
      </div>
    </div>
  );
}
