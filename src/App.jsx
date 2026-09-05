/* global __BUILD_TIME__, __IS_NATIVE_BUILD__ */
import { useState, useEffect, useRef, useDeferredValue } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { writeTextToClipboard } from "./native/clipboard";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Cable,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Copy,
  Download,
  Dumbbell,
  Eye,
  History,
  Home,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { seedExercises } from "./data/seedExercises";
import { getRirForPlanWeek } from "./utils/rirPeriodization";
import {
  buildPrimaryMuscleSections,
  getPrimaryMuscleSectionTotal,
} from "./utils/primaryMuscleGroups";
import TemplateView from "./components/TemplateView";
import SessionView from "./components/SessionView";
import ExerciseView from "./components/ExerciseView";
import PlansView from "./components/PlansView";
import NutritionView from "./components/NutritionView";
import WeightPickerModal from "./components/WeightPickerModal";
import WorkoutCalendar, { CompletedWorkoutSheet } from "./components/WorkoutCalendar";
import {
  AppPageHeader,
  AppSectionCard,
  AppSectionHeading,
  AppStatusPill,
} from "./components/ui/AppSurface";
import NutritionBowlIcon from "./components/ui/NutritionBowlIcon";
import ExerciseArmIcon from "./components/ui/ExerciseArmIcon";
import PlansBrainIcon from "./components/ui/PlansBrainIcon";
import {
  clearLegacyEquipmentStorage,
  getSavedStorageVersion,
  loadWorkoutData,
  loadWorkoutDataFromIndexedDb,
  markStorageVersion,
  saveWorkoutData,
  saveWorkoutDataToIndexedDb,
  saveWorkoutSessionJournal,
} from "./storage/workoutStorage";
import {
  getCurrentSession,
  changePasswordWithCurrentPassword,
  getMyApprovalStatus,
  listAppUserApprovals,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
  updateAppUserApproval,
} from "./sync/auth";
import { isSupabaseConfigured, supabase } from "./sync/supabaseClient";
import { calculateE1RM, getLatestBodyWeightForDate } from "./utils/e1rm";
import {
  BENCHMARK_FAMILY_OPTIONS,
  getBenchmarkFamilyForExercise,
  isExerciseBenchmark,
} from "./utils/exerciseBenchmark";
import { findPlanWorkoutHistory } from "./utils/workoutHistoryLookup";
import {
  downloadExerciseLibraryWithPreferences,
  getCustomExercises,
  uploadExercisePreferences,
  uploadCustomExercises,
} from "./sync/exerciseCloudSync";
import { downloadWorkouts, uploadWorkouts } from "./sync/workoutCloudSync";
import {
  downloadWorkoutHistory,
  uploadWorkoutHistory,
} from "./sync/sessionCloudSync";
import { downloadPlans, uploadPlans } from "./sync/planCloudSync";
import {
  downloadPlateInventory,
  uploadPlateInventory,
} from "./sync/plateInventoryCloudSync";
import {
  flushNutritionOutbox,
  getNutritionOutbox,
  getNutritionPersistenceStatus,
  initializeNutritionPersistence,
  loadNutritionSnapshot,
  mergeNutritionEntryCollections,
  NUTRITION_OUTBOX_QUEUED_EVENT,
  persistNutritionEntries,
  queueNutritionUpserts,
  recoverNutritionEntries,
  reconcileNutritionEntries,
} from "./storage/nutritionStorage";
import { saveNutritionCompatibilityEntries } from "./storage/nutritionCompatibilityStorage";
import { findNutritionEntriesMissingFrom } from "./storage/nutritionIntegrity";
import { getNormalizedCloudSummary } from "./sync/normalizedCloudSummary";
import { downloadBodyWeightEntries } from "./sync/bodyMeasurementCloudSync";
import { downloadNutritionTargets } from "./sync/nutritionTargetCloudSync";
import {
  isRemoteWriteAllowed,
  skipBlockedRemoteWrite,
} from "./sync/remoteWritePolicy";

// STORAGE VERSION
const STORAGE_VERSION = 12;

const APP_VERSION = "0.16";

const BUILD_TIME = __BUILD_TIME__;

const HOME_WORKOUT_ICON = `${import.meta.env.BASE_URL}${
  __IS_NATIVE_BUILD__ ? "workout-icon-native.png" : "workout-icon.png"
}${__IS_NATIVE_BUILD__ ? "?v=6" : ""}`;

const PENDING_UPDATE_KEY = "pendingPwaUpdate";
const LAST_SEEN_BUILD_KEY = "lastSeenBuildTime";
const UPDATE_CONFIRMATION_KEY = "pwaUpdateConfirmation";
const UPDATE_CONFIRMATION_DURATION = 10 * 60 * 1000;
const LAST_AUTO_UPDATE_CHECK_KEY = "lastAutoPwaUpdateCheck";
const AUTO_UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;
const MANUAL_UPDATE_CHECK_TIMEOUT_MS = 20000;

const STARTUP_SPLASH_MINIMUM_MS = 1000;
const ACTIVE_WORKOUT_STARTUP_SPLASH_MINIMUM_MS = 150;
const AUTO_SYNC_CHECKPOINT_DELAY_MS = 350;
const AUTO_SYNC_SUPPRESS_MS = 4000;
const NORMALIZED_SYNC_TIMEOUT_MS = 90 * 1000;
const RECENT_HISTORY_SYNC_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const NORMALIZED_SYNC_DIRTY_KEY = "normalizedSyncDirty";
const NORMALIZED_SYNC_DIRTY_DOMAINS_KEY = "normalizedSyncDirtyDomains";
const LAST_NORMALIZED_SYNC_KEY = "lastNormalizedSyncAt";
const PLATE_INVENTORY_KEY = "equipmentPlateInventory";
const PLATE_INVENTORY_OWNER_KEY = "equipmentPlateInventoryOwner";
const APP_APPROVAL_CACHE_KEY_PREFIX = "appUserApproval:";
const APP_OWNER_EMAIL = "ihgold@comcast.net";
const NORMALIZED_SYNC_DOMAINS = [
  "exercisePreferences",
  "workouts",
  "history",
  "plans",
  "plateInventory",
];
const NORMALIZED_SYNC_DOMAIN_LABELS = {
  exercisePreferences: "exercise preferences",
  workouts: "workouts",
  history: "completed workouts",
  plans: "plans",
  plateInventory: "plate inventory",
};
const NORMALIZED_WORKOUT_RESET_TABLES = [
  "session_sets",
  "session_exercises",
  "workout_sessions",
  "training_plan_workouts",
  "training_plans",
  "workout_exercise_sets",
  "workout_exercises",
  "workouts",
  "import_batches",
  "workout_data_snapshots",
];

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

const DEFAULT_PLATE_INVENTORY = {
  oneInch: [
    { count: 0, id: "one-inch-10", weight: 10 },
    { count: 0, id: "one-inch-7-5", weight: 7.5 },
    { count: 0, id: "one-inch-5", weight: 5 },
    { count: 0, id: "one-inch-2-5", weight: 2.5 },
    { count: 0, id: "one-inch-1-25", weight: 1.25 },
  ],
  twoInch: [
    { count: 0, id: "two-inch-55", weight: 55 },
    { count: 0, id: "two-inch-45", weight: 45 },
    { count: 0, id: "two-inch-35", weight: 35 },
    { count: 0, id: "two-inch-25", weight: 25 },
    { count: 0, id: "two-inch-10", weight: 10 },
    { count: 0, id: "two-inch-5", weight: 5 },
    { count: 0, id: "two-inch-2-5", weight: 2.5 },
    { count: 0, id: "two-inch-1-25", weight: 1.25 },
  ],
};
const PLATE_COUNT_PICKER_VALUES = Array.from({ length: 41 }, (_, index) => index);
const EQUIPMENT_WEIGHT_PICKER_VALUES = Array.from(
  { length: 21 },
  (_, index) => index * 5
);
const LOAD_CALCULATOR_EQUIPMENT = [
  {
    categoryKey: "twoInch",
    defaultWeight: 45,
    id: "barbell",
    label: "Barbell",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "cable",
    label: "Cable",
    loadMode: "cable",
    weightConsidered: false,
  },
  {
    categoryKey: "oneInch",
    defaultWeight: 5,
    id: "dumbbell",
    label: "Dumbbells",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 15,
    id: "ezBar",
    label: "EZ Curl Bar",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "landmine",
    label: "Landmine",
    loadMode: "singleEnd",
    weightConsidered: false,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "machine",
    label: "Machine",
    loadMode: "stack",
    weightConsidered: false,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "smithMachine",
    label: "Smith Machine",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 50,
    id: "trapBar",
    label: "Trap Bar",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "tricepBar",
    label: "Tricep Bar",
    loadMode: "balanced",
    weightConsidered: true,
  },
];
const PLATE_WEIGHT_UNIT = 4;
const TWO_INCH_PLATE_STYLES = {
  "55": { background: "#d32f2f", border: "#9a1b1b", color: "#fff" },
  "45": { background: "#1565c0", border: "#0d47a1", color: "#fff" },
  "35": { background: "#fdd835", border: "#c6a700", color: "#111" },
  "23.75": { background: "#2e7d32", border: "#1b5e20", color: "#fff" },
  "25": { background: "#cfd8dc", border: "#90a4ae", color: "#111" },
  "15": { background: "#ef6c00", border: "#bf4f00", color: "#fff" },
  "10": { background: "#8e8e8e", border: "#6a6a6a", color: "#fff" },
  "5": { background: "#111", border: "#000", color: "#fff" },
  "2.5": { background: "#3f3f3f", border: "#262626", color: "#fff" },
  "1.25": { background: "#fff", border: "#d0d0d0", color: "#111" },
};
const LOAD_CALCULATOR_BAR_WIDTHS = {
  barbell: "100%",
  cable: "100%",
  landmine: "100%",
  smithMachine: "100%",
  trapBar: "100%",
  tricepBar: "100%",
  ezBar: "100%",
  dumbbell: "100%",
  machine: "100%",
};
const LOAD_CALCULATOR_BAR_COLUMNS = {
  barbell: "74px",
  cable: "28px",
  landmine: "74px",
  smithMachine: "74px",
  trapBar: "74px",
  tricepBar: "56px",
  ezBar: "56px",
  dumbbell: "37px",
  machine: "28px",
};
const MAX_PLATE_LOADING_OPTIONS_PER_SUM = 4;
const DEFAULT_EQUIPMENT_WEIGHTS = LOAD_CALCULATOR_EQUIPMENT.reduce(
  (weights, equipment) => ({
    ...weights,
    [equipment.id]: equipment.defaultWeight,
  }),
  {}
);

function formatPlateNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function comparePlateCombinations(a, b) {
  if (a.length !== b.length) {
    return a.length - b.length;
  }

  const aSorted = [...a].sort((first, second) => second - first);
  const bSorted = [...b].sort((first, second) => second - first);

  for (let index = 0; index < Math.max(aSorted.length, bSorted.length); index += 1) {
    const weightDifference = (bSorted[index] || 0) - (aSorted[index] || 0);

    if (weightDifference !== 0) {
      return weightDifference;
    }
  }

  return 0;
}

function rankPlateCombinations(combinations) {
  const uniqueCombinations = new Map();

  combinations.forEach((plates) => {
    const sortedPlates = [...plates].sort((a, b) => b - a);
    const key = sortedPlates.join("|");

    if (!uniqueCombinations.has(key)) {
      uniqueCombinations.set(key, sortedPlates);
    }
  });

  return Array.from(uniqueCombinations.values())
    .sort(comparePlateCombinations)
    .slice(0, MAX_PLATE_LOADING_OPTIONS_PER_SUM);
}

function getLoadCalculatorEquipment(equipmentId, inventory) {
  const baseEquipment =
    LOAD_CALCULATOR_EQUIPMENT.find((option) => option.id === equipmentId) ||
    LOAD_CALCULATOR_EQUIPMENT[0];
  const configuredWeight = Number(inventory?.equipmentWeights?.[baseEquipment.id]);
  const equipmentWeight = Number.isFinite(configuredWeight)
    ? Math.max(0, configuredWeight)
    : baseEquipment.defaultWeight;

  return {
    ...baseEquipment,
    configuredWeight: equipmentWeight,
    weight: baseEquipment.weightConsidered ? equipmentWeight : 0,
  };
}

function calculatePlateLoading(
  totalWeight,
  equipmentId,
  inventory,
  cablePulleyCount = 1,
  dumbbellCount = 1
) {
  const equipment = getLoadCalculatorEquipment(equipmentId, inventory);
  const enteredWeight = Number(totalWeight);
  const isDumbbellLoad = equipment.id === "dumbbell";
  const requestedWeight =
    isDumbbellLoad && Number(dumbbellCount) === 2
      ? enteredWeight / 2
      : enteredWeight;

  if (!Number.isFinite(requestedWeight) || requestedWeight <= 0) {
    return {
      equipment,
      status: "empty",
    };
  }

  const isBalancedLoad = equipment.loadMode === "balanced";
  const isCableLoad = equipment.loadMode === "cable";
  const requiresPairedPlates = isBalancedLoad || isCableLoad;
  const cableLoadMultiplier = Number(cablePulleyCount) === 2 ? 1 : 2;
  const loadedWeight = isBalancedLoad
    ? requestedWeight - equipment.weight
    : requestedWeight;

  if (loadedWeight < 0) {
    return {
      equipment,
      requestedWeight,
      status: "underBar",
    };
  }

  const targetLoad = isBalancedLoad
    ? loadedWeight / 2
    : isCableLoad
      ? loadedWeight / cableLoadMultiplier
      : loadedWeight;
  const targetLoadUnits = Math.round(targetLoad * PLATE_WEIGHT_UNIT);
  const availablePlates = (inventory[equipment.categoryKey] || [])
    .filter((plate) =>
      Number(plate.weight) !== 55 ||
      equipment.id === "barbell" ||
      equipment.id === "trapBar"
    )
    .filter((plate) =>
      requiresPairedPlates
        ? Number(plate.count) >= 2 && Number(plate.weight) > 0
        : Number(plate.count) >= 1 && Number(plate.weight) > 0
    )
    .sort((a, b) => b.weight - a.weight);
  const sums = new Map([[0, [[]]]]);

  availablePlates.forEach((plate) => {
    const plateUnits = Math.round(Number(plate.weight) * PLATE_WEIGHT_UNIT);
    const availableCount = requiresPairedPlates
      ? Math.floor(Number(plate.count) / 2)
      : Number(plate.count);

    for (let plateIndex = 0; plateIndex < availableCount; plateIndex += 1) {
      Array.from(sums.entries()).forEach(([sum, combinations]) => {
        const nextSum = sum + plateUnits;

        if (nextSum <= targetLoadUnits) {
          const nextCombinations = sums.get(nextSum) || [];

          sums.set(
            nextSum,
            rankPlateCombinations([
              ...nextCombinations,
              ...combinations.map((plates) => [
                ...plates,
                Number(plate.weight),
              ]),
            ])
          );
        }
      });
    }
  });

  const bestSumUnits = Math.max(...sums.keys());
  const loadingOptions = rankPlateCombinations(sums.get(bestSumUnits) || [[]]);
  const platesPerSide = loadingOptions[0] || [];
  const achievedPlateLoad = bestSumUnits / PLATE_WEIGHT_UNIT;
  const achievedTotal = isBalancedLoad
    ? equipment.weight + achievedPlateLoad * 2
    : isCableLoad
      ? achievedPlateLoad * cableLoadMultiplier
      : achievedPlateLoad;
  const leftPlates =
    equipment.loadMode === "balanced" || equipment.loadMode === "cable"
      ? platesPerSide
      : [];
  const rightPlates =
    equipment.loadMode === "balanced" ||
    equipment.loadMode === "singleEnd" ||
    equipment.loadMode === "cable"
      ? platesPerSide
      : [];
  const machinePlates = equipment.loadMode === "stack" ? platesPerSide : [];

  return {
    achievedTotal,
    difference: requestedWeight - achievedTotal,
    equipment,
    exact: bestSumUnits === targetLoadUnits,
    leftPlates,
    loadedWeight,
    loadingOptions,
    cablePulleyCount: Number(cablePulleyCount) === 2 ? 2 : 1,
    dumbbellCount: Number(dumbbellCount) === 2 ? 2 : 1,
    enteredWeight,
    machinePlates,
    platesPerSide,
    rightPlates,
    requestedWeight,
    status: "ready",
    targetLoad,
  };
}

function normalizePlateInventory(value) {
  const normalizeCategory = (categoryKey) => {
    const byWeight = new Map(
      (Array.isArray(value?.[categoryKey]) ? value[categoryKey] : [])
        .map((plate) => {
          const weight = Number(plate?.weight);
          const count = Math.max(0, Number.parseInt(plate?.count, 10) || 0);

          return Number.isFinite(weight) && weight > 0
            ? [String(weight), { count, id: plate.id || `${categoryKey}-${weight}`, weight }]
            : null;
        })
        .filter(Boolean)
    );

    DEFAULT_PLATE_INVENTORY[categoryKey].forEach((plate) => {
      if (!byWeight.has(String(plate.weight))) {
        byWeight.set(String(plate.weight), plate);
      }
    });

    return Array.from(byWeight.values()).sort((a, b) => b.weight - a.weight);
  };

  return {
    equipmentWeights: LOAD_CALCULATOR_EQUIPMENT.reduce((weights, equipment) => {
      const parsedWeight = Number(value?.equipmentWeights?.[equipment.id]);

      return {
        ...weights,
        [equipment.id]: Number.isFinite(parsedWeight)
          ? Math.max(0, parsedWeight)
          : DEFAULT_EQUIPMENT_WEIGHTS[equipment.id],
      };
    }, {}),
    oneInch: normalizeCategory("oneInch"),
    twoInch: normalizeCategory("twoInch"),
  };
}

function hasConfiguredPlateInventory(inventory) {
  const hasConfiguredPlates = ["oneInch", "twoInch"].some((categoryKey) =>
    (inventory?.[categoryKey] || []).some((plate) => Number(plate.count) > 0)
  );
  const hasConfiguredEquipment = LOAD_CALCULATOR_EQUIPMENT.some((equipment) => {
    const weight = Number(inventory?.equipmentWeights?.[equipment.id]);

    return (
      Number.isFinite(weight) &&
      weight !== DEFAULT_EQUIPMENT_WEIGHTS[equipment.id]
    );
  });

  return hasConfiguredPlates || hasConfiguredEquipment;
}

function readPlateInventory() {
  try {
    return normalizePlateInventory(
      JSON.parse(localStorage.getItem(PLATE_INVENTORY_KEY) || "null")
    );
  } catch (error) {
    console.error("Failed to read plate inventory:", error);
    return normalizePlateInventory(null);
  }
}

function readPlateInventoryOwner() {
  return localStorage.getItem(PLATE_INVENTORY_OWNER_KEY) || null;
}

function savePlateInventory(inventory) {
  safeSetLocalStorage(
    PLATE_INVENTORY_KEY,
    JSON.stringify(normalizePlateInventory(inventory))
  );
}

function savePlateInventoryOwner(userId) {
  if (userId) {
    safeSetLocalStorage(PLATE_INVENTORY_OWNER_KEY, userId);
    return;
  }

  localStorage.removeItem(PLATE_INVENTORY_OWNER_KEY);
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage:`, error);
  }
}

function getApprovalCacheKey(userId) {
  return `${APP_APPROVAL_CACHE_KEY_PREFIX}${userId}`;
}

function readApprovalCache(userId) {
  if (!userId) {
    return null;
  }

  try {
    return JSON.parse(localStorage.getItem(getApprovalCacheKey(userId)));
  } catch (error) {
    console.error("Failed to read approval cache:", error);
    return null;
  }
}

function writeApprovalCache(userId, approval) {
  if (!userId) {
    return;
  }

  safeSetLocalStorage(
    getApprovalCacheKey(userId),
    JSON.stringify({
      email: approval?.email || "",
      status: "approved",
      verifiedAt: new Date().toISOString(),
    })
  );
}

function clearApprovalCache(userId) {
  if (!userId) {
    return;
  }

  try {
    localStorage.removeItem(getApprovalCacheKey(userId));
  } catch (error) {
    console.error("Failed to clear approval cache:", error);
  }
}

function formatNormalizedSummary(summary) {
  const latest = summary.latestSession
    ? ` Latest: ${summary.latestSession.workout_name} on ${new Date(
        summary.latestSession.completed_at
      ).toLocaleDateString()}.`
    : "";
  const maxE1RM =
    summary.maxE1RM == null ? "" : ` Max e1RM stored: ${summary.maxE1RM.toFixed(1)}.`;
  const plateInventory =
    summary.plateInventory > 0 ? ` Plate inventory saved.` : "";

  return `${summary.exercises} exercises, ${summary.workouts} workouts, ${summary.workoutSessions} completed workouts, ${summary.sessionSets} completed sets.${latest}${maxE1RM}${plateInventory}`;
}

function formatHistoryTimestamp(workout) {
  const parsed = workout?.completedAtIso
    ? new Date(workout.completedAtIso)
    : workout?.completed_at
      ? new Date(workout.completed_at)
      : null;

  if (parsed && Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return workout?.completedAt || "unknown date";
}

const NUTRITION_LOG_KEY = "nutritionLogEntries";
const NUTRITION_SYNC_DEBOUNCE_MS = 90 * 1000;
const NUTRITION_SYNC_MAX_WAIT_MS = 5 * 60 * 1000;
const PENDING_SYNC_MAX_AGE_MS = 60 * 60 * 1000;
const PENDING_SYNC_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";
const DAILY_CALORIE_GOAL_KEY = "dailyCalorieGoal";
const DAILY_CALORIE_GOAL_HISTORY_KEY = "dailyCalorieGoalHistory";

function getNutritionLogStorageKey(userId) {
  return userId ? `${NUTRITION_LOG_KEY}:${userId}` : NUTRITION_LOG_KEY;
}

function getDailyCalorieGoalStorageKey(userId) {
  return userId ? `${DAILY_CALORIE_GOAL_KEY}:${userId}` : DAILY_CALORIE_GOAL_KEY;
}

function getDailyCalorieGoalHistoryStorageKey(userId) {
  return userId
    ? `${DAILY_CALORIE_GOAL_HISTORY_KEY}:${userId}`
    : DAILY_CALORIE_GOAL_HISTORY_KEY;
}

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");

    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Failed to read ${key}:`, error);

    return [];
  }
}

function saveLocalArray(key, entries) {
  return saveNutritionCompatibilityEntries(key, entries);
}

function preservePendingNutritionSupportChanges(bodyWeights, targets, pendingItems) {
  const bodyWeightsByDate = new Map(
    (bodyWeights || []).map((entry) => [entry.date, entry])
  );
  const targetsByDate = new Map(
    (targets || []).map((target) => [target.date, target])
  );

  pendingItems.forEach((item) => {
    if (item.operation === "body-weight-delete") {
      bodyWeightsByDate.delete(item.entryDate);
    } else if (item.operation === "body-weight-upsert" && item.entry?.date) {
      bodyWeightsByDate.set(item.entry.date, item.entry);
    } else if (
      item.operation === "nutrition-target-upsert" &&
      item.target?.date
    ) {
      targetsByDate.set(item.target.date, item.target);
    }
  });

  return {
    bodyWeights: [...bodyWeightsByDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    ),
    targets: [...targetsByDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    ),
  };
}

function getAuditLocalSummary(data) {
  const planTemplateIds = getPlanTemplateIdSet(data.plans);
  const planWorkouts = data.templates.filter(
    (template) => template.planId || planTemplateIds.has(String(template.id))
  ).length;
  const standaloneTemplates = data.templates.filter(
    (template) => !template.planId && !planTemplateIds.has(String(template.id))
  );
  const missingPlanWorkouts = data.plans.flatMap((plan) =>
    (plan.workouts || [])
      .filter(
        (workout) =>
          workout.templateId == null ||
          !data.templates.some(
            (template) => String(template.id) === String(workout.templateId)
          )
      )
      .map((workout) => ({
        planName: plan.name,
        templateId: workout.templateId,
        workoutName: workout.name,
      }))
  );
  const builtinExercises = data.exerciseLibrary.filter(
    (exercise) => exercise.builtin
  ).length;
  const customExercises = data.exerciseLibrary.filter(
    (exercise) => !exercise.builtin
  ).length;
  const activeExercises = data.exerciseLibrary.filter(
    (exercise) => exercise.active !== "inactive"
  ).length;
  const nutritionEntries = readLocalArray(NUTRITION_LOG_KEY);
  const bodyWeightEntries = readLocalArray(BODY_WEIGHT_LOG_KEY);

  return {
    activeExercises,
    bodyWeightEntries: bodyWeightEntries.length,
    builtinExercises,
    customExercises,
    exerciseMetadata: Object.keys(data.exerciseMetadata || {}).length,
    history: data.history.length,
    historyDetails: data.history.map((workout) => ({
      completedAt: workout.completedAt || "",
      completedAtIso: workout.completedAtIso || null,
      id: workout.id,
      planId: workout.planId || null,
      planWorkoutId: workout.planWorkoutId || null,
      templateId: workout.templateId || null,
      templateName: workout.templateName || workout.name || "Workout",
    })),
    missingPlanWorkouts,
    nutritionEntries: nutritionEntries.length,
    planWorkouts,
    plans: data.plans.length,
    sessionRecords: data.sessions.length,
    templateDetails: data.templates.map((template) => ({
      id: template.id,
      name: template.name,
      planId: template.planId || null,
      planWorkoutId: template.planWorkoutId || null,
    })),
    standaloneWorkoutNames: standaloneTemplates.map((template) => template.name),
    standaloneWorkouts: standaloneTemplates.length,
    templates: data.templates.length,
  };
}

function formatAuditLocalSummary(summary) {
  return `${summary.templates} workout templates (${summary.standaloneWorkouts} standalone, ${summary.planWorkouts} plan workouts), ${summary.plans} plans, ${summary.history} completed workouts, ${summary.sessionRecords} saved session records, ${summary.builtinExercises} built-in exercises, ${summary.customExercises} custom exercises, ${summary.activeExercises} active exercises, ${summary.nutritionEntries} nutrition entries, ${summary.bodyWeightEntries} body weight entries`;
}

function formatAuditNormalizedSummary(summary) {
  return `${summary.exercises} exercises, ${summary.exercisePreferences} exercise preferences, ${summary.workouts} workout rows, ${summary.trainingPlans} plans, ${summary.workoutSessions} completed workouts, ${summary.sessionSets} completed sets, ${summary.nutritionEntries} nutrition entries, ${summary.bodyMeasurements} body measurements`;
}

function parseHistoryMetricValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace("+", ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function findExerciseForHistoryExercise(historyExercise, exerciseLibrary = []) {
  const exerciseId = historyExercise?.exerciseId ?? historyExercise?.exercise_id;

  if (exerciseId !== undefined && exerciseId !== null) {
    const match = exerciseLibrary.find((exercise) => String(exercise.id) === String(exerciseId));

    if (match) {
      return {
        ...historyExercise,
        ...match,
      };
    }
  }

  return historyExercise;
}

function getHistorySetE1RM(set, exercise, bodyWeight) {
  if (set.isDropSet || set.is_drop_set) {
    return null;
  }

  const e1rm = calculateE1RM(
    parseHistoryMetricValue(set.actualWeight ?? set.actual_weight),
    parseHistoryMetricValue(set.actualReps ?? set.actual_reps),
    set.actualRir ?? set.actual_rir,
    null,
    null,
    null,
    {
      bodyWeight,
      exercise,
    }
  );

  return Number.isFinite(e1rm) ? e1rm : null;
}

function normalizeExportText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getExerciseEquipmentLabel(exercise) {
  const equipment = exercise?.equipment;

  return Array.isArray(equipment)
    ? equipment.filter(Boolean).join(", ")
    : String(equipment || "");
}

function getHistoryExerciseName(exercise) {
  return exercise?.name || exercise?.exerciseName || "Unknown exercise";
}

function getHistoryExerciseKey(exercise) {
  const exerciseId = exercise?.exerciseId ?? exercise?.exercise_id;

  if (exerciseId !== undefined && exerciseId !== null && exerciseId !== "") {
    return `id:${exerciseId}`;
  }

  return `name:${normalizeExportText(getHistoryExerciseName(exercise))}|${normalizeExportText(
    getExerciseEquipmentLabel(exercise)
  )}`;
}

function getWorkoutName(workout) {
  return workout?.templateName || workout?.workoutName || workout?.workout_name || workout?.name || "Workout";
}

function getHistoryWorkoutTime(workout) {
  const parsed = new Date(
    workout.completedAtIso || workout.completed_at || workout.completedAt || 0
  );

  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function getHistoryWorkoutIso(workout) {
  const source =
    workout?.completedAtIso ||
    workout?.completed_at ||
    workout?.completedAt ||
    "";
  const parsed = new Date(source);

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function formatExportNumber(value, digits = 1) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(digits);
}

function csvEscape(value) {
  const text = String(value ?? "");

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function buildExerciseHistoryExportOptions(history = [], exerciseLibrary = []) {
  const optionMap = new Map();

  history.forEach((workout) => {
    (workout.exercises || []).forEach((historyExercise) => {
      const exercise = findExerciseForHistoryExercise(historyExercise, exerciseLibrary);
      const key = getHistoryExerciseKey(exercise);
      const current = optionMap.get(key) || {
        equipment: getExerciseEquipmentLabel(exercise),
        key,
        latestTime: 0,
        name: getHistoryExerciseName(exercise),
        setCount: 0,
        workoutCount: 0,
      };

      current.latestTime = Math.max(current.latestTime, getHistoryWorkoutTime(workout));
      current.setCount += (historyExercise.sets || []).length;
      current.workoutCount += 1;
      optionMap.set(key, current);
    });
  });

  return [...optionMap.values()].sort((left, right) =>
    left.name.localeCompare(right.name) ||
    left.equipment.localeCompare(right.equipment)
  );
}

function buildExerciseHistoryExportRows({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
  selectedExerciseKeys = null,
}) {
  const selectedKeySet = selectedExerciseKeys
    ? new Set(selectedExerciseKeys.map(String))
    : null;
  const rows = [];

  [...history]
    .sort((left, right) => getHistoryWorkoutTime(left) - getHistoryWorkoutTime(right))
    .forEach((workout) => {
      const completedAtIso = getHistoryWorkoutIso(workout);
      const bodyWeight = getLatestBodyWeightForDate(
        bodyWeightEntries,
        completedAtIso || workout.completedAt || workout.completed_at
      );

      (workout.exercises || []).forEach((historyExercise) => {
        const exercise = findExerciseForHistoryExercise(historyExercise, exerciseLibrary);
        const exerciseKey = getHistoryExerciseKey(exercise);
        let dropSetIndex = 0;

        if (selectedKeySet && !selectedKeySet.has(exerciseKey)) {
          return;
        }

        (historyExercise.sets || []).forEach((set, setIndex) => {
          const isDropSet = Boolean(set.isDropSet || set.is_drop_set);
          const weight = parseHistoryMetricValue(set.actualWeight ?? set.actual_weight);
          const reps = parseHistoryMetricValue(set.actualReps ?? set.actual_reps);
          const rir = parseHistoryMetricValue(set.actualRir ?? set.actual_rir);
          const e1rm = getHistorySetE1RM(set, exercise, bodyWeight);

          rows.push({
            completed_date: completedAtIso ? completedAtIso.slice(0, 10) : "",
            completed_at: completedAtIso,
            workout_name: getWorkoutName(workout),
            workout_id: workout.id || workout.source_key || "",
            plan_id: workout.planId || workout.plan_id || "",
            plan_week: workout.planWeek || workout.plan_week || "",
            plan_workout_id: workout.planWorkoutId || workout.plan_workout_id || "",
            exercise_name: getHistoryExerciseName(exercise),
            exercise_id: exercise.exerciseId ?? exercise.exercise_id ?? exercise.id ?? "",
            equipment: getExerciseEquipmentLabel(exercise),
            set_number: set.setNumber || set.set_number || setIndex + 1,
            set_id: set.id || set.source_key || "",
            is_drop_set: isDropSet,
            drop_set_index: isDropSet ? ++dropSetIndex : "",
            weight: formatExportNumber(weight, 1),
            weight_unit: "lb",
            reps: formatExportNumber(reps, 0),
            rir: formatExportNumber(rir, 1),
            volume: formatExportNumber(
              Number.isFinite(weight) && Number.isFinite(reps) ? weight * reps : null,
              1
            ),
            e1rm: formatExportNumber(e1rm, 1),
            e1rm_unit: "lb",
            completed: set.completed ?? "",
          });
        });
      });
    });

  return rows;
}

function getCompletedWorkoutDurationSeconds(workout) {
  const duration = Number(
    workout?.durationSeconds ?? workout?.duration_seconds
  );

  return Number.isFinite(duration) && duration > 0
    ? Math.round(duration)
    : null;
}

function isCompletedWorkoutDeload(workout, plans = []) {
  if (workout?.isDeload || workout?.is_deload) {
    return true;
  }

  if (/\bdeload\b/i.test(getWorkoutName(workout))) {
    return true;
  }

  const plan = plans.find(
    (item) => String(item.id) === String(workout?.planId || workout?.plan_id)
  );
  const planWeek = Number(workout?.planWeek || workout?.plan_week);

  return Boolean(
    plan?.config?.deload &&
      planWeek &&
      planWeek === Number(plan.durationWeeks || 0) + 1
  );
}

function getWorkoutDurationGroupKey(workout, isDeload) {
  const planWorkoutId = workout?.planWorkoutId || workout?.plan_workout_id;

  if (planWorkoutId) {
    return `plan-workout:${planWorkoutId}:${isDeload ? "deload" : "training"}`;
  }

  const normalizedName = normalizeExportText(getWorkoutName(workout))
    .replace(/\bweek\s+\d+\b/g, " ")
    .replace(/\bdeload\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `name:${normalizedName}:${isDeload ? "deload" : "training"}`;
}

function buildCompletedWorkoutRows({ history = [], plans = [], limit = 90 }) {
  return [...history]
    .map((workout) => {
      const durationSeconds = getCompletedWorkoutDurationSeconds(workout);

      if (!durationSeconds) {
        return null;
      }

      const completedAt = getHistoryWorkoutIso(workout);
      const completedExercises = (workout.exercises || [])
        .map((exercise) => ({
          exercise,
          sets: (exercise.sets || []).filter(
            (set) => set.completed !== false && set.completed !== "false"
          ),
        }))
        .filter((entry) => entry.sets.length > 0);
      const completedSets = completedExercises.flatMap((entry) => entry.sets);
      const completedDropSets = completedSets.filter(
        (set) => set.isDropSet || set.is_drop_set
      );
      const completedWorkingSets = completedSets.filter(
        (set) => !set.isDropSet && !set.is_drop_set
      );
      const prescribedRestValues = completedSets
        .map((set) =>
          normalizeRestSeconds(
            firstExportValue(
              set.prescribedRestSeconds,
              set.restSeconds,
              set.rest_seconds
            )
          )
        )
        .filter(Boolean);
      const prescribedRestSeconds = prescribedRestValues.length
        ? prescribedRestValues.reduce((sum, value) => sum + value, 0)
        : null;
      const isDeload = isCompletedWorkoutDeload(workout, plans);

      return {
        completed_at: completedAt,
        completed_date: completedAt ? completedAt.slice(0, 10) : "",
        completed_drop_set_count: completedDropSets.length,
        completed_set_count: completedSets.length,
        completed_working_set_count: completedWorkingSets.length,
        duration_minutes: roundAiMetric(durationSeconds / 60, 1),
        duration_seconds: durationSeconds,
        exercise_count: completedExercises.length,
        group_key: getWorkoutDurationGroupKey(workout, isDeload),
        is_deload: isDeload,
        plan_id: workout.planId || workout.plan_id || "",
        plan_week: Number(workout.planWeek || workout.plan_week) || null,
        plan_workout_id:
          workout.planWorkoutId || workout.plan_workout_id || "",
        prescribed_rest_seconds_sum: prescribedRestSeconds,
        workout_id: workout.id || workout.source_key || "",
        workout_name: getWorkoutName(workout),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        Date.parse(right.completed_at || 0) - Date.parse(left.completed_at || 0)
    )
    .slice(0, limit);
}

function getMedianMetric(rows, field) {
  const values = rows
    .map((row) => Number(row[field]))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return null;
  }

  const middle = Math.floor(values.length / 2);

  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function summarizeWorkoutDurationRows(rows) {
  if (!rows.length) {
    return null;
  }

  const totalDuration = rows.reduce(
    (sum, row) => sum + row.duration_minutes,
    0
  );

  return {
    averageMinutes: roundAiMetric(totalDuration / rows.length, 1),
    latestDate: rows[0]?.completed_date || null,
    maximumMinutes: Math.max(...rows.map((row) => row.duration_minutes)),
    medianCompletedDropSets: roundAiMetric(
      getMedianMetric(rows, "completed_drop_set_count"),
      1
    ),
    medianCompletedWorkingSets: roundAiMetric(
      getMedianMetric(rows, "completed_working_set_count"),
      1
    ),
    medianExerciseCount: roundAiMetric(
      getMedianMetric(rows, "exercise_count"),
      1
    ),
    medianMinutes: roundAiMetric(getMedianMetric(rows, "duration_minutes"), 1),
    minimumMinutes: Math.min(...rows.map((row) => row.duration_minutes)),
    recentObservations: rows.slice(0, 8).map((row) => ({
      completedDropSets: row.completed_drop_set_count,
      completedWorkingSets: row.completed_working_set_count,
      date: row.completed_date,
      durationMinutes: row.duration_minutes,
      exerciseCount: row.exercise_count,
    })),
    sampleCount: rows.length,
  };
}

function buildWorkoutDurationSummary(completedWorkoutRows = []) {
  if (!completedWorkoutRows.length) {
    return {
      available: false,
      byWorkout: [],
      note: "No completed workouts with persisted duration were available.",
      overallRecent: null,
    };
  }

  const groups = new Map();

  completedWorkoutRows.forEach((row) => {
    const current = groups.get(row.group_key) || [];

    current.push(row);
    groups.set(row.group_key, current);
  });

  const byWorkout = [...groups.entries()]
    .map(([groupKey, rows]) => ({
      ...summarizeWorkoutDurationRows(rows),
      groupKey,
      isDeload: rows[0].is_deload,
      planWorkoutId: rows[0].plan_workout_id || null,
      workoutName: rows[0].workout_name,
    }))
    .sort(
      (left, right) =>
        String(right.latestDate).localeCompare(String(left.latestDate)) ||
        right.sampleCount - left.sampleCount
    )
    .slice(0, 30);

  return {
    available: true,
    byWorkout,
    deloadRecent: summarizeWorkoutDurationRows(
      completedWorkoutRows.filter((row) => row.is_deload)
    ),
    note:
      "Durations are active workout-timer time and exclude pauses. Group summaries use plan-workout identity when available, otherwise normalized workout name. Use medians and recent observations with exercise and completed-set counts; do not infer exact transition or actual-rest time.",
    normalTrainingRecent: summarizeWorkoutDurationRows(
      completedWorkoutRows.filter((row) => !row.is_deload)
    ),
    overallRecent: summarizeWorkoutDurationRows(completedWorkoutRows),
    rawWorkoutLimit: 90,
  };
}

function firstExportValue(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== "");

  return value == null ? "" : value;
}

function getPlanExportTotalWeeks(plan) {
  const durationWeeks = Number(plan?.durationWeeks) || 0;
  const weeklyPrescriptionWeeks = (plan?.workouts || []).flatMap((workout) =>
    Object.values(workout.weeklyPrescriptionsByPosition || {}).flatMap(
      (weeklyPrescriptions) =>
        Array.isArray(weeklyPrescriptions)
          ? weeklyPrescriptions.map((week) => Number(week.weekNumber) || 0)
          : []
    )
  );
  const maxPrescriptionWeek = Math.max(0, ...weeklyPrescriptionWeeks);
  const configuredTotalWeeks =
    durationWeeks + (plan?.config?.deload ? 1 : 0);

  return Math.max(configuredTotalWeeks, maxPrescriptionWeek, 1);
}

function getPlanExportTrainingWeeks(plan) {
  return Math.max(1, Number(plan?.durationWeeks) || 1);
}

function getPlanExportConfiguredTotalWeeks(plan) {
  return getPlanExportTrainingWeeks(plan) + (plan?.config?.deload ? 1 : 0);
}

function getPlanExportWeekRole(plan, weekNumber, weekPrescription = null) {
  const trainingWeeks = getPlanExportTrainingWeeks(plan);
  const deloadWeekNumber = plan?.config?.deload ? trainingWeeks + 1 : null;

  if (
    weekPrescription?.isDeload ||
    (deloadWeekNumber && Number(weekNumber) === Number(deloadWeekNumber))
  ) {
    return "deload";
  }

  if (Number(weekNumber) <= trainingWeeks) {
    return "training";
  }

  return "extension";
}

const PLAN_EXPORT_WORKOUT_TYPE_LABELS = {
  "full body": "full-body",
  "full-body": "full-body",
  lower: "lower",
  pull: "pull",
  push: "push",
  upper: "upper",
};
const PLAN_EXPORT_WORKOUT_TYPE_DISPLAY_LABELS = {
  "full-body": "Full Body",
  lower: "Lower",
  pull: "Pull",
  push: "Push",
  upper: "Upper",
};

const PLAN_EXPORT_WORKOUT_TYPE_SEQUENCE = {
  "type-3": ["push", "pull", "lower", "upper", "lower"],
  "type-5": ["push", "pull", "lower", "upper", "lower"],
};

function normalizePlanExportWorkoutType(value) {
  const normalized = normalizeExportText(value).replace(/-/g, " ");

  return PLAN_EXPORT_WORKOUT_TYPE_LABELS[normalized] || "";
}

function inferPlanExportWorkoutTypeFromName(workoutName) {
  const normalized = ` ${normalizeExportText(workoutName)} `;

  if (/\bfull body\b|\bfull-body\b/.test(normalized)) {
    return "full-body";
  }

  return ["push", "pull", "lower", "upper"].find((type) =>
    new RegExp(`\\b${type}\\b`).test(normalized)
  ) || "";
}

function getStoredPlanExportWorkoutType(planWorkout, template) {
  return (
    normalizePlanExportWorkoutType(planWorkout?.workoutType) ||
    normalizePlanExportWorkoutType(template?.workoutType) ||
    normalizePlanExportWorkoutType(planWorkout?.workoutTypeLabel) ||
    normalizePlanExportWorkoutType(template?.workoutTypeLabel)
  );
}

function getPlanExportWorkoutType({
  plan,
  planWorkout,
  template,
  workoutIndex,
  workoutName,
}) {
  const inferredFromName = inferPlanExportWorkoutTypeFromName(workoutName);
  const storedWorkoutType = getStoredPlanExportWorkoutType(planWorkout, template);
  const sequenceType =
    PLAN_EXPORT_WORKOUT_TYPE_SEQUENCE[plan?.planType]?.[
      workoutIndex % PLAN_EXPORT_WORKOUT_TYPE_SEQUENCE[plan?.planType].length
    ] || "";

  return {
    source:
      inferredFromName
        ? "workout_name"
        : sequenceType
          ? "plan_type_sequence"
          : storedWorkoutType
            ? "stored_metadata"
            : "",
    storedWorkoutType,
    workoutType: inferredFromName || sequenceType || storedWorkoutType,
  };
}

function normalizeStoredPlanWorkoutTypes(plans = [], templates = []) {
  const templateById = new Map(
    templates.map((template) => [String(template.id), template])
  );
  const repairedLinksByTemplateId = new Map();
  const nextPlans = plans.map((plan) => ({
    ...plan,
    workouts: (plan.workouts || []).map((workout, workoutIndex) => {
      const template =
        workout.templateId != null
          ? templateById.get(String(workout.templateId))
          : null;
      const workoutName =
        template?.name || workout.name || `Workout ${workoutIndex + 1}`;
      const typeInfo = getPlanExportWorkoutType({
        plan,
        planWorkout: workout,
        template,
        workoutIndex,
        workoutName,
      });
      const workoutType = typeInfo.workoutType || workout.workoutType || null;
      const workoutTypeLabel =
        workoutType
          ? PLAN_EXPORT_WORKOUT_TYPE_DISPLAY_LABELS[workoutType] ||
            workout.workoutTypeLabel ||
            template?.workoutTypeLabel ||
            null
          : workout.workoutTypeLabel || null;
      const nextWorkout = {
        ...workout,
        workoutType,
        workoutTypeLabel,
      };

      if (workout.templateId != null) {
        repairedLinksByTemplateId.set(String(workout.templateId), {
          workoutType,
          workoutTypeLabel,
        });
      }

      return nextWorkout;
    }),
  }));
  const nextTemplates = templates.map((template) => {
    const repairedLink = repairedLinksByTemplateId.get(String(template.id));

    return repairedLink
      ? {
          ...template,
          workoutType: repairedLink.workoutType,
          workoutTypeLabel: repairedLink.workoutTypeLabel,
        }
      : template;
  });

  return {
    plans: nextPlans,
    templates: nextTemplates,
  };
}

function normalizeWorkoutDataPlanTypes(data) {
  const normalizedPlanData = normalizeStoredPlanWorkoutTypes(
    data?.plans,
    data?.templates
  );

  return {
    ...data,
    plans: normalizedPlanData.plans,
    templates: normalizedPlanData.templates,
  };
}

function getPlanExportWorkoutTemplate(plan, planWorkout, templates = []) {
  return (
    templates.find(
      (template) =>
        planWorkout?.templateId != null &&
        String(template.id) === String(planWorkout.templateId)
    ) ||
    templates.find(
      (template) =>
        planWorkout?.planWorkoutId != null &&
        String(template.planWorkoutId || "") === String(planWorkout.planWorkoutId)
    ) ||
    templates.find(
      (template) =>
        String(template.planId || "") === String(plan?.id || "") &&
        template.name === planWorkout?.name
    ) ||
    null
  );
}

function getPlanPrimaryMuscleSetSummary(
  plan,
  templates = [],
  exerciseLibrary = []
) {
  const muscleSets = {};

  (plan?.workouts || []).forEach((planWorkout) => {
    const template = getPlanExportWorkoutTemplate(plan, planWorkout, templates);
    const exercises = template?.exercises || planWorkout.exercises || [];

    exercises.forEach((exercise) => {
      const currentExercise = findExerciseForHistoryExercise(
        exercise,
        exerciseLibrary
      );
      const muscle =
        currentExercise.muscles?.[0] || exercise.planMuscle || "Unknown";
      const setCount = (exercise.sets || []).length;

      muscleSets[muscle] = (muscleSets[muscle] || 0) + setCount;
    });
  });

  return muscleSets;
}

function getPlanCompareLabel(plan) {
  const name = plan?.name || "Plan";

  if (plan?.status === "active") {
    return `${name} (Active)`;
  }

  return name;
}

function getPlanExportSetCount(exercise, weekPrescription) {
  return Math.max(
    1,
    Number(weekPrescription?.sets) || (exercise?.sets || []).length || 1
  );
}

function getPlanSetReps(set, weekPrescription, plan) {
  return firstExportValue(
    weekPrescription?.reps,
    set?.prescribedReps,
    set?.reps,
    set?.targetReps,
    plan?.config?.reps
  );
}

function getPlanSetMinimumReps(set, weekPrescription) {
  return firstExportValue(
    weekPrescription?.minimumReps,
    weekPrescription?.minimum_reps,
    set?.prescribedMinimumReps,
    set?.minimumReps,
    set?.minimum_reps,
    set?.targetMinimumReps
  );
}

function getPlanSetRir(set, weekPrescription, plan, weekNumber) {
  if (weekPrescription?.rir !== undefined && weekPrescription?.rir !== null && weekPrescription?.rir !== "") {
    return weekPrescription.rir;
  }

  const fallbackRir = firstExportValue(
    set?.prescribedRir,
    set?.rir,
    set?.targetRir,
    plan?.config?.rir
  );

  return getRirForPlanWeek({
    durationWeeks: plan?.durationWeeks,
    initialRir: fallbackRir,
    mode: plan?.config?.rirPeriodization,
    weekNumber,
  });
}

function normalizeRestSeconds(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function getPlanSetRestSeconds(set, weekPrescription, exercise) {
  return normalizeRestSeconds(
    firstExportValue(
      weekPrescription?.restSeconds,
      weekPrescription?.rest_seconds,
      set?.prescribedRestSeconds,
      set?.restSeconds,
      set?.rest_seconds,
      exercise?.restSeconds,
      exercise?.rest_seconds
    )
  );
}

function buildPlanExportOptions(plans = []) {
  return [...plans]
    .sort((left, right) =>
      String(left.name || "").localeCompare(String(right.name || ""))
    )
    .map((plan) => ({
      id: String(plan.id),
      name: plan.name || "Training Plan",
      status: plan.status || "",
      totalWeeks: getPlanExportTotalWeeks(plan),
      workoutsPerWeek: plan.workouts?.length || plan.daysPerWeek || 0,
    }));
}

function normalizeSupportedPlanJsonNumber(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : value;
}

function buildSupportedPlanJson({ plan, templates = [] }) {
  const workouts = [...(plan?.workouts || [])]
    .sort(
      (left, right) =>
        (Number(left.dayNumber) || Number(left.position) || 0) -
        (Number(right.dayNumber) || Number(right.position) || 0)
    )
    .map((planWorkout, workoutIndex) => {
      const template = getPlanExportWorkoutTemplate(
        plan,
        planWorkout,
        templates
      );
      const exercises = template?.exercises || planWorkout.exercises || [];
      const workoutName =
        template?.name || planWorkout.name || `Workout ${workoutIndex + 1}`;
      const workoutType = getPlanExportWorkoutType({
        plan,
        planWorkout,
        template,
        workoutIndex,
        workoutName,
      }).workoutType;

      return {
        dayNumber: Number(planWorkout.dayNumber) || workoutIndex + 1,
        name: workoutName,
        ...(workoutType ? { workoutType } : {}),
        exercises: exercises.map((exercise, exerciseIndex) => {
          const weeklyPrescriptions =
            exercise.weeklyPrescriptions ||
            planWorkout.weeklyPrescriptionsByPosition?.[exerciseIndex + 1] ||
            [];
          const exerciseRestSeconds = normalizeRestSeconds(
            firstExportValue(
              exercise.restSeconds,
              exercise.rest_seconds,
              exercise.sets?.[0]?.prescribedRestSeconds,
              exercise.sets?.[0]?.restSeconds,
              exercise.sets?.[0]?.rest_seconds
            )
          );
          const exerciseDropSetCount = (exercise.sets || []).filter(
            (set) => set.isDropSet || set.is_drop_set
          ).length;

          return {
            name: exercise.name || "Exercise",
            equipment: exercise.equipment || "",
            ...(exercise.planMuscle
              ? { planMuscle: exercise.planMuscle }
              : {}),
            ...(exercise.supersetGroup
              ? { supersetGroup: exercise.supersetGroup }
              : {}),
            ...(exerciseRestSeconds ? { restSeconds: exerciseRestSeconds } : {}),
            ...(exerciseDropSetCount > 0
              ? { dropSets: exerciseDropSetCount }
              : {}),
            sets: (exercise.sets || [])
              .filter((set) => !set.isDropSet && !set.is_drop_set)
              .map((set) => {
              const reps = firstExportValue(
                set.prescribedReps,
                set.reps,
                set.targetReps,
                plan?.config?.reps
              );
              const minimumReps = getPlanSetMinimumReps(set, null);
              const rir = firstExportValue(
                set.prescribedRir,
                set.rir,
                set.targetRir,
                plan?.config?.rir
              );
              const restSeconds = getPlanSetRestSeconds(set, null, exercise);

                return {
                  reps: normalizeSupportedPlanJsonNumber(reps),
                  ...(minimumReps === ""
                    ? {}
                    : {
                        minimumReps:
                          normalizeSupportedPlanJsonNumber(minimumReps),
                      }),
                  rir: normalizeSupportedPlanJsonNumber(rir),
                  ...(restSeconds ? { restSeconds } : {}),
                };
              }),
            ...(weeklyPrescriptions.length > 0
              ? {
                  weeklyPrescriptions: weeklyPrescriptions.map((week) => {
                    const storedMinimumReps = getPlanSetMinimumReps(null, week);
                    const minimumReps =
                      storedMinimumReps !== "" || !week.isDeload
                        ? storedMinimumReps
                        : getPlanSetMinimumReps(
                            null,
                            weeklyPrescriptions.find(
                              (candidate) => !candidate.isDeload
                            )
                          );
                    const restSeconds = normalizeRestSeconds(
                      firstExportValue(
                        week.restSeconds,
                        week.rest_seconds,
                        exerciseRestSeconds
                      )
                    );

                    return {
                      weekNumber: Number(week.weekNumber),
                      sets: Number(week.sets),
                      ...((week.dropSets ?? week.drop_sets) == null
                        ? {}
                        : {
                            dropSets: getAiDraftDropSetCount(
                              week.dropSets ?? week.drop_sets
                            ),
                          }),
                      reps: normalizeSupportedPlanJsonNumber(week.reps),
                      ...(minimumReps === ""
                        ? {}
                        : {
                            minimumReps:
                              normalizeSupportedPlanJsonNumber(minimumReps),
                          }),
                      rir: normalizeSupportedPlanJsonNumber(week.rir),
                      ...(restSeconds ? { restSeconds } : {}),
                      ...(week.isDeload ? { isDeload: true } : {}),
                    };
                  }),
                }
              : {}),
          };
        }),
      };
    });
  const configuredDeloadWeeks = Number(plan?.config?.deloadWeeks);
  const deloadWeeks = Number.isFinite(configuredDeloadWeeks)
    ? Math.max(0, configuredDeloadWeeks)
    : plan?.config?.deload
      ? 1
      : 0;

  return {
    schema: "workout-app.ai-plan-draft.v1",
    ...(plan?.aiAnalysis ? { analysis: plan.aiAnalysis } : {}),
    plan: {
      name: plan?.name || "Training Plan",
      goal: plan?.goal || plan?.config?.goal || "progress",
      planType: plan?.planType || plan?.config?.planType || "ai",
      trainingWeeks: getPlanExportTrainingWeeks(plan),
      deloadWeeks,
      daysPerWeek: Number(plan?.daysPerWeek) || workouts.length,
      ...(plan?.config?.reps !== undefined
        ? { reps: normalizeSupportedPlanJsonNumber(plan.config.reps) }
        : {}),
      ...(plan?.config?.rir !== undefined
        ? { rir: normalizeSupportedPlanJsonNumber(plan.config.rir) }
        : {}),
      ...(plan?.config?.sets !== undefined
        ? { sets: normalizeSupportedPlanJsonNumber(plan.config.sets) }
        : {}),
      ...(plan?.config?.rirPeriodization
        ? { rirPeriodization: plan.config.rirPeriodization }
        : {}),
    },
    workouts,
  };
}

function buildPlanExportRows({ plans = [], selectedPlanIds = null, templates = [] }) {
  const selectedIdSet = selectedPlanIds
    ? new Set(selectedPlanIds.map(String))
    : null;
  const rows = [];

  plans
    .filter((plan) => !selectedIdSet || selectedIdSet.has(String(plan.id)))
    .sort((left, right) =>
      String(left.name || "").localeCompare(String(right.name || ""))
    )
    .forEach((plan) => {
      const totalWeeks = getPlanExportTotalWeeks(plan);
      const workouts = [...(plan.workouts || [])].sort(
        (left, right) =>
          (Number(left.dayNumber) || Number(left.position) || 0) -
          (Number(right.dayNumber) || Number(right.position) || 0)
      );

      Array.from({ length: totalWeeks }, (_, index) => index + 1).forEach(
        (weekNumber) => {
          workouts.forEach((planWorkout, workoutIndex) => {
            const template = getPlanExportWorkoutTemplate(
              plan,
              planWorkout,
              templates
            );
            const exercises = template?.exercises || planWorkout.exercises || [];
            const workoutName =
              template?.name || planWorkout.name || `Workout ${workoutIndex + 1}`;
            const workoutTypeInfo = getPlanExportWorkoutType({
              plan,
              planWorkout,
              template,
              workoutIndex,
              workoutName,
            });
            const weekRole = getPlanExportWeekRole(plan, weekNumber);

            if (exercises.length === 0) {
              rows.push({
                plan_id: plan.id,
                plan_name: plan.name || "",
                plan_status: plan.status || "",
                plan_type: plan.planType || plan.config?.planType || "",
                plan_goal: plan.goal || plan.config?.goal || "",
                total_weeks: totalWeeks,
                training_weeks: getPlanExportTrainingWeeks(plan),
                configured_total_weeks: getPlanExportConfiguredTotalWeeks(plan),
                workouts_per_week: workouts.length || plan.daysPerWeek || "",
                current_week: plan.currentWeek || "",
                week_number: weekNumber,
                week_role: weekRole,
                is_deload_week: weekRole === "deload",
                workout_day: planWorkout.dayNumber || workoutIndex + 1,
                plan_workout_id: planWorkout.planWorkoutId || "",
                workout_name: workoutName,
                workout_type: workoutTypeInfo.workoutType,
                stored_workout_type: workoutTypeInfo.storedWorkoutType,
                workout_type_source: workoutTypeInfo.source,
                exercise_position: "",
                exercise_name: "",
                exercise_id: "",
                equipment: "",
                superset_group: "",
                set_number: "",
                prescribed_sets: "",
                prescribed_drop_sets: "",
                prescribed_reps: "",
                prescribed_minimum_reps: "",
                prescribed_rir: "",
                rest_seconds: "",
              });
              return;
            }

            exercises.forEach((exercise, exerciseIndex) => {
              const weeklyPrescriptions =
                exercise.weeklyPrescriptions ||
                planWorkout.weeklyPrescriptionsByPosition?.[exerciseIndex + 1] ||
                [];
              const weekPrescription =
                weeklyPrescriptions.find(
                  (week) => Number(week.weekNumber) === Number(weekNumber)
                ) || null;
              const prescribedSets = getPlanExportSetCount(
                exercise,
                weekPrescription
              );
              const weeklyDropSets =
                weekPrescription?.dropSets ?? weekPrescription?.drop_sets;
              const exerciseDropSets = exercise.dropSets ?? exercise.drop_sets;
              const prescribedDropSets = getAiDraftDropSetCount(
                weeklyDropSets ??
                  exerciseDropSets ??
                  (exercise.sets || []).filter(
                    (set) => set.isDropSet || set.is_drop_set
                  ).length
              );
              const exerciseWeekRole = getPlanExportWeekRole(
                plan,
                weekNumber,
                weekPrescription
              );

              Array.from({ length: prescribedSets }, (_, setIndex) => {
                const set = exercise.sets?.[setIndex] || exercise.sets?.at(-1) || {};

                return {
                  plan_id: plan.id,
                  plan_name: plan.name || "",
                  plan_status: plan.status || "",
                  plan_type: plan.planType || plan.config?.planType || "",
                  plan_goal: plan.goal || plan.config?.goal || "",
                  total_weeks: totalWeeks,
                  training_weeks: getPlanExportTrainingWeeks(plan),
                  configured_total_weeks: getPlanExportConfiguredTotalWeeks(plan),
                  workouts_per_week: workouts.length || plan.daysPerWeek || "",
                  current_week: plan.currentWeek || "",
                  week_number: weekNumber,
                  week_role: exerciseWeekRole,
                  is_deload_week: exerciseWeekRole === "deload",
                  workout_day: planWorkout.dayNumber || workoutIndex + 1,
                  plan_workout_id: planWorkout.planWorkoutId || "",
                  workout_name: workoutName,
                  workout_type: workoutTypeInfo.workoutType,
                  stored_workout_type: workoutTypeInfo.storedWorkoutType,
                  workout_type_source: workoutTypeInfo.source,
                  exercise_position: exerciseIndex + 1,
                  exercise_name: exercise.name || "",
                  exercise_id: exercise.exerciseId || exercise.id || "",
                  equipment: getExerciseEquipmentLabel(exercise),
                  superset_group: exercise.supersetGroup || "",
                  set_number: setIndex + 1,
                  prescribed_sets: prescribedSets,
                  prescribed_drop_sets: prescribedDropSets,
                  prescribed_reps: getPlanSetReps(set, weekPrescription, plan),
                  prescribed_minimum_reps: getPlanSetMinimumReps(
                    set,
                    weekPrescription
                  ),
                  prescribed_rir: getPlanSetRir(
                    set,
                    weekPrescription,
                    plan,
                    weekNumber
                  ),
                  rest_seconds:
                    getPlanSetRestSeconds(set, weekPrescription, exercise) || "",
                };
              }).forEach((row) => rows.push(row));
            });
          });
        }
      );
    });

  return rows;
}

function getExerciseExposureKey(exercise) {
  return `${normalizeExportText(exercise?.name)}|${normalizeExportText(
    getExerciseEquipmentLabel(exercise)
  )}`;
}

function buildRecentPlanExposureContext({
  exerciseLibrary = [],
  history = [],
  plans = [],
  templates = [],
}) {
  const sortedPlans = [...plans]
    .filter(
      (plan) =>
        plan.status !== "draft-deleted" &&
        !(plan.status === "inactive" && plan.aiAnalysis)
    )
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "");

      return (
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0)
      );
    });
  const exposureByKey = new Map();
  const performanceByKey = new Map();

  history.forEach((workout) => {
    const workoutTime = getHistoryWorkoutTime(workout);
    const workoutDate = getHistoryWorkoutIso(workout).slice(0, 10);

    (workout.exercises || []).forEach((historyExercise) => {
      const exercise = findExerciseForHistoryExercise(
        historyExercise,
        exerciseLibrary
      );
      const key = getExerciseExposureKey(exercise);
      const current = performanceByKey.get(key) || {
        completedSets: 0,
        completedWorkoutCount: 0,
        latestDate: "",
        latestTime: 0,
        workoutTimes: [],
      };
      const completedSets = (historyExercise.sets || []).filter(
        (set) => set.completed !== false && set.completed !== "false"
      ).length;

      if (completedSets === 0) {
        return;
      }

      current.completedSets += completedSets;
      current.completedWorkoutCount += 1;
      current.workoutTimes.push(workoutTime);

      if (workoutTime > current.latestTime) {
        current.latestDate = workoutDate;
        current.latestTime = workoutTime;
      }

      performanceByKey.set(key, current);
    });
  });

  const latestPerformanceTime = Math.max(
    0,
    ...[...performanceByKey.values()].flatMap((performance) =>
      performance.workoutTimes.filter((time) => Number.isFinite(time))
    )
  );
  const recentPerformanceCutoff = latestPerformanceTime - 120 * 24 * 60 * 60 * 1000;

  sortedPlans.forEach((plan, planIndex) => {
    const totalWeeks = getPlanExportTotalWeeks(plan);
    const exercisesInPlan = new Map();

    (plan.workouts || []).forEach((planWorkout) => {
      const template = getPlanExportWorkoutTemplate(plan, planWorkout, templates);

      (template?.exercises || planWorkout.exercises || []).forEach((exercise) => {
        if (!exercise?.name) {
          return;
        }

        const key = getExerciseExposureKey(exercise);
        const current = exercisesInPlan.get(key) || {
          equipment: getExerciseEquipmentLabel(exercise),
          exerciseId: exercise.exerciseId || exercise.id || "",
          name: exercise.name,
          workouts: new Set(),
        };

        current.workouts.add(template?.name || planWorkout.name || "");
        exercisesInPlan.set(key, current);
      });
    });

    exercisesInPlan.forEach((planExposure, key) => {
      const current = exposureByKey.get(key) || {
        equipment: planExposure.equipment,
        exerciseId: planExposure.exerciseId,
        name: planExposure.name,
        planIndexes: [],
        planNames: [],
        programmedTrainingWeeks: 0,
        programmedTotalWeeks: 0,
        programmedWorkoutExposures: 0,
      };

      current.planIndexes.push(planIndex);
      current.planNames.push(plan.name || "Training Plan");
      current.programmedTrainingWeeks += getPlanExportTrainingWeeks(plan);
      current.programmedTotalWeeks += totalWeeks;
      current.programmedWorkoutExposures += planExposure.workouts.size;
      exposureByKey.set(key, current);
    });
  });

  return [...exposureByKey.values()]
    .map((exposure) => {
      let consecutiveRecentPlans = 0;

      while (exposure.planIndexes.includes(consecutiveRecentPlans)) {
        consecutiveRecentPlans += 1;
      }

      const recentPlans = exposure.planNames.slice(0, consecutiveRecentPlans);
      const performance = performanceByKey.get(
        `${normalizeExportText(exposure.name)}|${normalizeExportText(
          exposure.equipment
        )}`
      );

      return {
        completedSets: performance?.completedSets || 0,
        completedWorkoutCount: performance?.completedWorkoutCount || 0,
        consecutiveRecentPlans,
        consecutiveRecentTrainingWeeks: sortedPlans
          .slice(0, consecutiveRecentPlans)
          .reduce(
            (sum, plan) => sum + getPlanExportTrainingWeeks(plan),
            0
          ),
        equipment: exposure.equipment,
        exerciseId: exposure.exerciseId,
        lastPerformedDate: performance?.latestDate || "",
        name: exposure.name,
        note:
          "Counts programmed exposure in saved plans/templates plus completed workout recency. Use this to identify non-benchmark exercises that may be stale and candidates for rotation.",
        programmedPlanCount: exposure.planIndexes.length,
        programmedTotalWeeks: exposure.programmedTotalWeeks,
        programmedTrainingWeeks: exposure.programmedTrainingWeeks,
        programmedWorkoutExposures: exposure.programmedWorkoutExposures,
        recentPlanNames: recentPlans,
        workoutsPast120Days: performance
          ? performance.workoutTimes.filter(
              (time) => time >= recentPerformanceCutoff
            ).length
          : 0,
      };
    })
    .filter(
      (exposure) =>
        exposure.consecutiveRecentPlans > 0 || exposure.programmedPlanCount > 1
    )
    .sort((left, right) => {
      const consecutiveDiff =
        right.consecutiveRecentTrainingWeeks -
        left.consecutiveRecentTrainingWeeks;

      if (consecutiveDiff !== 0) {
        return consecutiveDiff;
      }

      return right.programmedTrainingWeeks - left.programmedTrainingWeeks;
    })
    .slice(0, 80);
}

function buildPreviousPlanAiContext({ plans = [] }) {
  return [...plans]
    .filter((plan) => {
      if (!plan.aiAnalysis || plan.status === "draft-deleted") {
        return false;
      }

      return (
        plan.status === "active" ||
        plan.status === "completed" ||
        (plan.completions || []).length > 0
      );
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "");

      return (
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0)
      );
    })
    .slice(0, 5)
    .map((plan) => {
      const completedWeeks = [
        ...new Set(
          (plan.completions || [])
            .map((completion) => Number(completion.weekNumber) || null)
            .filter(Boolean)
        ),
      ].sort((left, right) => left - right);

      return {
        completedWeeks,
        currentWeek: plan.currentWeek || 1,
        planId: String(plan.id),
        planName: plan.name || "Training Plan",
        planStatus: plan.status || "inactive",
        rationale: plan.aiAnalysis.rationale || [],
        summary: plan.aiAnalysis.summary || "",
        trainingWeeks: getPlanExportTrainingWeeks(plan),
        watchNext: plan.aiAnalysis.watchNext || [],
      };
    });
}

function roundAiMetric(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function parseAiTargetRange(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const matches = [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
    Number.parseFloat(match[0])
  );

  if (matches.length === 0 || matches.some((number) => !Number.isFinite(number))) {
    return null;
  }

  return {
    max: Math.max(...matches),
    min: Math.min(...matches),
  };
}

function getExerciseLibraryMatchFromExport(row, exerciseLibrary = []) {
  const rowExerciseId = row.exercise_id || row.exerciseId;

  if (rowExerciseId !== undefined && rowExerciseId !== null && rowExerciseId !== "") {
    const idMatch = exerciseLibrary.find(
      (exercise) => String(exercise.id) === String(rowExerciseId)
    );

    if (idMatch) {
      return idMatch;
    }
  }

  const rowName = normalizeExportText(row.exercise_name || row.name);
  const rowEquipment = normalizeExportText(row.equipment);

  return (
    exerciseLibrary.find(
      (exercise) =>
        normalizeExportText(exercise.name) === rowName &&
        normalizeExportText(getExerciseEquipmentLabel(exercise)) === rowEquipment
    ) ||
    exerciseLibrary.find((exercise) => normalizeExportText(exercise.name) === rowName) ||
    null
  );
}

function getPrimaryMuscleForExportRow(row, exerciseLibrary = []) {
  const exercise = getExerciseLibraryMatchFromExport(row, exerciseLibrary);

  return exercise?.muscles?.[0] || row.plan_muscle || "Unknown";
}

function getPlanSortTime(plan) {
  const parsed = Date.parse(plan?.updatedAt || plan?.createdAt || "");

  return Number.isFinite(parsed) ? parsed : 0;
}

function isRealPlanForAiContext(plan) {
  return (
    plan?.status !== "draft-deleted" &&
    !(plan?.status === "inactive" && plan?.aiAnalysis)
  );
}

function isPerformedPlanForAiContext(plan) {
  return (
    isRealPlanForAiContext(plan) &&
    (plan?.status === "active" ||
      plan?.status === "completed" ||
      (plan?.completions || []).length > 0)
  );
}

function summarizePlanWeeklyMuscleVolume({
  exerciseLibrary = [],
  plan,
  rows = [],
}) {
  if (!plan) {
    return null;
  }

  const weekMap = new Map();

  rows
    .filter(
      (row) =>
        String(row.plan_id) === String(plan.id) &&
        row.week_role === "training" &&
        row.exercise_name &&
        row.set_number !== ""
    )
    .forEach((row) => {
      const weekNumber = Number(row.week_number) || 0;
      const muscle = getPrimaryMuscleForExportRow(row, exerciseLibrary);

      if (!weekNumber || !muscle) {
        return;
      }

      const current = weekMap.get(weekNumber) || {};

      current[muscle] = (current[muscle] || 0) + 1;
      weekMap.set(weekNumber, current);
    });

  const weekly = [...weekMap.entries()]
    .sort(([leftWeek], [rightWeek]) => leftWeek - rightWeek)
    .map(([weekNumber, muscleSets]) => ({
      muscleSets,
      weekNumber,
    }));
  const averageByMuscle = {};

  weekly.forEach((week) => {
    Object.entries(week.muscleSets).forEach(([muscle, sets]) => {
      averageByMuscle[muscle] = (averageByMuscle[muscle] || 0) + sets;
    });
  });

  Object.keys(averageByMuscle).forEach((muscle) => {
    averageByMuscle[muscle] = roundAiMetric(
      averageByMuscle[muscle] / Math.max(weekly.length, 1),
      1
    );
  });

  return {
    averageWeeklySetsByPrimaryMuscle: averageByMuscle,
    planId: String(plan.id),
    planName: plan.name || "Training Plan",
    planStatus: plan.status || "inactive",
    trainingWeeks: getPlanExportTrainingWeeks(plan),
    weekly,
  };
}

function buildWeeklyMuscleVolumeSummary({
  exerciseLibrary = [],
  plans = [],
  templates = [],
}) {
  const realPlans = [...plans]
    .filter(isRealPlanForAiContext)
    .sort((left, right) => getPlanSortTime(right) - getPlanSortTime(left));
  const activePlan = realPlans.find((plan) => plan.status === "active") || null;
  const previousPlan =
    realPlans.find(
      (plan) =>
        (!activePlan || String(plan.id) !== String(activePlan.id)) &&
        isPerformedPlanForAiContext(plan)
    ) || null;
  const selectedPlanIds = [activePlan, previousPlan]
    .filter(Boolean)
    .map((plan) => String(plan.id));
  const rows = selectedPlanIds.length
    ? buildPlanExportRows({
        plans,
        selectedPlanIds,
        templates,
      })
    : [];

  return {
    currentBlock: summarizePlanWeeklyMuscleVolume({
      exerciseLibrary,
      plan: activePlan,
      rows,
    }),
    note:
      "Counts prescribed working sets by primary muscle only. Secondary muscles are not counted here; use activePlanPrescriptionRows for exercise-level details.",
    previousBlock: summarizePlanWeeklyMuscleVolume({
      exerciseLibrary,
      plan: previousPlan,
      rows,
    }),
  };
}

function getRepRangeBucket(reps) {
  if (!Number.isFinite(reps)) {
    return null;
  }

  if (reps >= 4 && reps <= 6) {
    return "4-6";
  }

  if (reps >= 7 && reps <= 9) {
    return "7-9";
  }

  if (reps >= 10 && reps <= 12) {
    return "10-12";
  }

  return `${Math.round(reps)} reps`;
}

function formatBenchmarkTrendSet(row) {
  if (!row) {
    return null;
  }

  return {
    date: row.date,
    e1rm: roundAiMetric(row.e1rm),
    reps: row.reps,
    rir: row.rir,
    weight: row.weight,
  };
}

function summarizeBenchmarkTrendWindow(observations) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return null;
  }

  const sortedObservations = [...observations].sort(
    (left, right) => left.workoutTime - right.workoutTime
  );
  const first = sortedObservations[0];
  const latest = sortedObservations.at(-1);
  const best = sortedObservations.reduce((currentBest, row) =>
    row.e1rm > currentBest.e1rm ? row : currentBest
  );

  return {
    best: formatBenchmarkTrendSet(best),
    changeFromFirstToLatest: roundAiMetric(latest.e1rm - first.e1rm),
    first: formatBenchmarkTrendSet(first),
    latest: formatBenchmarkTrendSet(latest),
    observationCount: sortedObservations.length,
  };
}

function buildHistoryPerformanceRows({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
}) {
  const rows = [];

  [...history]
    .sort((left, right) => getHistoryWorkoutTime(left) - getHistoryWorkoutTime(right))
    .forEach((workout) => {
      const completedAt = getHistoryWorkoutIso(workout);
      const bodyWeight = getLatestBodyWeightForDate(
        bodyWeightEntries,
        completedAt || workout.completedAt || workout.completed_at
      );

      (workout.exercises || []).forEach((historyExercise, exerciseIndex) => {
        const exercise = findExerciseForHistoryExercise(historyExercise, exerciseLibrary);

        (historyExercise.sets || []).forEach((set, setIndex) => {
          if (set.completed === false || set.completed === "false") {
            return;
          }

          const weight = parseHistoryMetricValue(set.actualWeight ?? set.actual_weight);
          const reps = parseHistoryMetricValue(set.actualReps ?? set.actual_reps);
          const rir = parseHistoryMetricValue(set.actualRir ?? set.actual_rir);
          const e1rm = getHistorySetE1RM(set, exercise, bodyWeight);

          rows.push({
            completedAt,
            date: completedAt ? completedAt.slice(0, 10) : "",
            e1rm,
            equipment: getExerciseEquipmentLabel(exercise),
            exercise,
            exerciseId: exercise.exerciseId ?? exercise.exercise_id ?? exercise.id ?? "",
            exerciseIndex,
            exerciseKey: getHistoryExerciseKey(exercise),
            exerciseName: getHistoryExerciseName(exercise),
            planId: workout.planId || workout.plan_id || "",
            planWeek: Number(workout.planWeek || workout.plan_week) || null,
            planWorkoutId: workout.planWorkoutId || workout.plan_workout_id || "",
            reps,
            rir,
            set,
            setIndex,
            weight,
            workoutId: workout.id || workout.source_key || "",
            workoutName: getWorkoutName(workout),
            workoutTime: getHistoryWorkoutTime(workout),
          });
        });
      });
    });

  return rows;
}

function buildBenchmarkRepRangeTrends({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
}) {
  const grouped = new Map();

  buildHistoryPerformanceRows({ bodyWeightEntries, exerciseLibrary, history }).forEach(
    (row) => {
      if (!Number.isFinite(row.e1rm) || !Number.isFinite(row.reps)) {
        return;
      }

      const benchmarkFamily = getBenchmarkFamilyForExercise(row.exercise);
      const repRange = getRepRangeBucket(row.reps);

      if (!benchmarkFamily || !repRange) {
        return;
      }

      const key = `${benchmarkFamily}|${row.exerciseKey}|${repRange}`;
      const current = grouped.get(key) || {
        benchmarkFamily,
        equipment: row.equipment,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        observations: [],
        repRange,
      };

      current.observations.push(row);
      grouped.set(key, current);
    }
  );

  return [...grouped.values()]
    .filter((group) => group.observations.length >= 2)
    .map((group) => {
      const observations = group.observations.sort(
        (left, right) => left.workoutTime - right.workoutTime
      );
      const lifetime = summarizeBenchmarkTrendWindow(observations);
      const recentObservations = observations.slice(-12);
      const rirFilteredObservations = observations.filter(
        (row) => Number.isFinite(row.rir) && row.rir <= 3
      );
      const recentRirFilteredObservations = rirFilteredObservations.slice(-12);

      return {
        benchmarkFamily: group.benchmarkFamily,
        best: lifetime.best,
        changeFromFirstToLatest: lifetime.changeFromFirstToLatest,
        equipment: group.equipment,
        exerciseId: group.exerciseId,
        exerciseName: group.exerciseName,
        first: lifetime.first,
        latest: lifetime.latest,
        lifetime,
        lifetimeChangeFromFirstToLatest: lifetime.changeFromFirstToLatest,
        note:
          "Prefer recentWindow and recentRirFilteredWindow for current progress decisions. Lifetime first-to-latest can span different programming phases, rep/RIR combinations, and fatigue contexts.",
        observationCount: observations.length,
        recentRirFilteredWindow: summarizeBenchmarkTrendWindow(
          recentRirFilteredObservations
        ),
        recentWindow: summarizeBenchmarkTrendWindow(recentObservations),
        rirFilter:
          "recentRirFilteredWindow includes only observations with actual RIR <= 3, then takes the latest 12 observations in this rep bucket.",
        repRange: group.repRange,
      };
    })
    .sort(
      (left, right) =>
        left.benchmarkFamily.localeCompare(right.benchmarkFamily) ||
        left.exerciseName.localeCompare(right.exerciseName) ||
        left.repRange.localeCompare(right.repRange)
    );
}

function buildPerformanceDropOffSummaries({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
}) {
  const sessionsByExercise = new Map();
  const rows = buildHistoryPerformanceRows({
    bodyWeightEntries,
    exerciseLibrary,
    history,
  });
  const groupedBySessionExercise = new Map();

  rows.forEach((row) => {
    if (!Number.isFinite(row.e1rm)) {
      return;
    }

    const key = `${row.workoutId}|${row.exerciseKey}`;
    const current = groupedBySessionExercise.get(key) || {
      equipment: row.equipment,
      exerciseId: row.exerciseId,
      exerciseKey: row.exerciseKey,
      exerciseName: row.exerciseName,
      rows: [],
      workoutName: row.workoutName,
    };

    current.rows.push(row);
    groupedBySessionExercise.set(key, current);
  });

  groupedBySessionExercise.forEach((session) => {
    const setRows = session.rows.sort((left, right) => left.setIndex - right.setIndex);

    if (setRows.length < 2) {
      return;
    }

    const first = setRows[0];
    const latest = setRows.at(-1);
    const best = setRows.reduce((currentBest, row) =>
      row.e1rm > currentBest.e1rm ? row : currentBest
    );
    const dropPercent =
      first.e1rm > 0 ? ((first.e1rm - latest.e1rm) / first.e1rm) * 100 : null;
    const current = sessionsByExercise.get(session.exerciseKey) || {
      equipment: session.equipment,
      exerciseId: session.exerciseId,
      exerciseName: session.exerciseName,
      sessions: [],
    };

    current.sessions.push({
      bestSetE1RM: roundAiMetric(best.e1rm),
      date: first.date,
      dropPercent: roundAiMetric(dropPercent, 1),
      firstSetE1RM: roundAiMetric(first.e1rm),
      lastSetE1RM: roundAiMetric(latest.e1rm),
      setCount: setRows.length,
      workoutName: session.workoutName,
    });
    sessionsByExercise.set(session.exerciseKey, current);
  });

  return [...sessionsByExercise.values()]
    .map((exercise) => {
      const recentSessions = exercise.sessions
        .sort((left, right) => String(right.date).localeCompare(String(left.date)))
        .slice(0, 6);
      const drops = recentSessions
        .map((session) => session.dropPercent)
        .filter((value) => value != null);

      return {
        averageRecentDropPercent:
          drops.length > 0
            ? roundAiMetric(
                drops.reduce((sum, value) => sum + value, 0) / drops.length,
                1
              )
            : null,
        equipment: exercise.equipment,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        recentSessions,
        sessionCount: exercise.sessions.length,
      };
    })
    .filter((exercise) => exercise.sessionCount >= 2)
    .sort(
      (left, right) =>
        (right.averageRecentDropPercent || 0) -
          (left.averageRecentDropPercent || 0) ||
        right.sessionCount - left.sessionCount
    )
    .slice(0, 20);
}

function buildPrescriptionAdherenceSummaries({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
}) {
  const grouped = new Map();

  buildHistoryPerformanceRows({ bodyWeightEntries, exerciseLibrary, history }).forEach(
    (row) => {
      const targetReps =
        parseAiTargetRange(
          row.set?.prescribedReps ?? row.set?.targetReps ?? row.set?.reps
        ) || null;
      const explicitMinimumReps = Number(
        row.set?.prescribedMinimumReps ??
          row.set?.minimumReps ??
          row.set?.minimum_reps ??
          row.set?.targetMinimumReps
      );
      if (targetReps && Number.isFinite(explicitMinimumReps)) {
        targetReps.min = Math.min(targetReps.max, explicitMinimumReps);
      }
      const targetRir =
        parseAiTargetRange(
          row.set?.prescribedRir ?? row.set?.targetRir ?? row.set?.rir
        ) || null;

      if (!targetReps && !targetRir) {
        return;
      }

      const current = grouped.get(row.exerciseKey) || {
        equipment: row.equipment,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        repsHigh: 0,
        repsLow: 0,
        repsMatched: 0,
        repsTargets: 0,
        rirHigherThanTarget: 0,
        rirLowerThanTarget: 0,
        rirMatched: 0,
        rirTargets: 0,
        totalSets: 0,
      };

      current.totalSets += 1;

      if (targetReps && Number.isFinite(row.reps)) {
        current.repsTargets += 1;
        if (row.reps < targetReps.min) {
          current.repsLow += 1;
        } else if (row.reps > targetReps.max) {
          current.repsHigh += 1;
        } else {
          current.repsMatched += 1;
        }
      }

      if (targetRir && Number.isFinite(row.rir)) {
        current.rirTargets += 1;
        if (row.rir < targetRir.min) {
          current.rirLowerThanTarget += 1;
        } else if (row.rir > targetRir.max) {
          current.rirHigherThanTarget += 1;
        } else {
          current.rirMatched += 1;
        }
      }

      grouped.set(row.exerciseKey, current);
    }
  );

  const summaries = [...grouped.values()]
    .filter((summary) => summary.totalSets >= 4)
    .map((summary) => ({
      ...summary,
      repsMatchRate:
        summary.repsTargets > 0
          ? roundAiMetric(summary.repsMatched / summary.repsTargets, 2)
          : null,
      rirMatchRate:
        summary.rirTargets > 0
          ? roundAiMetric(summary.rirMatched / summary.rirTargets, 2)
          : null,
    }))
    .sort(
      (left, right) =>
        right.totalSets - left.totalSets ||
        String(left.exerciseName).localeCompare(String(right.exerciseName))
    )
    .slice(0, 40);

  if (summaries.length === 0) {
    return {
      available: false,
      reason:
        grouped.size === 0
          ? "Completed set history did not contain prescribed rep or RIR targets that could be compared with actual performance. Older history may predate preservation of prescription targets."
          : "Prescription targets were found, but no exercise had at least four comparable completed sets.",
      rows: [],
    };
  }

  return {
    available: true,
    reason: null,
    rows: summaries,
  };
}

function buildBlockOutcomeSummaries({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
  plans = [],
  templates = [],
}) {
  const performedPlans = [...plans]
    .filter(isPerformedPlanForAiContext)
    .sort((left, right) => getPlanSortTime(right) - getPlanSortTime(left))
    .slice(0, 3);
  const planRows = performedPlans.length
    ? buildPlanExportRows({
        plans,
        selectedPlanIds: performedPlans.map((plan) => String(plan.id)),
        templates,
      })
    : [];
  const performanceRows = buildHistoryPerformanceRows({
    bodyWeightEntries,
    exerciseLibrary,
    history,
  });

  return performedPlans.map((plan) => {
    const completionSessionIds = new Set(
      (plan.completions || [])
        .map((completion) =>
          String(completion.sessionId || completion.session_id || "")
        )
        .filter(Boolean)
    );
    const completedPlanWorkoutIds = new Set(
      (plan.completions || [])
        .map((completion) =>
          String(completion.planWorkoutId || completion.plan_workout_id || "")
        )
        .filter(Boolean)
    );
    const matchingRows = performanceRows.filter(
      (row) =>
        String(row.planId) === String(plan.id) ||
        completionSessionIds.has(String(row.workoutId)) ||
        completedPlanWorkoutIds.has(String(row.planWorkoutId))
    );
    const workoutKeys = new Set(
      matchingRows.map((row) => row.workoutId).filter(Boolean)
    );
    const benchmarkRows = matchingRows.filter((row) =>
      getBenchmarkFamilyForExercise(row.exercise)
    );
    const bestBenchmarkByFamily = new Map();

    benchmarkRows.forEach((row) => {
      if (!Number.isFinite(row.e1rm)) {
        return;
      }

      const family = getBenchmarkFamilyForExercise(row.exercise);
      const current = bestBenchmarkByFamily.get(family);

      if (!current || row.e1rm > current.e1rm) {
        bestBenchmarkByFamily.set(family, row);
      }
    });

    return {
      benchmarkBestByFamily: [...bestBenchmarkByFamily.entries()].map(
        ([family, row]) => ({
          date: row.date,
          e1rm: roundAiMetric(row.e1rm),
          exerciseName: row.exerciseName,
          family,
          reps: row.reps,
          rir: row.rir,
          weight: row.weight,
        })
      ),
      completedWeeks: [
        ...new Set(
          (plan.completions || [])
            .map((completion) => Number(completion.weekNumber) || null)
            .filter(Boolean)
        ),
      ].sort((left, right) => left - right),
      completedWorkoutCount:
        completionSessionIds.size || workoutKeys.size || (plan.completions || []).length,
      historyMatching: {
        available: workoutKeys.size > 0,
        matchedCompletedWorkoutCount: workoutKeys.size,
        note:
          workoutKeys.size > 0
            ? "Completed history matched using plan ID, completion session ID, or plan-workout ID."
            : "Plan completion records exist, but no completed set history could be matched. Benchmark outcomes are unavailable for this plan.",
      },
      planId: String(plan.id),
      planName: plan.name || "Training Plan",
      planStatus: plan.status || "inactive",
      prescribedAverageWeeklySetsByPrimaryMuscle:
        summarizePlanWeeklyMuscleVolume({
          exerciseLibrary,
          plan,
          rows: planRows,
        })?.averageWeeklySetsByPrimaryMuscle || {},
      trainingWeeks: getPlanExportTrainingWeeks(plan),
    };
  });
}

function buildAiPlanDraftInstructions() {
  return {
    importSchema: "workout-app.ai-plan-draft.v1",
    exerciseSelectionConvention:
      'Prescribe exercises only from `activeExercises`, matching both `name` and `equipment`. Exercises that appear only in completed history, previous plans, or other evidence are historical reference and must not be prescribed unless they also appear in `activeExercises`. Each active exercise exposes `primaryMuscle` and `secondaryMuscles` for exercise selection and volume reasoning.',
    repPrescriptionConvention:
      'The app requires a numeric upper-bound rep target in `reps`. When the intended range extends more than two reps below that target, also include numeric `minimumReps`. For example, encode 10–15 as `"reps": 15, "minimumReps": 10`. Apply this consistently to exercise sets and weekly prescriptions. When `minimumReps` is omitted, the app uses its default acceptable-repetition tolerance.',
    supersetConvention:
      'Respect `planningRequest.supersets.mode`. For `avoid`, omit supersets. For `preferred`, favor supersets when useful, while allowing exercise compatibility, performance, fatigue, and other constraints to override the preference. For `aiDecides`, explicitly decide whether they improve workout duration and programming quality. Encode a superset by assigning the same nonempty `supersetGroup` string, such as `"A"`, to two or more exercises in the same workout. Exercises sharing a group are performed in listed order, round by round. Unequal working-set counts are supported: an exercise without a set in a later round is skipped. There is no rest between exercises within the same round; the applicable rest timer starts after the final exercise performed in that round. Use concise group labels that are unique within that workout, never span a group across workouts, and omit `supersetGroup` from ungrouped exercises.',
    dropSetConvention:
      'Respect `planningRequest.dropSets.mode`. For `avoid`, prescribe zero drop sets. For `preferred`, favor drop sets on suitable cable, machine, or isolation exercises when they support the plan, while allowing fatigue, recovery, technique, and other constraints to override the preference. Avoid them on benchmarks, highly technical compounds, and movements where fatigue creates a meaningful safety concern unless specifically justified. For `aiDecides`, explicitly decide whether and where drop sets improve the plan. Encode the default count as exercise `dropSets` and week-specific counts as `weeklyPrescriptions[].dropSets`, using integers from 0 through 3. An omitted weekly `dropSets` inherits the exercise-level value; an explicit 0 disables drop sets for that week. The count is the number of additional sequential load-reduction segments after the final working set. Unless specifically justified, prescribe 0 during deload weeks rather than inheriting a nonzero default. Each segment prescribes AMRAP at RIR 0 with no rest before the next segment and does not produce an e1RM. The app initially targets 80% of the preceding segment\'s actual weight, rounded to the exercise\'s supported weight increment; the athlete may edit the target or actual weight.',
    dropSetAnalysisConvention:
      'Completed drop-set rows have `is_drop_set: true` and a one-based `drop_set_index`. Exclude them from benchmark e1RM trends and ordinary working-set performance-drop-off calculations. Treat working-set and drop-set volume separately, and do not assume one drop-set segment is equivalent to one conventional working set. `activePlanPrescriptionRows[].prescribed_drop_sets` supplies the prescribed count for adherence comparisons.',
    workoutDurationAnalysisConvention:
      '`completedWorkoutRows` contains recent workout-level actual durations and workload counts. `workoutDurationSummary` provides overall, normal-training, deload, and stable per-workout summaries. Prefer medians and recent observations over a single lifetime average, compare workouts with similar exercise and completed-set counts, and treat unusually long or short sessions as possible outliers. Durations are active workout-timer time excluding pauses; exact exercise-transition and actual-rest durations are not available. Use this evidence with `planningRequest.workoutDuration` constraints to estimate and control the duration of each proposed workout.',
    requiredShape: {
      analysis: {
        rationale:
          "optional string[] explaining material changes to split, volume, reps, RIR, deloads, or exercise selection",
        summary: "optional string summarizing the plan and main conclusions",
        watchNext: "optional string[] listing items to monitor in the next block",
      },
      schema: "workout-app.ai-plan-draft.v1",
      plan: {
        daysPerWeek: "number",
        deloadWeeks:
          "number; deload weeks after the training block. Use 0 when no deload is planned.",
        goal:
          '"progress" or "maintain"; use "progress" for ordinary strength or hypertrophy progression blocks',
        name: "string",
        trainingWeeks:
          "number; count of normal training weeks, not including deload weeks",
      },
      workouts: [
        {
          dayNumber: "number",
          exercises: [
            {
              equipment: "string or string[]",
              name: "string matching the exercise library when possible",
              supersetGroup:
                "optional string; assign the same label to at least two exercises in this workout to link them as a superset; omit for ungrouped exercises",
              dropSets:
                "optional integer 0-3; default drop-set count after the final working set",
              sets: [
            {
              restSeconds:
                "optional number; prescribed rest after completing this set, in seconds. If omitted, the app uses exercise.restSeconds or the current rep-based defaults.",
              minimumReps:
                "optional number; explicit acceptable lower bound when more than two reps below reps",
              reps: "number; upper-bound rep target",
              rir: "number or string",
            },
          ],
          restSeconds:
            "optional number; default prescribed rest after sets for this exercise, in seconds",
          weeklyPrescriptions:
            "optional [{ weekNumber, sets, dropSets, reps, minimumReps, rir, restSeconds, isDeload }]; dropSets is an integer from 0 through 3; omission inherits exercise.dropSets, while 0 disables drop sets for that week; deload entries should normally use 0 unless specifically justified and may prescribe restSeconds independently",
        },
      ],
          name: "string",
          workoutType: "push | pull | lower | upper | full-body | optional string",
        },
      ],
    },
    fileOutput:
      "After I explicitly approve finalization, create the completed draft as a .json file named workout-ai-plan-draft.json when the interface supports file/artifact creation. The file contents must be exactly one valid JSON object matching importSchema, with no Markdown fences or prose outside the JSON. If you cannot create a file, return only the JSON file contents so it can be saved as workout-ai-plan-draft.json and imported into the app.",
    continuity:
      "Imported analysis.summary, analysis.rationale, and analysis.watchNext are stored with the draft plan. After the plan is activated and performed, later context exports include those notes in previousPlanAIContext so the next plan can evaluate the prior hypothesis, rationale, and watch items.",
    safety:
      "The app imports drafts as inactive plans only. Review the plan before activating it.",
  };
}

function buildTrainingProfileContext(exerciseLibrary = []) {
  const benchmarkFamilyDefinitions = BENCHMARK_FAMILY_OPTIONS.map((family) => ({
    benchmarkFamily: family.contextLabel,
    familyKey: family.key,
    muscleGroup:
      family.key === "chest_barbell_press"
        ? "Chest"
        : family.key === "posterior_chain_deadlift"
          ? "Lower body / posterior chain"
          : "Back",
  }));
  const benchmarkFamilies = benchmarkFamilyDefinitions
    .map((family) => ({
      ...family,
      configuredExercises: exerciseLibrary
        .filter(
          (exercise) =>
            exercise.active !== "inactive" &&
            isExerciseBenchmark(exercise) &&
            getBenchmarkFamilyForExercise(exercise) === family.benchmarkFamily
        )
        .map((exercise) => ({
          equipment: exercise.equipment || [],
          id: exercise.id,
          name: exercise.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      role: "benchmark family",
    }))
    .filter((family) => family.configuredExercises.length > 0);

  return {
    benchmarkFamilies,
    measurementModel: {
      benchmarkFamilies:
        "Broad areas used for planning and coverage; they allow compatible benchmark selection without treating different exercises as one interchangeable measurement series.",
      benchmarkExercises:
        "Stable measurement instruments used to evaluate strength progression through exercise-specific e1RM trends. Benchmark designation does not automatically make an exercise a current programming priority.",
      hypertrophyAssessment:
        "Use programmed direct-set volume, adherence, performance, recovery evidence, and the user's observations; e1RM is not a complete hypertrophy measurement.",
      priorities:
        "Use athleteProfile.longTermGoals and planningRequest, especially benchmarkFamilyGuidance and currentPriorities, to determine adaptation emphasis for the next block.",
    },
    hardRules: {
      benchmarkCoverage:
        "Each plan must include at least one configured exercise from every benchmark family listed in trainingProfile.benchmarkFamilies unless the user agrees to an exception during plan discussion.",
      benchmarkChoice:
        "Choose from each family's configuredExercises. Follow planningRequest.benchmarkFamilyGuidance when it fixes a benchmark; otherwise choose based on history, fatigue, equipment, and plan intent. Do not force every configured exercise into the same week.",
      benchmarkPlacement:
        "When a benchmark exercise is included, place it before other direct exercises for that benchmark's primary muscle group in that workout so its e1RM signal is meaningful. It does not have to be the first exercise in the workout when the plan intentionally prioritizes another muscle or movement first.",
      benchmarkIsolation:
        "A benchmark exercise intended for longitudinal e1RM tracking should normally be performed before other exercises that substantially fatigue its primary movers. When multiple benchmark exercises target the same muscle group, prefer placing their primary benchmark exposures first on separate training days rather than performing them sequentially in the same workout. If one same-muscle benchmark must follow another, only the first should generally be treated as the primary performance benchmark for that session.",
      benchmarkPurpose:
        "Benchmark exercises are the primary exercises used to evaluate strength progression through e1RM. Supporting exercises should still progress where practical, but their e1RM trends are secondary and should not override benchmark performance, hypertrophy goals, fatigue management, or exercise-role considerations.",
      primaryVsSupportingBenchmarkExposure:
        "An exercise designated as a benchmark may also appear elsewhere in the week as supporting strength or hypertrophy volume. Only exposures performed under appropriate low-fatigue conditions should be treated as primary benchmark exposures for evaluating e1RM progression.",
      benchmarkRecurrence:
        "Benchmark exercises should normally recur consistently enough during the training block to provide a meaningful e1RM trend, but variations may be rotated when justified.",
      inactiveDraft:
        "Imported AI plans are drafts and must remain inactive until reviewed in the app.",
    },
    planningFreedom: {
      currentPlanIsReference: true,
      guidance:
        "Use the current plan and recent history as evidence, not as a strict template.",
      mayChange: [
        "split",
        "days per week",
        "workout order",
        "exercise selection",
        "sets",
        "rep ranges",
        "RIR targets",
        "RIR progression",
        "deload timing",
        "weekly volume by muscle",
      ],
      shouldExplainChanges:
        "When materially changing structure, volume, reps, or RIR, explain the evidence from history or goals that motivated the change.",
    },
    softPreferences: {
      daysPerWeek: 5,
      deloadWeeks: 1,
      lowerBodyExerciseCount: "Usually 6-7.",
      normalSetCount: "Usually 3-4 working sets per exercise.",
      pushPullFullBodyExerciseCount: "Usually 7-8.",
      rirProgression: "Often stepped across training weeks, such as 3, 3, 2, 2, 1.",
      shouldersMayAppearIn: ["push", "pull", "upper"],
      split: ["push or pull", "pull or push", "lower", "upper", "lower"],
      trainingWeeks: 5,
      usualAbsPlacement: "lower body workouts",
    },
    source: "GoalsAndDefinitions-derived structured context",
    precedence:
      "Use these structured fields as the authoritative planning guidance for this export.",
  };
}

function getBodyWeightEntryTime(entry) {
  const parsed = Date.parse(entry?.date || entry?.measured_at || "");

  return Number.isFinite(parsed) ? parsed : 0;
}

function getBodyWeightEntryValue(entry) {
  const parsed = Number.parseFloat(
    String(entry?.weight ?? entry?.body_weight_value ?? "")
  );

  return Number.isFinite(parsed) ? parsed : null;
}

function getBodyWeightEntryUnit(entry) {
  return entry?.unit || entry?.body_weight_unit || "lb";
}

function formatBodyWeightTrendValue(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

function averageBodyWeight(entries) {
  const values = entries
    .map(getBodyWeightEntryValue)
    .filter((value) => value != null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getBodyWeightChange(latestValue, firstEntry) {
  const firstValue = getBodyWeightEntryValue(firstEntry);

  return latestValue != null && firstValue != null
    ? formatBodyWeightTrendValue(latestValue - firstValue)
    : null;
}

function buildBodyWeightTrendContext(bodyWeightEntries = [], plans = []) {
  const sortedEntries = [...bodyWeightEntries]
    .filter((entry) => getBodyWeightEntryTime(entry) > 0)
    .sort((left, right) => getBodyWeightEntryTime(left) - getBodyWeightEntryTime(right));
  const latest = sortedEntries.at(-1) || null;

  if (!latest) {
    return {
      available: false,
      note: "No body-weight entries were available in local app data.",
    };
  }

  const latestTime = getBodyWeightEntryTime(latest);
  const entriesSinceDays = (days) => {
    const cutoff = latestTime - days * 24 * 60 * 60 * 1000;

    return sortedEntries.filter((entry) => getBodyWeightEntryTime(entry) >= cutoff);
  };
  const latestValue = getBodyWeightEntryValue(latest);
  const activePlan = plans.find((plan) => plan.status === "active") || null;
  const activePlanStartTime = Date.parse(activePlan?.createdAt || "");
  const activePlanEntries = Number.isFinite(activePlanStartTime)
    ? sortedEntries.filter((entry) => getBodyWeightEntryTime(entry) >= activePlanStartTime)
    : [];
  const firstActivePlanEntry = activePlanEntries[0] || null;
  const first90DayEntry = entriesSinceDays(90)[0] || null;
  const first30DayEntry = entriesSinceDays(30)[0] || null;

  return {
    available: true,
    averages: {
      sevenDay: formatBodyWeightTrendValue(averageBodyWeight(entriesSinceDays(7))),
      fourteenDay: formatBodyWeightTrendValue(averageBodyWeight(entriesSinceDays(14))),
      thirtyDay: formatBodyWeightTrendValue(averageBodyWeight(entriesSinceDays(30))),
    },
    change: {
      activePlan: getBodyWeightChange(latestValue, firstActivePlanEntry),
      thirtyDay: getBodyWeightChange(latestValue, first30DayEntry),
      ninetyDay: getBodyWeightChange(latestValue, first90DayEntry),
    },
    entryCount: sortedEntries.length,
    latest: {
      date: latest.date || latest.measured_at || "",
      unit: getBodyWeightEntryUnit(latest),
      value: formatBodyWeightTrendValue(latestValue),
    },
    note:
      "Use body-weight trend as context when interpreting strength and hypertrophy progress; do not overfit plan decisions to small day-to-day fluctuations.",
  };
}

function parseNutritionNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/^\+/, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function roundNutritionNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function getAiDateKey(value) {
  const date = value ? new Date(value) : new Date();

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function daysBetweenDateKeys(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00`);
  const end = Date.parse(`${endDate}T00:00:00`);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }

  return Math.round((end - start) / 86400000);
}

function readDailyCalorieGoalForAi(storageKey) {
  const parsed = Number(localStorage.getItem(storageKey));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readDailyCalorieGoalHistoryForAi(storageKey, fallbackGoal = 0) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .map((entry) => ({
          date: String(entry.date || "").slice(0, 10),
          goal: Math.round(parseNutritionNumber(entry.goal)),
        }))
        .filter((entry) => entry.date && entry.goal > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch (error) {
    console.error("Failed to read AI calorie goal history:", error);
  }

  return fallbackGoal > 0
    ? [
        {
          date: getAiDateKey(),
          goal: fallbackGoal,
        },
      ]
    : [];
}

function getNutritionGoalForDate(goalHistory, date, fallbackGoal = 0) {
  const candidates = (goalHistory || [])
    .filter((entry) => entry.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return candidates[0]?.goal || fallbackGoal || 0;
}

function averageNutritionRows(rows) {
  if (rows.length === 0) {
    return null;
  }

  return {
    calories: roundNutritionNumber(
      rows.reduce((sum, row) => sum + row.calories, 0) / rows.length,
      0
    ),
    carbs: roundNutritionNumber(
      rows.reduce((sum, row) => sum + row.carbs, 0) / rows.length
    ),
    fat: roundNutritionNumber(
      rows.reduce((sum, row) => sum + row.fat, 0) / rows.length
    ),
    protein: roundNutritionNumber(
      rows.reduce((sum, row) => sum + row.protein, 0) / rows.length
    ),
  };
}

function buildNutritionTrendContext({
  calorieGoal = 0,
  calorieGoalHistory = [],
  lookbackDays = 30,
  nutritionEntries = [],
} = {}) {
  const rowsByDate = new Map();

  nutritionEntries.forEach((entry) => {
    const date = String(entry?.date || "").slice(0, 10);

    if (!date) {
      return;
    }

    const current = rowsByDate.get(date) || {
      calories: 0,
      carbs: 0,
      date,
      fat: 0,
      protein: 0,
    };

    rowsByDate.set(date, {
      ...current,
      calories: current.calories + parseNutritionNumber(entry.calories),
      carbs: current.carbs + parseNutritionNumber(entry.carbs),
      fat: current.fat + parseNutritionNumber(entry.fat),
      protein: current.protein + parseNutritionNumber(entry.protein),
    });
  });

  const allRows = [...rowsByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      calories: roundNutritionNumber(row.calories, 0),
      calorieGoal: getNutritionGoalForDate(
        calorieGoalHistory,
        row.date,
        calorieGoal
      ),
      carbs: roundNutritionNumber(row.carbs),
      date: row.date,
      fat: roundNutritionNumber(row.fat),
      protein: roundNutritionNumber(row.protein),
    }));

  if (allRows.length === 0) {
    return {
      available: false,
      note: "No nutrition entries were available in local app data.",
    };
  }

  const excludedNoGoalDays = allRows.filter((row) => row.calorieGoal <= 0).length;
  const excludedPartialDays = allRows.filter(
    (row) => row.calorieGoal > 0 && row.calories < row.calorieGoal * 0.5
  ).length;
  const usableRows = allRows.filter(
    (row) => row.calorieGoal > 0 && row.calories >= row.calorieGoal * 0.5
  );

  if (usableRows.length === 0) {
    return {
      available: false,
      excludedDays: {
        belowHalfCalorieGoal: excludedPartialDays,
        missingCalorieGoal: excludedNoGoalDays,
      },
      note:
        "Nutrition entries existed, but no days met the completeness filter. Days without a calorie goal or with less than 50% of the calorie target logged are excluded from AI context.",
      rawLoggedDays: allRows.length,
    };
  }

  const latestDate = usableRows.at(-1).date;
  const rowsSinceDays = (days) =>
    usableRows.filter((row) => daysBetweenDateKeys(row.date, latestDate) < days);
  const dailyRows = rowsSinceDays(lookbackDays);
  const rowsWithGoals = dailyRows.filter((row) => row.calorieGoal > 0);
  const daysUnderGoal = rowsWithGoals.filter(
    (row) => row.calories < row.calorieGoal
  ).length;
  const daysOverGoal = rowsWithGoals.filter(
    (row) => row.calories > row.calorieGoal
  ).length;
  const daysWithinGoal = rowsWithGoals.filter(
    (row) => Math.abs(row.calories - row.calorieGoal) <= row.calorieGoal * 0.05
  ).length;

  return {
    available: true,
    averages: {
      sevenDay: averageNutritionRows(rowsSinceDays(7)),
      fourteenDay: averageNutritionRows(rowsSinceDays(14)),
      thirtyDay: averageNutritionRows(rowsSinceDays(30)),
    },
    dailyRows,
    excludedDays: {
      belowHalfCalorieGoal: excludedPartialDays,
      missingCalorieGoal: excludedNoGoalDays,
    },
    goalAdherence: {
      daysOverGoal,
      daysUnderGoal,
      daysWithEntries: dailyRows.length,
      daysWithGoals: rowsWithGoals.length,
      daysWithinFivePercent: daysWithinGoal,
    },
    latestDate,
    lookbackDays,
    note:
      "Daily rows are macro totals, not individual foods. Days without a calorie goal or with less than 50% of the calorie target logged are excluded to avoid treating incomplete logs as intake data.",
    rawLoggedDays: allRows.length,
  };
}

function buildAiPlanContext({
  athleteProfile = null,
  bodyWeightEntries = [],
  calorieGoal = 0,
  calorieGoalHistory = [],
  exerciseLibrary = [],
  history = [],
  nutritionEntries = [],
  planningRequest = null,
  plans = [],
  templates = [],
}) {
  const activePlanIds = plans
    .filter((plan) => plan.status === "active")
    .map((plan) => String(plan.id));
  const planRows = buildPlanExportRows({
    plans,
    selectedPlanIds: activePlanIds.length ? activePlanIds : null,
    templates,
  });
  const historyRows = buildExerciseHistoryExportRows({
    bodyWeightEntries,
    exerciseLibrary,
    history,
  });
  const completedWorkoutRows = buildCompletedWorkoutRows({
    history,
    plans,
  });
  const workoutDurationSummary = buildWorkoutDurationSummary(
    completedWorkoutRows
  );
  const bodyWeightTrend = buildBodyWeightTrendContext(bodyWeightEntries, plans);
  const nutritionTrend = buildNutritionTrendContext({
    calorieGoal,
    calorieGoalHistory,
    nutritionEntries,
  });
  const weeklyMuscleVolumeSummary = buildWeeklyMuscleVolumeSummary({
    exerciseLibrary,
    plans,
    templates,
  });
  const benchmarkRepRangeTrends = buildBenchmarkRepRangeTrends({
    bodyWeightEntries,
    exerciseLibrary,
    history,
  });
  const performanceDropOffSummaries = buildPerformanceDropOffSummaries({
    bodyWeightEntries,
    exerciseLibrary,
    history,
  });
  const prescriptionAdherenceSummaries = buildPrescriptionAdherenceSummaries({
    bodyWeightEntries,
    exerciseLibrary,
    history,
  });
  const blockOutcomeSummaries = buildBlockOutcomeSummaries({
    bodyWeightEntries,
    exerciseLibrary,
    history,
    plans,
    templates,
  });
  const recentPlanExposure = buildRecentPlanExposureContext({
    exerciseLibrary,
    history,
    plans,
    templates,
  });
  const previousPlanAIContext = buildPreviousPlanAiContext({ plans });
  const activeExercises = exerciseLibrary
    .filter((exercise) => exercise.active !== "inactive")
    .map((exercise) => ({
      benchmark: isExerciseBenchmark(exercise),
      benchmarkFamily: getBenchmarkFamilyForExercise(exercise) || null,
      equipment: exercise.equipment || [],
      id: exercise.id,
      name: exercise.name,
      primaryMuscle: exercise.muscles?.[0] || null,
      secondaryMuscles: exercise.muscles?.slice(1) || [],
    }))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));

  return {
    app: "workout-app",
    appVersion: APP_VERSION,
    contextSchema: "workout-app.ai-plan-context.v1",
    draftInstructions: buildAiPlanDraftInstructions(),
    exportedAt: new Date().toISOString(),
    prompt:
      "Use this attached workout-app AI context to evaluate my recent progress and design my next training plan. Preserve the selected athleteProfile.longTermGoals while using planningRequest and the evidence to choose the appropriate emphasis for only the next block; do not create a speculative multi-block roadmap. Use explicit priorities to determine which adaptations deserve emphasis, then use performance, volume, adherence, fatigue, recovery, exercise exposure, body-weight, and nutrition evidence to choose the training dose and method. A high priority does not automatically require more volume, and an empty currentPriorities array does not erase long-term goals or available history. Apply planningRequest.benchmarkFamilyGuidance: family emphasis describes the desired adaptation, while benchmark exercises are measurement instruments rather than automatic programming priorities. Respect fixed benchmark preferences and use judgment within a family when the preference is AI decides. Keep trends for different exercises separate even when they share a family. First discuss your proposed plan with me in normal conversational form and revise it based on our discussion. Do not create the final importable JSON until I explicitly tell you to finalize the plan. Use previousPlanAIContext to evaluate prior AI plan hypotheses, rationale, and watchNext items against the observed training data. Use weeklyMuscleVolumeSummary, benchmarkRepRangeTrends, performanceDropOffSummaries, prescriptionAdherenceSummaries.rows when prescriptionAdherenceSummaries.available is true, blockOutcomeSummaries, and workoutDurationSummary as primary derived metrics before falling back to raw completedSetRows or completedWorkoutRows. Analyze workout durations according to draftInstructions.workoutDurationAnalysisConvention, and use them with planningRequest.workoutDuration to estimate each proposed workout independently and keep it within the requested range. In benchmarkRepRangeTrends, prefer recentWindow and recentRirFilteredWindow over lifetime first-to-latest changes when judging current progress. Use recentPlanExposure to identify exercises with long continuous programming exposure that may be candidates for rotation. Prescribe exercises only from activeExercises exactly as described in draftInstructions.exerciseSelectionConvention. The app requires numeric upper-bound reps and supports optional numeric minimumReps on both sets and weeklyPrescriptions as described in draftInstructions.repPrescriptionConvention. Respect planningRequest.supersets and encode any selected supersets using exercise.supersetGroup exactly as described in draftInstructions.supersetConvention. Respect planningRequest.dropSets and encode default or weekly drop-set counts exactly as described in draftInstructions.dropSetConvention. Analyze completed drop sets according to draftInstructions.dropSetAnalysisConvention. You may prescribe restSeconds at the exercise, set, or weekly-prescription level when rest interval changes would benefit strength, hypertrophy, fatigue management, or workout duration. Weekly prescriptions may use distinct dropSets and restSeconds values for a deload week, and the app will preserve them. When I explicitly approve finalization, create the draft as a .json file named workout-ai-plan-draft.json when possible. The file must contain only valid JSON using draftInstructions.importSchema so it can be imported into the app. Put explanation in the optional analysis object.",
    summary: {
      activeExerciseCount: activeExercises.length,
      activePlanCount: activePlanIds.length,
      benchmarkRepRangeTrendRows: benchmarkRepRangeTrends.length,
      blockOutcomeRows: blockOutcomeSummaries.length,
      completedWorkoutRows: completedWorkoutRows.length,
      completedSetRows: historyRows.length,
      nutritionDays:
        nutritionTrend.available ? nutritionTrend.goalAdherence.daysWithEntries : 0,
      performanceDropOffRows: performanceDropOffSummaries.length,
      planPrescriptionRows: planRows.length,
      prescriptionAdherenceRows: prescriptionAdherenceSummaries.rows.length,
      previousPlanAIContextRows: previousPlanAIContext.length,
      recentPlanExposureRows: recentPlanExposure.length,
      trackedExerciseCount: activeExercises.length,
      workoutCount: history.length,
    },
    bodyWeightTrend,
    nutritionTrend,
    athleteProfile,
    planningRequest,
    planningGuidancePrecedence: [
      "safety and trainingProfile.hardRules",
      "explicit planningRequest requirements and constraints",
      "athleteProfile long-term goals and planningRequest current priorities",
      "trainingProfile.softPreferences",
      "current plan structure",
    ],
    weeklyMuscleVolumeSummary,
    benchmarkRepRangeTrends,
    performanceDropOffSummaries,
    prescriptionAdherenceSummaries,
    blockOutcomeSummaries,
    workoutDurationSummary,
    trainingProfile: buildTrainingProfileContext(exerciseLibrary),
    activeExercises,
    previousPlanAIContext,
    previousPlanAIContextStatus: {
      available: previousPlanAIContext.length > 0,
      reason:
        previousPlanAIContext.length > 0
          ? null
          : "No performed AI-generated plan with stored analysis was available yet. This is expected before the first imported AI plan has been activated and performed.",
    },
    recentPlanExposure,
    activePlanPrescriptionRows: planRows,
    completedWorkoutRows,
    completedSetRows: historyRows,
  };
}

function getAiPlanPrompt(context) {
  return [
    "I attached a workout-app AI context export from my local app.",
    "",
    "Please evaluate my progress and propose the next plan/workout draft from it.",
    "First discuss the proposed plan with me in normal conversational form and revise it based on our discussion.",
    "Do not create the final importable JSON until I explicitly tell you to finalize the plan.",
    "Preserve athleteProfile.longTermGoals across blocks. Use planningRequest and current evidence to choose the emphasis for only the next block; do not create a speculative multi-block roadmap.",
    "Use explicit priorities to determine which adaptations deserve emphasis, then use historical performance, volume, adherence, fatigue, recovery, exercise exposure, body-weight, and nutrition evidence to determine the appropriate training dose and method. Do not treat a high priority as an automatic instruction to increase volume, and do not treat an empty currentPriorities array as an instruction to ignore long-term goals or available history.",
    "Use planningRequest.benchmarkFamilyGuidance to distinguish adaptation emphasis from measurement. A benchmark exercise provides an exercise-specific longitudinal strength signal; its benchmark status alone does not make it a current priority. Respect fixed benchmark preferences, and when a family says AI decides, choose among configured family benchmarks based on history and plan intent. Do not treat e1RM values from different exercises in one family as directly interchangeable.",
    "Follow planningGuidancePrecedence when fields conflict. Treat explicit user constraints as requirements and AI-decides fields as permission to use your judgment.",
    "Prescribe exercises only from activeExercises, matching both name and equipment, as described in draftInstructions.exerciseSelectionConvention. Exercises found only in history or previous plans are evidence, not available exercise choices.",
    "Use previousPlanAIContext to evaluate the prior AI plan's summary, rationale, and watchNext items against the completed training data before designing the next block.",
    "Use weeklyMuscleVolumeSummary, benchmarkRepRangeTrends, performanceDropOffSummaries, prescriptionAdherenceSummaries.rows when prescriptionAdherenceSummaries.available is true, blockOutcomeSummaries, and workoutDurationSummary as the primary derived metrics before falling back to raw completedSetRows or completedWorkoutRows.",
    "Analyze actual durations according to draftInstructions.workoutDurationAnalysisConvention. When planningRequest.workoutDuration is present, estimate each proposed workout independently and adjust exercise count, working sets, rest intervals, supersets, and suitable drop sets to keep it within the requested range.",
    "Within benchmarkRepRangeTrends, prefer recentWindow and recentRirFilteredWindow over lifetime first-to-latest changes when judging current strength progress.",
    "Use recentPlanExposure to identify exercises that have been programmed for many consecutive plans or training weeks. Non-benchmark exercises with long continuous exposure and no clear performance or hypertrophy rationale are good candidates for intelligent rotation.",
    "Use trainingProfile.hardRules as requirements. Use trainingProfile.softPreferences as defaults that may be changed when the history supports a better plan.",
    "You may change split, workout order, exercise selection, sets, rep ranges, RIR targets, rest intervals, progression, deload timing, and weekly volume by muscle if there is a clear benefit.",
    'The app requires a numeric upper-bound rep target in `reps`. When the intended range extends more than two reps below that target, also include numeric `minimumReps`. For example, encode 10–15 as `"reps": 15, "minimumReps": 10`. Apply this consistently to exercise sets and weekly prescriptions. When `minimumReps` is omitted, the app uses its default acceptable-repetition tolerance.',
    "Follow draftInstructions.supersetConvention and draftInstructions.dropSetConvention exactly. Analyze completed drop sets according to draftInstructions.dropSetAnalysisConvention.",
    "You may prescribe restSeconds at the exercise, set, or weekly-prescription level, including a distinct restSeconds for a deload week. If omitted, the app will use its current rep-based rest defaults.",
    "Treat current plan volume and structure as context, not a constraint. Use bodyWeightTrend and nutritionTrend when interpreting strength, recovery, and hypertrophy progress.",
    "In the finalized JSON, put observations, rationale, and watch items inside the optional analysis object so the entire final response remains importable.",
    "Use plan.trainingWeeks for normal training weeks and plan.deloadWeeks for deload weeks. Do not use plan.durationWeeks unless you are maintaining backward compatibility with an older draft.",
    "When I explicitly approve finalization, create the completed draft as a .json file named workout-ai-plan-draft.json when this chat interface supports file or artifact creation.",
    "The .json file contents must be exactly one valid JSON object with no Markdown fences or prose outside the JSON. If you cannot create a file, return only the JSON file contents so I can save it as workout-ai-plan-draft.json and import it.",
    "",
    "After I explicitly approve finalization, return only valid JSON with this top-level shape:",
    JSON.stringify(buildAiPlanDraftInstructions().requiredShape, null, 2),
    "",
    `Context summary: ${JSON.stringify(context.summary)}`,
  ].join("\n");
}

function parseAiPlanDraft(rawText) {
  let parsed;
  const trimmedText = String(rawText || "").trim();
  const fencedJsonMatch = trimmedText.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i
  );
  const candidateText = fencedJsonMatch ? fencedJsonMatch[1].trim() : trimmedText;
  const firstBraceIndex = candidateText.indexOf("{");
  const lastBraceIndex = candidateText.lastIndexOf("}");
  const jsonText =
    firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex
      ? candidateText.slice(firstBraceIndex, lastBraceIndex + 1)
      : candidateText;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Paste valid JSON from ChatGPT before importing.");
  }

  const draft = parsed.workoutAppAiPlanDraft || parsed.planDraft || parsed;
  const plan = draft.plan || {};
  const workouts = draft.workouts || plan.workouts;

  if (!Array.isArray(workouts) || workouts.length === 0) {
    throw new Error("The draft must include a non-empty workouts array.");
  }

  return {
    analysis: draft.analysis || draft.coachNotes || parsed.analysis || null,
    plan,
    schema: draft.schema || parsed.schema || "",
    workouts,
  };
}

function normalizeAiPlanAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return null;
  }

  const normalizeList = (value) =>
    Array.isArray(value)
      ? value.map((item) => String(item || "").trim()).filter(Boolean)
      : String(value || "").trim()
        ? [String(value).trim()]
        : [];
  const normalized = {
    rationale: normalizeList(analysis.rationale),
    summary: String(analysis.summary || "").trim(),
    watchNext: normalizeList(analysis.watchNext || analysis.watch_next),
  };

  return normalized.summary ||
    normalized.rationale.length > 0 ||
    normalized.watchNext.length > 0
    ? normalized
    : null;
}

function normalizeAiDraftEquipment(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAiDraftRestSeconds(...values) {
  for (const value of values) {
    const restSeconds = normalizeRestSeconds(value);

    if (restSeconds) {
      return restSeconds;
    }
  }

  return null;
}

function getAiDraftMinimumReps(value, upperReps) {
  if (value == null || value === "") {
    return null;
  }

  const minimumReps = Number(value);
  const maximumReps = Number(upperReps);

  if (!Number.isFinite(minimumReps) || minimumReps < 1) {
    return null;
  }

  return Number.isFinite(maximumReps)
    ? Math.min(minimumReps, maximumReps)
    : minimumReps;
}

function getAiDraftDropSetCount(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(3, Math.round(parsed)))
    : 0;
}

function findAiDraftExercise(exerciseDraft, exerciseLibrary = []) {
  const draftName = normalizeExportText(exerciseDraft?.name);
  const draftEquipment = normalizeExportText(
    normalizeAiDraftEquipment(exerciseDraft?.equipment).join(", ")
  );
  const activeExercises = exerciseLibrary.filter(
    (exercise) => exercise.active !== "inactive"
  );

  return (
    activeExercises.find(
      (exercise) =>
        normalizeExportText(exercise.name) === draftName &&
        normalizeExportText(getExerciseEquipmentLabel(exercise)) === draftEquipment
    ) ||
    activeExercises.find(
      (exercise) => normalizeExportText(exercise.name) === draftName
    ) ||
    null
  );
}

function buildImportedAiPlanDraft({ draft, exerciseLibrary = [] }) {
  const importedAt = Date.now();
  const planId = importedAt;
  const planName =
    String(draft.plan?.name || "").trim() ||
    `AI Plan Draft ${new Date().toISOString().slice(0, 10)}`;
  const parsedDurationWeeks = Number(
    draft.plan?.trainingWeeks || draft.plan?.durationWeeks || draft.plan?.weeks || 4
  );
  const parsedDeloadWeeks = Number(draft.plan?.deloadWeeks);
  const durationWeeks = Number.isFinite(parsedDurationWeeks)
    ? parsedDurationWeeks
    : 4;
  const deloadWeeks = Number.isFinite(parsedDeloadWeeks)
    ? Math.max(0, parsedDeloadWeeks)
    : 0;
  const daysPerWeek = Number(draft.plan?.daysPerWeek) || draft.workouts.length;
  const aiAnalysis = normalizeAiPlanAnalysis(draft.analysis);
  const unmatchedExercises = [];
  const templates = draft.workouts.map((workoutDraft, workoutIndex) => {
    const templateId = importedAt + workoutIndex + 1;
    const planWorkoutId = `${planId}:ai-workout-${workoutIndex + 1}`;

    return {
      dayNumber: Number(workoutDraft.dayNumber) || workoutIndex + 1,
      exercises: (workoutDraft.exercises || []).map((exerciseDraft, exerciseIndex) => {
        const libraryExercise = findAiDraftExercise(exerciseDraft, exerciseLibrary);
        const setDrafts = Array.isArray(exerciseDraft.sets)
          ? exerciseDraft.sets
          : Array.from(
              { length: Math.max(1, Number(exerciseDraft.sets) || 3) },
              () => ({
                reps: exerciseDraft.reps,
                rir: exerciseDraft.rir,
              })
            );
        const exerciseRestSeconds = getAiDraftRestSeconds(
          exerciseDraft.restSeconds,
          exerciseDraft.rest_seconds
        );

        if (!libraryExercise) {
          unmatchedExercises.push(exerciseDraft.name || `Exercise ${exerciseIndex + 1}`);
        }

        return {
          equipment:
            libraryExercise?.equipment ||
            normalizeAiDraftEquipment(exerciseDraft.equipment),
          exerciseId: libraryExercise?.id || null,
          id: importedAt + workoutIndex * 100 + exerciseIndex,
          muscles: libraryExercise?.muscles || exerciseDraft.muscles || [],
          name: libraryExercise?.name || exerciseDraft.name || "Exercise",
          planMuscle: exerciseDraft.planMuscle || libraryExercise?.muscles?.[0] || "",
          ...(exerciseRestSeconds ? { restSeconds: exerciseRestSeconds } : {}),
          sets: [
            ...setDrafts.map((setDraft, setIndex) => {
              const reps = setDraft?.reps ?? exerciseDraft.reps ?? "";
              const minimumReps = getAiDraftMinimumReps(
                setDraft?.minimumReps ??
                  setDraft?.minimum_reps ??
                  exerciseDraft.minimumReps ??
                  exerciseDraft.minimum_reps,
                reps
              );

              return {
                id:
                  importedAt +
                  workoutIndex * 1000 +
                  exerciseIndex * 100 +
                  setIndex,
                ...(minimumReps == null ? {} : { minimumReps }),
                reps: String(reps),
                restSeconds:
                  getAiDraftRestSeconds(
                    setDraft?.restSeconds,
                    setDraft?.rest_seconds,
                    exerciseRestSeconds
                  ) || undefined,
                rir: String(setDraft?.rir ?? exerciseDraft.rir ?? ""),
              };
            }),
            ...Array.from(
              {
                length: getAiDraftDropSetCount(
                  exerciseDraft.dropSets ?? exerciseDraft.drop_sets
                ),
              },
              (_, dropSetIndex) => ({
                id:
                  importedAt +
                  workoutIndex * 1000 +
                  exerciseIndex * 100 +
                  setDrafts.length +
                  dropSetIndex,
                isDropSet: true,
                prescribedReps: "AMRAP",
                prescribedRestSeconds: 0,
                prescribedRir: "0",
                reps: "AMRAP",
                restSeconds: 0,
                rir: "0",
                targetReps: "AMRAP",
                targetRir: "0",
              })
            ),
          ],
          supersetGroup: exerciseDraft.supersetGroup || null,
          weeklyPrescriptions: Array.isArray(exerciseDraft.weeklyPrescriptions)
            ? exerciseDraft.weeklyPrescriptions.map((week) => ({
                ...week,
                ...((week?.dropSets ?? week?.drop_sets) == null
                  ? {}
                  : {
                      dropSets: getAiDraftDropSetCount(
                        week?.dropSets ?? week?.drop_sets
                      ),
                    }),
                ...(getAiDraftMinimumReps(
                  week?.minimumReps ?? week?.minimum_reps,
                  week?.reps
                ) == null
                  ? {}
                  : {
                      minimumReps: getAiDraftMinimumReps(
                        week?.minimumReps ?? week?.minimum_reps,
                        week?.reps
                      ),
                    }),
                restSeconds:
                  getAiDraftRestSeconds(
                    week?.restSeconds,
                    week?.rest_seconds,
                    exerciseRestSeconds
                  ) || undefined,
              }))
            : [],
        };
      }),
      id: templateId,
      name: workoutDraft.name || `Day ${workoutIndex + 1}`,
      planId,
      planWorkoutId,
      workoutType: workoutDraft.workoutType || null,
      workoutTypeLabel: workoutDraft.workoutTypeLabel || workoutDraft.workoutType || null,
    };
  });
  const importedGoal = String(draft.plan?.goal || "").trim();
  const normalizedGoal = /maintain|maintenance/i.test(importedGoal)
    ? "maintain"
    : "progress";
  const plan = {
    config: {
      deload:
        draft.plan?.deload != null
          ? Boolean(draft.plan.deload)
          : deloadWeeks > 0,
      deloadWeeks,
      reps: draft.plan?.reps || "",
      rir: draft.plan?.rir || "",
      rirPeriodization: draft.plan?.rirPeriodization || "none",
      sets: draft.plan?.sets || undefined,
      workoutTypeByDay: {},
    },
    createdAt: new Date().toISOString(),
    currentWeek: 1,
    daysPerWeek,
    durationWeeks,
    goal: normalizedGoal,
    ...(importedGoal && !/^(progress|maintain|maintenance)$/i.test(importedGoal)
      ? { goalDescription: importedGoal }
      : {}),
    id: planId,
    aiAnalysis,
    name: planName,
    planType: draft.plan?.planType || "ai",
    status: "inactive",
    updatedAt: new Date().toISOString(),
    workouts: templates.map((template, index) => ({
      dayNumber: template.dayNumber || index + 1,
      name: template.name,
      planWorkoutId: template.planWorkoutId,
      setRestSecondsByPosition: (template.exercises || []).reduce(
        (restByPosition, exercise, exerciseIndex) => {
          const restSeconds = (exercise.sets || []).map((set) =>
            normalizeRestSeconds(set.restSeconds)
          );

          if (restSeconds.some(Boolean)) {
            restByPosition[exerciseIndex + 1] = restSeconds;
          }

          return restByPosition;
        },
        {}
      ),
      templateId: template.id,
      workoutType: template.workoutType,
      workoutTypeLabel: template.workoutTypeLabel,
    })),
  };

  return {
    plan,
    templates,
    unmatchedExercises,
  };
}

function recomputeExerciseE1RMMetadata(
  history,
  existingMetadata,
  exerciseIds,
  exerciseLibrary = [],
  bodyWeightEntries = []
) {
  const exerciseIdSet = new Set(
    Array.from(exerciseIds)
      .filter((exerciseId) => exerciseId !== undefined && exerciseId !== null)
      .map(String)
  );

  if (exerciseIdSet.size === 0) {
    return existingMetadata;
  }

  const metadata = {
    ...existingMetadata,
  };

  exerciseIdSet.forEach((exerciseId) => {
    let latestE1RM = null;
    let latestTime = -Infinity;
    let maxE1RM = null;

    history.forEach((workout) => {
      const completedTime = getHistoryWorkoutTime(workout);
      const bodyWeight = getLatestBodyWeightForDate(
        bodyWeightEntries,
        workout.completedAtIso || workout.completed_at || workout.completedAt
      );

      (workout.exercises || []).forEach((exercise) => {
        if (String(exercise.exerciseId) !== exerciseId) {
          return;
        }

        const exerciseContext = findExerciseForHistoryExercise(exercise, exerciseLibrary);
        const workoutBestE1RM = (exercise.sets || []).reduce((best, set) => {
          const e1rm = getHistorySetE1RM(set, exerciseContext, bodyWeight);

          return e1rm && (!best || e1rm > best) ? e1rm : best;
        }, null);

        if (!workoutBestE1RM) {
          return;
        }

        if (!maxE1RM || workoutBestE1RM > maxE1RM.value) {
          maxE1RM = {
            date: workout.completedAt,
            value: workoutBestE1RM,
          };
        }

        if (completedTime > latestTime) {
          latestTime = completedTime;
          latestE1RM = {
            date: workout.completedAt,
            value: workoutBestE1RM,
          };
        }
      });
    });

    metadata[exerciseId] = {
      ...(metadata[exerciseId] || {}),
      latestE1RM,
      maxE1RM,
    };
  });

  return metadata;
}

function hasInactiveExercisePreference(exerciseLibrary) {
  return exerciseLibrary.some((exercise) => exercise.active === "inactive");
}

function hasLocalNormalizedUserData(data) {
  return (
    data.templates.length > 0 ||
    data.plans.length > 0 ||
    data.history.length > 0 ||
    data.sessions.length > 0 ||
    getCustomExercises(data.exerciseLibrary).length > 0 ||
    hasInactiveExercisePreference(data.exerciseLibrary)
  );
}

function hasNormalizedCloudData(summary) {
  return Boolean(
    summary &&
      (summary.workouts > 0 ||
        summary.trainingPlans > 0 ||
        summary.workoutSessions > 0 ||
        summary.exercisePreferences > 0 ||
        summary.plateInventory > 0)
  );
}

function attachPlanLinksToTemplates(templates, plans) {
  const planLinksByTemplateId = new Map();

  plans.forEach((plan) => {
    (plan.workouts || []).forEach((workout) => {
      if (workout.templateId == null) {
        return;
      }

      planLinksByTemplateId.set(String(workout.templateId), {
        planId: plan.id,
        planWorkoutId: workout.planWorkoutId,
        setRestSecondsByPosition: workout.setRestSecondsByPosition || {},
        weeklyPrescriptionsByPosition:
          workout.weeklyPrescriptionsByPosition || {},
        workoutType: workout.workoutType || null,
        workoutTypeLabel: workout.workoutTypeLabel || null,
      });
    });
  });

  return templates.map((template) => {
    const link = planLinksByTemplateId.get(String(template.id));
    const nextTemplate = {
      ...template,
    };

    if (link) {
      nextTemplate.planId = link.planId;
      nextTemplate.planWorkoutId = link.planWorkoutId;
      nextTemplate.workoutType = link.workoutType || template.workoutType || null;
      nextTemplate.workoutTypeLabel =
        link.workoutTypeLabel || template.workoutTypeLabel || null;
      nextTemplate.exercises = (template.exercises || []).map(
        (exercise, exerciseIndex) => {
          const weeklyPrescriptions =
            link.weeklyPrescriptionsByPosition?.[exerciseIndex + 1];
          const setRestSeconds =
            link.setRestSecondsByPosition?.[exerciseIndex + 1];
          const exerciseWithRest = Array.isArray(setRestSeconds)
            ? {
                ...exercise,
                sets: (exercise.sets || []).map((set, setIndex) => ({
                  ...set,
                  ...(normalizeRestSeconds(setRestSeconds[setIndex])
                    ? {
                        restSeconds: normalizeRestSeconds(
                          setRestSeconds[setIndex]
                        ),
                      }
                    : {}),
                })),
              }
            : exercise;

          if (!Array.isArray(weeklyPrescriptions)) {
            return exerciseWithRest;
          }

          return {
            ...exerciseWithRest,
            weeklyPrescriptions,
          };
        }
      );
    } else {
      delete nextTemplate.planId;
      delete nextTemplate.planWorkoutId;
    }

    return nextTemplate;
  });
}

function resolvePlanWorkoutTemplateIds(plans, templates) {
  function normalizeGeneratedWorkoutName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+\(modified\)\s*$/g, "")
      .replace(/\s+copy\s*$/g, "")
      .replace(/\s+\([^)]*\)\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return plans.map((plan) => ({
    ...plan,
    workouts: (plan.workouts || []).map((workout) => {
      const normalizedWorkoutName = normalizeGeneratedWorkoutName(workout.name);
      const exactMatch =
        workout.templateId != null
          ? templates.find(
              (template) => String(template.id) === String(workout.templateId)
            )
          : null;
      const planWorkoutMatch = templates.find(
        (template) =>
          workout.planWorkoutId &&
          String(template.planWorkoutId) === String(workout.planWorkoutId)
      );
      const planNameMatch = templates.find(
        (template) =>
          String(template.planId) === String(plan.id) &&
          template.name === workout.name
      );
      const nameMatch = templates.find(
        (template) =>
          template.name === workout.name &&
          (!template.planId || String(template.planId) === String(plan.id))
      );
      const normalizedNameMatch = templates.find(
        (template) =>
          normalizeGeneratedWorkoutName(template.name) ===
            normalizedWorkoutName &&
          (!template.planId || String(template.planId) === String(plan.id))
      );
      const matchedTemplate =
        exactMatch ||
        planWorkoutMatch ||
        planNameMatch ||
        nameMatch ||
        normalizedNameMatch;

      return {
        ...workout,
        templateId: matchedTemplate?.id ?? workout.templateId ?? null,
      };
    }),
  }));
}

function getPlanTemplateIdSet(plans) {
  const ids = new Set();

  plans.forEach((plan) => {
    (plan.workouts || []).forEach((workout) => {
      if (workout.templateId != null) {
        ids.add(String(workout.templateId));
      }
    });
  });

  return ids;
}

function getAutoSyncSummary({
  exercisePreferences,
  domains = [],
  history,
  mode,
  plateInventory,
  plans,
  workouts,
}) {
  const verb =
    mode === "hydrate" ? "Hydrated" : mode === "check" ? "Checked" : "Synced";
  const domainSummary =
    domains.length > 0 ? ` Pushed: ${domains.join(", ")}.` : "";

  return `${verb}: ${workouts.downloaded} workouts, ${plans.downloaded} plans, ${history.downloaded} completed workouts, ${exercisePreferences.updated} exercise preferences, ${plateInventory.downloaded} plate inventory.${domainSummary}`;
}

function readNormalizedSyncDirtyDomains() {
  try {
    const value = JSON.parse(
      localStorage.getItem(NORMALIZED_SYNC_DIRTY_DOMAINS_KEY) || "[]"
    );

    if (Array.isArray(value)) {
      return value.filter((domain) => NORMALIZED_SYNC_DOMAINS.includes(domain));
    }
  } catch (error) {
    console.error("Failed to read normalized sync dirty domains:", error);
  }

  return localStorage.getItem(NORMALIZED_SYNC_DIRTY_KEY) === "true"
    ? [...NORMALIZED_SYNC_DOMAINS]
    : [];
}

function writeNormalizedSyncDirtyDomains(domains) {
  const uniqueDomains = [...new Set(domains)].filter((domain) =>
    NORMALIZED_SYNC_DOMAINS.includes(domain)
  );

  safeSetLocalStorage(
    NORMALIZED_SYNC_DIRTY_DOMAINS_KEY,
    JSON.stringify(uniqueDomains)
  );
  safeSetLocalStorage(
    NORMALIZED_SYNC_DIRTY_KEY,
    uniqueDomains.length > 0 ? "true" : "false"
  );
}

function readLastNormalizedSyncAt() {
  return localStorage.getItem(LAST_NORMALIZED_SYNC_KEY) || "";
}

function formatLastNormalizedSyncAt(value) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCurrentTimeMs() {
  return new Date().getTime();
}

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

function getPlanCompletionsForWeek(plan, weekNumber, history = []) {
  return getPlanCompletions(plan, history).filter(
    (completion) => Number(completion.weekNumber) === Number(weekNumber)
  );
}

function getPlanCompletionKey(completion) {
  const weekNumber = Number(completion?.weekNumber);
  const planWorkoutId = completion?.planWorkoutId;

  if (!Number.isFinite(weekNumber) || planWorkoutId == null) {
    return null;
  }

  return `${weekNumber}:${String(planWorkoutId)}`;
}

function getPlanCompletions(plan, history = []) {
  const completionsByKey = new Map();

  for (const completion of plan?.completions || []) {
    const key = getPlanCompletionKey(completion);

    if (key) {
      completionsByKey.set(key, completion);
    }
  }

  for (const workout of history || []) {
    if (String(workout?.planId ?? workout?.plan_id ?? "") !== String(plan?.id)) {
      continue;
    }

    const completion = {
      completedAt:
        workout.completedAt ||
        workout.completed_at ||
        workout.completedAtIso ||
        workout.completed_at_iso ||
        "",
      planWorkoutId: workout.planWorkoutId ?? workout.plan_workout_id,
      sessionId: workout.id || workout.source_key || workout.sessionId || "",
      weekNumber: workout.planWeek ?? workout.plan_week,
    };
    const key = getPlanCompletionKey(completion);

    if (key && !completionsByKey.has(key)) {
      completionsByKey.set(key, completion);
    }
  }

  return Array.from(completionsByKey.values()).sort((a, b) => {
    const weekDiff = Number(a.weekNumber) - Number(b.weekNumber);

    if (weekDiff !== 0) {
      return weekDiff;
    }

    return String(a.planWorkoutId).localeCompare(String(b.planWorkoutId));
  });
}

function getReconciledPlanCurrentWeek(plan, completions) {
  const currentWeek = Number(plan?.currentWeek) || 1;
  const totalWeeks = (Number(plan?.durationWeeks) || 1) + (plan?.config?.deload ? 1 : 0);
  const workoutsPerWeek = plan?.workouts?.length || 0;

  if (workoutsPerWeek === 0 || completions.length === 0) {
    return currentWeek;
  }

  const completedWeeks = new Map();

  for (const completion of completions) {
    const weekNumber = Number(completion.weekNumber);

    if (!Number.isFinite(weekNumber)) {
      continue;
    }

    completedWeeks.set(weekNumber, (completedWeeks.get(weekNumber) || 0) + 1);
  }

  let derivedWeek = currentWeek;

  for (const [weekNumber, completedCount] of completedWeeks.entries()) {
    derivedWeek = Math.max(derivedWeek, weekNumber);

    if (completedCount >= workoutsPerWeek) {
      derivedWeek = Math.max(derivedWeek, Math.min(weekNumber + 1, totalWeeks));
    }
  }

  return derivedWeek;
}

function reconcilePlanCompletionsWithHistory(plans = [], history = []) {
  return plans.map((plan) => {
    const completions = getPlanCompletions(plan, history);

    return {
      ...plan,
      completions,
      currentWeek: getReconciledPlanCurrentWeek(plan, completions),
    };
  });
}

function getPlanTotalWeeks(plan) {
  return (Number(plan?.durationWeeks) || 1) + (plan?.config?.deload ? 1 : 0);
}

function getActiveModalDialogs() {
  if (typeof document === "undefined") {
    return [];
  }

  return Array.from(
    document.querySelectorAll('[role="dialog"][aria-modal="true"]')
  ).filter(
    (dialog) =>
      dialog.isConnected &&
      !dialog.hidden &&
      dialog.getClientRects().length > 0
  );
}

function getScrollableModalAncestor(target, modalRoot) {
  if (!(target instanceof Element) || !(modalRoot instanceof Element)) {
    return null;
  }

  let element = target;

  while (element && element !== document.body) {
    if (modalRoot.contains(element)) {
      const styles = window.getComputedStyle(element);
      const canScrollY =
        /(auto|scroll)/.test(styles.overflowY) &&
        element.scrollHeight > element.clientHeight;

      if (canScrollY) {
        return element;
      }
    }

    if (element === modalRoot) {
      break;
    }

    element = element.parentElement;
  }

  return null;
}

function useModalScrollGuard() {
  const scrollLockRef = useRef({
    frameId: null,
    locked: false,
    modalCount: 0,
    previousBodyStyles: null,
    previousDocumentStyles: null,
    scrollY: 0,
  });

  useEffect(() => {
    function lockDocumentScroll() {
      const lockState = scrollLockRef.current;

      if (lockState.locked) {
        return;
      }

      lockState.scrollY = window.scrollY || window.pageYOffset || 0;
      lockState.previousBodyStyles = {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width,
      };
      lockState.previousDocumentStyles = {
        overflow: document.documentElement.style.overflow,
        overscrollBehavior: document.documentElement.style.overscrollBehavior,
      };
      document.documentElement.classList.add("modal-scroll-locked");
      document.body.classList.add("modal-scroll-locked");
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.overscrollBehavior = "none";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockState.scrollY}px`;
      document.body.style.width = "100%";
      lockState.locked = true;
    }

    function unlockDocumentScroll() {
      const lockState = scrollLockRef.current;

      if (!lockState.locked) {
        return;
      }

      document.documentElement.classList.remove("modal-scroll-locked");
      document.body.classList.remove("modal-scroll-locked");
      document.body.style.overflow = lockState.previousBodyStyles?.overflow || "";
      document.body.style.position = lockState.previousBodyStyles?.position || "";
      document.body.style.top = lockState.previousBodyStyles?.top || "";
      document.body.style.width = lockState.previousBodyStyles?.width || "";
      document.documentElement.style.overflow =
        lockState.previousDocumentStyles?.overflow || "";
      document.documentElement.style.overscrollBehavior =
        lockState.previousDocumentStyles?.overscrollBehavior || "";
      window.scrollTo(0, lockState.scrollY);
      lockState.locked = false;
      lockState.modalCount = 0;
    }

    function updateModalScrollState() {
      const lockState = scrollLockRef.current;

      if (lockState.frameId != null) {
        cancelAnimationFrame(lockState.frameId);
      }

      lockState.frameId = requestAnimationFrame(() => {
        lockState.frameId = null;
        const dialogs = getActiveModalDialogs();
        lockState.modalCount = dialogs.length;

        if (dialogs.length > 0) {
          lockDocumentScroll();
          const topDialog = dialogs[dialogs.length - 1];

          if (
            topDialog &&
            !topDialog.contains(document.activeElement)
          ) {
            if (!topDialog.hasAttribute("tabindex")) {
              topDialog.setAttribute("tabindex", "-1");
            }

            topDialog.focus({ preventScroll: true });
          }
        } else {
          unlockDocumentScroll();
        }
      });
    }

    function blockBackgroundWheel(event) {
      const dialogs = getActiveModalDialogs();
      const topDialog = dialogs[dialogs.length - 1];

      if (!topDialog || topDialog.contains(event.target)) {
        return;
      }

      event.preventDefault();
    }

    function blockBackgroundTouchMove(event) {
      const dialogs = getActiveModalDialogs();
      const topDialog = dialogs[dialogs.length - 1];

      if (!topDialog) {
        return;
      }

      if (!topDialog.contains(event.target)) {
        event.preventDefault();
        return;
      }

      if (!getScrollableModalAncestor(event.target, topDialog)) {
        event.preventDefault();
      }
    }

    const observer = new MutationObserver(updateModalScrollState);

    observer.observe(document.body, {
      attributeFilter: ["aria-modal", "class", "hidden", "role", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    document.addEventListener("wheel", blockBackgroundWheel, {
      passive: false,
    });
    document.addEventListener("touchmove", blockBackgroundTouchMove, {
      passive: false,
    });
    updateModalScrollState();

    return () => {
      observer.disconnect();
      document.removeEventListener("wheel", blockBackgroundWheel);
      document.removeEventListener("touchmove", blockBackgroundTouchMove);

      if (scrollLockRef.current.frameId != null) {
        cancelAnimationFrame(scrollLockRef.current.frameId);
      }

      unlockDocumentScroll();
    };
  }, []);
}

function isPlanWorkoutComplete(plan, planWorkoutId, weekNumber, history = []) {
  return getPlanCompletionsForWeek(plan, weekNumber, history).some(
    (completion) => String(completion.planWorkoutId) === String(planWorkoutId)
  );
}

function getCompletedPlanWorkoutHistory(plan, planWorkoutId, weekNumber, history) {
  return findPlanWorkoutHistory({
    history,
    plan,
    planWorkoutId,
    weekNumber,
  });
}

function getMissingPlanWorkouts(plan, templates) {
  return (plan.workouts || []).filter(
    (workout) =>
      workout.templateId == null ||
      !templates.some(
        (template) => String(template.id) === String(workout.templateId)
      )
  );
}

function getPlanWeekLabel(plan, weekNumber) {
  return plan.config?.deload && weekNumber > Number(plan.durationWeeks || 0)
    ? "Deload"
    : `Week ${weekNumber}`;
}

function getPlanWeekStatus(plan, displayWeek = plan.currentWeek || 1, history = []) {
  const currentWeek = displayWeek;
  const completedThisWeek = getPlanCompletionsForWeek(
    plan,
    currentWeek,
    history
  ).length;
  const totalThisWeek = plan.workouts?.length || 0;
  const totalWeeks = getPlanTotalWeeks(plan);
  const currentWeekLabel =
    plan.config?.deload && currentWeek > Number(plan.durationWeeks || 0)
      ? "D"
      : currentWeek;

  return {
    completedThisWeek,
    currentWeek,
    currentWeekLabel,
    totalThisWeek,
    totalWeeks,
  };
}

function isPlanWeekComplete(plan, weekNumber) {
  const totalThisWeek = plan.workouts?.length || 0;

  return (
    totalThisWeek > 0 &&
    getPlanCompletionsForWeek(plan, weekNumber).length >= totalThisWeek
  );
}

function getPlanWeekOptions(plan) {
  const totalWeeks = getPlanTotalWeeks(plan);

  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekNumber = index + 1;

    return {
      completed: isPlanWeekComplete(plan, weekNumber),
      label: getPlanWeekLabel(plan, weekNumber),
      weekNumber,
    };
  });
}

function getInitialBuildNotice() {
  const lastSeenBuildTime = localStorage.getItem(LAST_SEEN_BUILD_KEY);
  const pendingUpdate = JSON.parse(
    localStorage.getItem(PENDING_UPDATE_KEY) || "null"
  );

  if (!lastSeenBuildTime) {
    safeSetLocalStorage(LAST_SEEN_BUILD_KEY, BUILD_TIME);

    if (pendingUpdate?.buildTime && pendingUpdate.buildTime !== BUILD_TIME) {
      localStorage.removeItem(PENDING_UPDATE_KEY);
      rememberUpdateConfirmation();

      return "updated";
    }
  } else if (lastSeenBuildTime !== BUILD_TIME) {
    safeSetLocalStorage(LAST_SEEN_BUILD_KEY, BUILD_TIME);
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
  safeSetLocalStorage(
    PENDING_UPDATE_KEY,
    JSON.stringify({
      buildTime: BUILD_TIME,
      checkedAt: Date.now(),
    })
  );
}

function rememberUpdateConfirmation() {
  safeSetLocalStorage(
    UPDATE_CONFIRMATION_KEY,
    JSON.stringify({
      expiresAt: Date.now() + UPDATE_CONFIRMATION_DURATION,
    })
  );
}

async function getLiveBuildTime() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    MANUAL_UPDATE_CHECK_TIMEOUT_MS
  );

  let response;

  try {
    response = await fetch(`${baseUrl}index.html?update-check=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Live build check failed with ${response.status}.`);
  }

  const html = await response.text();
  const match = html.match(
    /<meta\s+name=["']app-build-time["']\s+content=["']([^"']+)["']/i
  );

  return match ? match[1] : "";
}

function withUpdateTimeout(promise, message = "Update check timed out.") {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(message)),
      MANUAL_UPDATE_CHECK_TIMEOUT_MS
    );

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(message)),
      timeoutMs
    );

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function reloadWithoutServiceWorkerCache() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations
        .filter((registration) =>
          registration.scope.includes(import.meta.env.BASE_URL || "/")
        )
        .map((registration) => registration.unregister())
    );
  }

  window.location.replace(
    `${import.meta.env.BASE_URL || "/"}?updated=${Date.now()}`
  );
}

// STORAGE MIGRATION BASELINE
const savedStorageVersion = getSavedStorageVersion();

export default function App() {
  useModalScrollGuard();

  const initialWorkoutData = useState(() =>
    normalizeWorkoutDataPlanTypes(
      loadWorkoutData({
        seedExercises,
      })
    )
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

  const [templates, setTemplates] = useState(initialWorkoutData.templates);

  const [plans, setPlans] = useState(initialWorkoutData.plans);

  const [sessions, setSessions] = useState(initialWorkoutData.sessions);

  const [history, setHistory] = useState(initialWorkoutData.history);

  const [localOwnerUserId, setLocalOwnerUserId] = useState(
    initialWorkoutData.ownerUserId || null
  );

  // EXERCISE LIBRARY
  // merge saved exercises + missing built-in exercises

  const [exerciseLibrary, setExerciseLibrary] = useState(() => {
    return initialWorkoutData.exerciseLibrary;
  });

  const [exerciseMetadata, setExerciseMetadata] = useState(
    initialWorkoutData.exerciseMetadata
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedTemplatePlanWeek, setSelectedTemplatePlanWeek] = useState(null);
  const [autoStartTemplateId, setAutoStartTemplateId] = useState(null);
  const [templatePreviewEditActive, setTemplatePreviewEditActive] =
    useState(false);

  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(null);
  const [workoutMenuTemplateId, setWorkoutMenuTemplateId] = useState(null);

  const [templateSort, setTemplateSort] = useState("recent");

  const [selectedSessionId, setSelectedSessionId] = useState(
    initialWorkoutData.selectedSessionId
  );
  const [selectedHistory, setSelectedHistory] = useState(null);

  const [selectedHistoryList, setSelectedHistoryList] = useState(null);
  const [planCompletionPrompt, setPlanCompletionPrompt] = useState(null);
  const [confirmDeleteHistory, setConfirmDeleteHistory] = useState(null);

  const [showExercises, setShowExercises] = useState(false);

  const [showPlans, setShowPlans] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);

  const [showNutrition, setShowNutrition] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [plateInventory, setPlateInventory] = useState(readPlateInventory);
  const [plateInventoryOwnerUserId, setPlateInventoryOwnerUserId] = useState(
    readPlateInventoryOwner
  );
  const [newPlateDrafts, setNewPlateDrafts] = useState({
    oneInch: "",
    twoInch: "",
  });
  const [plateCategoryExpanded, setPlateCategoryExpanded] = useState({
    oneInch: false,
    twoInch: false,
  });
  const [equipmentInventoryExpanded, setEquipmentInventoryExpanded] =
    useState(false);
  const [plateCountPicker, setPlateCountPicker] = useState(null);
  const [equipmentWeightPicker, setEquipmentWeightPicker] = useState(null);
  const [loadCalculatorDraft, setLoadCalculatorDraft] = useState({
    cablePulleyCount: 1,
    dumbbellCount: 1,
    equipmentId: "barbell",
    optionIndex: 0,
    weight: "",
  });
  const deferredLoadCalculatorDraft = useDeferredValue(loadCalculatorDraft);
  const [expandedPlanIds, setExpandedPlanIds] = useState({});
  const [planDisplayWeeks, setPlanDisplayWeeks] = useState({});
  const [weekPickerPlanId, setWeekPickerPlanId] = useState(null);
  const [planComparisonOpen, setPlanComparisonOpen] = useState(false);
  const [selectedPlanComparisonIds, setSelectedPlanComparisonIds] = useState([]);
  const [workoutsExpanded, setWorkoutsExpanded] = useState(true);
  const [completedPlanActions, setCompletedPlanActions] = useState(null);
  const [extendPlanTarget, setExtendPlanTarget] = useState(null);
  const [aiPlanNotesTarget, setAiPlanNotesTarget] = useState(null);

  const [updateStatus, setUpdateStatus] = useState("");

  const [buildNotice, setBuildNotice] = useState(getInitialBuildNotice);

  const [lastUpdateCheck, setLastUpdateCheck] = useState(null);

  const [indexedDbReady, setIndexedDbReady] = useState(false);

  const [authSession, setAuthSession] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(
    !isSupabaseConfigured
  );
  const [calendarNutritionEntries, setCalendarNutritionEntries] = useState(() =>
    readLocalArray(NUTRITION_LOG_KEY)
  );
  const [nutritionSettingsStatus, setNutritionSettingsStatus] = useState("");
  const [nutritionSettingsPending, setNutritionSettingsPending] = useState(0);
  const [nutritionSettingsSyncing, setNutritionSettingsSyncing] = useState(false);

  const [authEmail, setAuthEmail] = useState("");

  const [authPassword, setAuthPassword] = useState("");

  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured
      ? "Sign in to enable automatic sync."
      : "Sync is not configured."
  );

  const [authLoading, setAuthLoading] = useState(false);

  const [approvalStatus, setApprovalStatus] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [approvalFromCache, setApprovalFromCache] = useState(false);
  const [approvalAdminRows, setApprovalAdminRows] = useState([]);
  const [approvalAdminStatus, setApprovalAdminStatus] = useState("");
  const [approvalAdminLoading, setApprovalAdminLoading] = useState(false);
  const [approvalAdminExpanded, setApprovalAdminExpanded] = useState(false);

  const [changePasswordDialogOpen, setChangePasswordDialogOpen] =
    useState(false);
  const [changePasswordDraft, setChangePasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changePasswordStatus, setChangePasswordStatus] = useState("");
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  const [syncStatus, setSyncStatus] = useState(
    "Automatic sync runs after sign-in. Manual controls remain available."
  );

  const [syncLoading, setSyncLoading] = useState(false);
  const [activeSyncAction, setActiveSyncAction] = useState(null);

  const [lastNormalizedSyncAt, setLastNormalizedSyncAt] = useState(
    readLastNormalizedSyncAt
  );
  const [normalizedSyncDirtyDomains, setNormalizedSyncDirtyDomains] = useState(
    readNormalizedSyncDirtyDomains
  );

  const [showAdvancedSyncTools, setShowAdvancedSyncTools] = useState(false);

  const [dataAuditStatus, setDataAuditStatus] = useState("");

  const [dataAuditSummary, setDataAuditSummary] = useState(null);

  const [, setAiPlanStatus] = useState("");
  const [exportExpanded, setExportExpanded] = useState(false);
  const [exerciseExportMode, setExerciseExportMode] = useState("all");
  const [exerciseExportSearch, setExerciseExportSearch] = useState("");
  const [selectedExerciseExportKeys, setSelectedExerciseExportKeys] = useState([]);
  const [exerciseExportStatus, setExerciseExportStatus] = useState("");
  const [planExportMode, setPlanExportMode] = useState("active");
  const [selectedPlanExportIds, setSelectedPlanExportIds] = useState([]);
  const [planExportStatus, setPlanExportStatus] = useState("");

  const currentWorkoutDataRef = useRef(null);

  const authSessionRef = useRef(null);

  const automaticSyncInFlightRef = useRef(false);

  const automaticSyncQueuedRef = useRef(false);
  const automaticSyncAttemptIdRef = useRef(0);

  const automaticSyncHydratedUserRef = useRef(null);

  const previousAuthUserIdRef = useRef(undefined);

  const automaticSyncSuppressUntilRef = useRef(0);

  const lastAutomaticSyncAttemptRef = useRef(0);

  const checkpointSyncTimeoutRef = useRef(null);

  const localDataRevisionRef = useRef(0);

  const plateInventoryRef = useRef(plateInventory);

  const plateInventoryRevisionRef = useRef(0);

  const normalizedSyncDirtyDomainsRef = useRef(
    new Set(readNormalizedSyncDirtyDomains())
  );

  const exercisePreferencesDirtyReadyRef = useRef(false);

  const workoutDirtyReadyRef = useRef(false);

  const historyDirtyReadyRef = useRef(false);

  const planDirtyReadyRef = useRef(false);

  const previousHistoryLengthRef = useRef(history.length);
  const workoutCompletionSyncHistoryLengthRef = useRef(null);
  const nutritionStartupHydratedUserRef = useRef(null);

  const userEmail = authSession?.user?.email || "";
  const normalizedUserEmail = userEmail.toLowerCase();
  const isIraSettingsUser = normalizedUserEmail === APP_OWNER_EMAIL;
  const appAccessAllowed = Boolean(
    authSession?.user?.id &&
      (isIraSettingsUser || approvalStatus?.status === "approved")
  );
  const pendingApprovalCount = isIraSettingsUser
    ? approvalAdminRows.filter((row) => row.status === "pending").length
    : 0;
  const pendingApprovalMessage =
    pendingApprovalCount === 1
      ? "1 pending approval"
      : `${pendingApprovalCount} pending approvals`;

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
            session ? "Signed in. Automatic sync is on." : "Signed out."
          );
        }
      } catch (error) {
        console.error("Failed to load auth session:", error);

        if (!cancelled) {
          setAuthStatus(`Sync sign-in failed: ${error.message}`);
        }
      } finally {
        if (!cancelled) {
          setAuthInitialized(true);
        }
      }
    }

    loadAuthSession();

    const unsubscribe = subscribeToAuthChanges((session) => {
      setAuthSession(session);
      setAuthStatus(
        session ? "Signed in. Automatic sync is on." : "Signed out."
      );
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const userId = authSession?.user?.id || null;
    const email = authSession?.user?.email || "";

    async function loadApprovalStatus() {
      if (!userId) {
        setApprovalStatus(null);
        setApprovalError("");
        setApprovalFromCache(false);
        return;
      }

      if (!isSupabaseConfigured) {
        const cachedApproval = readApprovalCache(userId);
        setApprovalStatus(cachedApproval);
        setApprovalFromCache(cachedApproval?.status === "approved");
        setApprovalError(
          cachedApproval?.status === "approved"
            ? "Using cached approval. Sync will resume when Supabase is available."
            : "Supabase is not configured, so approval cannot be verified."
        );
        return;
      }

      setApprovalLoading(true);
      setApprovalError("");

      try {
        const status = await getMyApprovalStatus();

        if (cancelled) {
          return;
        }

        const normalizedStatus = {
          email: status?.email || email,
          status: status?.status || "pending",
        };

        setApprovalStatus(normalizedStatus);
        setApprovalFromCache(false);

        if (normalizedStatus.status === "approved") {
          writeApprovalCache(userId, normalizedStatus);
          setAuthStatus("Signed in. Automatic sync is on.");
        } else {
          clearApprovalCache(userId);
          setAuthStatus(
            normalizedStatus.status === "denied"
              ? "Account access denied."
              : "Account pending approval."
          );
        }
      } catch (error) {
        console.error("Failed to verify account approval:", error);

        if (cancelled) {
          return;
        }

        const cachedApproval = readApprovalCache(userId);
        setApprovalStatus(cachedApproval);
        setApprovalFromCache(cachedApproval?.status === "approved");
        setApprovalError(
          cachedApproval?.status === "approved"
            ? "Approval check failed. Using cached approval until the database is reachable."
            : `Approval check failed: ${error.message}`
        );
      } finally {
        if (!cancelled) {
          setApprovalLoading(false);
        }
      }
    }

    loadApprovalStatus();

    return () => {
      cancelled = true;
    };
  }, [authSession?.user?.id, authSession?.user?.email]);

  async function loadApprovalAdminRows({ updateStatus = true } = {}) {
    if (!authSession?.user?.id || !isIraSettingsUser) {
      setApprovalAdminRows([]);
      return;
    }

    setApprovalAdminLoading(true);
    if (updateStatus) {
      setApprovalAdminStatus("Loading approvals...");
    }

    try {
      const rows = await listAppUserApprovals();
      setApprovalAdminRows(rows);
      if (updateStatus) {
        setApprovalAdminStatus(
          rows.length > 0
            ? `${rows.length} account approvals loaded.`
            : "No accounts found."
        );
      }
    } catch (error) {
      console.error("Failed to load approval admin rows:", error);
      if (updateStatus) {
        setApprovalAdminStatus(`Approval list failed: ${error.message}`);
      }
    } finally {
      setApprovalAdminLoading(false);
    }
  }

  async function setUserApproval(userId, status) {
    if (!userId || approvalAdminLoading) {
      return;
    }

    setApprovalAdminLoading(true);
    setApprovalAdminStatus(`Saving ${status} status...`);

    try {
      await updateAppUserApproval(userId, status);
      await loadApprovalAdminRows();
    } catch (error) {
      console.error("Failed to update user approval:", error);
      setApprovalAdminStatus(`Approval update failed: ${error.message}`);
      setApprovalAdminLoading(false);
    }
  }

  useEffect(() => {
    if (!authSession?.user?.id || !isIraSettingsUser) {
      setApprovalAdminRows([]);
      return;
    }

    loadApprovalAdminRows({ updateStatus: showSettings });
  }, [authSession?.user?.id, isIraSettingsUser, showSettings]);

  useEffect(() => {
    const userId = authSession?.user?.id || null;
    const storageKey = getNutritionLogStorageKey(userId);
    const scopedLocalEntries = readLocalArray(storageKey);
    const legacyLocalEntries =
      userId && scopedLocalEntries.length === 0
        ? readLocalArray(NUTRITION_LOG_KEY)
        : [];
    const legacyEntries =
      scopedLocalEntries.length > 0 ? scopedLocalEntries : legacyLocalEntries;

    let cancelled = false;

    async function syncCalendarNutritionEntries() {
      try {
        const localEntries =
          (await loadNutritionSnapshot(userId)) ||
          (await initializeNutritionPersistence(userId, legacyEntries));

        if (!cancelled) {
          setCalendarNutritionEntries(localEntries);
        }

        if (
          !authSession?.user?.id ||
          !isSupabaseConfigured ||
          !appAccessAllowed
        ) {
          return;
        }

        if (nutritionStartupHydratedUserRef.current === userId) {
          return;
        }

        const result = await reconcileNutritionEntries(userId, authSession, {
          entries: localEntries,
        });

        if (cancelled) {
          return;
        }

        setCalendarNutritionEntries(result.entries);
        saveLocalArray(storageKey, result.entries);
        await persistNutritionEntries(userId, result.entries);

        // Body weight and calorie targets are small domains. Reconcile them
        // only at cold startup/login, after their queued writes are flushed.
        if (nutritionStartupHydratedUserRef.current !== userId) {
          const [bodyWeights, calorieTargets] = await Promise.all([
            downloadBodyWeightEntries(authSession),
            downloadNutritionTargets(authSession),
          ]);
          const pendingItems = await getNutritionOutbox(userId);
          const preserved = preservePendingNutritionSupportChanges(
            bodyWeights,
            calorieTargets,
            pendingItems
          );

          saveLocalArray(BODY_WEIGHT_LOG_KEY, preserved.bodyWeights);
          saveLocalArray(
            getDailyCalorieGoalHistoryStorageKey(userId),
            preserved.targets
          );
          const latestTarget = [...preserved.targets].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
          )[0];

          if (latestTarget?.goal) {
            localStorage.setItem(
              getDailyCalorieGoalStorageKey(userId),
              String(latestTarget.goal)
            );
          }
          nutritionStartupHydratedUserRef.current = userId;
        }
      } catch (error) {
        console.error("Failed to sync calendar nutrition entries:", error);
      }
    }

    syncCalendarNutritionEntries();

    return () => {
      cancelled = true;
    };
  }, [authSession, appAccessAllowed]);

  useEffect(() => {
    if (showNutrition) {
      return undefined;
    }

    const userId = authSession?.user?.id || null;
    const storageKey = getNutritionLogStorageKey(userId);
    let cancelled = false;

    async function refreshCalendarNutritionEntries() {
      const snapshotEntries = await loadNutritionSnapshot(userId);
      const compatibilityEntries = readLocalArray(storageKey);
      const compatibilityOnlyEntries = findNutritionEntriesMissingFrom(
        snapshotEntries,
        compatibilityEntries
      );
      const mergedEntries = mergeNutritionEntryCollections(
        snapshotEntries || [],
        compatibilityEntries
      );

      if (cancelled) return;

      setCalendarNutritionEntries(mergedEntries);
      saveLocalArray(storageKey, mergedEntries);
      if (userId && compatibilityOnlyEntries.length > 0) {
        await queueNutritionUpserts(
          userId,
          compatibilityOnlyEntries,
          mergedEntries
        );
      } else {
        await persistNutritionEntries(userId, mergedEntries);
      }
    }

    refreshCalendarNutritionEntries().catch((error) =>
      console.error("Failed to refresh calendar nutrition entries:", error)
    );

    return () => {
      cancelled = true;
    };
  }, [authSession?.user?.id, showNutrition]);

  useEffect(() => {
    if (!showSettings || !authSession?.user?.id) return;

    getNutritionPersistenceStatus(authSession.user.id)
      .then((status) => setNutritionSettingsPending(status.pending))
      .catch((error) =>
        console.error("Failed to load nutrition sync status:", error)
      );
  }, [authSession?.user?.id, showSettings]);

  useEffect(() => {
    const userId = authSession?.user?.id;

    if (!userId || !appAccessAllowed || approvalFromCache) return undefined;

    async function flushAgedPendingChanges() {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const status = await getNutritionPersistenceStatus(userId);
      const oldestPendingTime = Date.parse(status.oldestPendingAt || "");

      if (
        !Number.isFinite(oldestPendingTime) ||
        getCurrentTimeMs() - oldestPendingTime < PENDING_SYNC_MAX_AGE_MS
      ) {
        return;
      }

      const result = await flushNutritionOutbox(userId, authSession);

      setNutritionSettingsPending(result.remaining.length);
      if (result.failed.length > 0) {
        setNutritionSettingsStatus(
          `${result.failed.length} aged nutrition change${
            result.failed.length === 1 ? "" : "s"
          } remain queued for retry.`
        );
      }
    }

    const intervalId = window.setInterval(() => {
      flushAgedPendingChanges().catch((error) =>
        console.error("Aged nutrition sync failed:", error)
      );
    }, PENDING_SYNC_CHECK_INTERVAL_MS);

    function handleOnline() {
      flushAgedPendingChanges().catch((error) =>
        console.error("Reconnect nutrition sync failed:", error)
      );
    }

    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
    };
  }, [appAccessAllowed, approvalFromCache, authSession]);

  useEffect(() => {
    const userId = authSession?.user?.id;

    if (!userId || !appAccessAllowed || approvalFromCache) return undefined;

    let cancelled = false;
    let debounceTimeoutId = null;
    let maximumWaitTimeoutId = null;

    function clearScheduledFlushes() {
      window.clearTimeout(debounceTimeoutId);
      window.clearTimeout(maximumWaitTimeoutId);
      debounceTimeoutId = null;
      maximumWaitTimeoutId = null;
    }

    async function flushScheduledNutritionChanges(reason) {
      clearScheduledFlushes();

      const status = await getNutritionPersistenceStatus(userId);

      if (!cancelled) {
        setNutritionSettingsPending(status.pending);
      }

      if (status.pending === 0) return;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cancelled) {
          setNutritionSettingsStatus(
            `${status.pending} nutrition change${
              status.pending === 1 ? " is" : "s are"
            } safely queued offline.`
          );
        }
        return;
      }

      const session = authSessionRef.current;

      if (!session?.user?.id || session.user.id !== userId) return;

      const result = await flushNutritionOutbox(userId, session);

      if (cancelled) return;

      setNutritionSettingsPending(result.remaining.length);
      setNutritionSettingsStatus(
        result.failed.length > 0
          ? `${result.failed.length} nutrition change${
              result.failed.length === 1 ? "" : "s"
            } failed to sync and remain safely queued.`
          : `Nutrition auto sync complete after ${reason}.`
      );
    }

    function runScheduledFlush(reason) {
      flushScheduledNutritionChanges(reason).catch((error) => {
        console.error("Scheduled nutrition sync failed:", error);
        if (!cancelled) {
          setNutritionSettingsStatus(
            `Nutrition auto sync failed: ${error.message}. Changes remain queued.`
          );
        }
      });
    }

    function scheduleNutritionFlush() {
      getNutritionPersistenceStatus(userId)
        .then((status) => {
          if (!cancelled) setNutritionSettingsPending(status.pending);
        })
        .catch((error) =>
          console.error("Failed to refresh nutrition queue status:", error)
        );

      window.clearTimeout(debounceTimeoutId);
      debounceTimeoutId = window.setTimeout(
        () => runScheduledFlush("90 seconds without changes"),
        NUTRITION_SYNC_DEBOUNCE_MS
      );

      if (maximumWaitTimeoutId == null) {
        maximumWaitTimeoutId = window.setTimeout(
          () => runScheduledFlush("the five-minute maximum wait"),
          NUTRITION_SYNC_MAX_WAIT_MS
        );
      }
    }

    function handleVisibilityChange() {
      runScheduledFlush(
        document.visibilityState === "hidden" ? "app backgrounding" : "app resume"
      );
    }

    function handleOnline() {
      runScheduledFlush("network reconnect");
    }

    window.addEventListener(
      NUTRITION_OUTBOX_QUEUED_EVENT,
      scheduleNutritionFlush
    );
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledFlushes();
      window.removeEventListener(
        NUTRITION_OUTBOX_QUEUED_EVENT,
        scheduleNutritionFlush
      );
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appAccessAllowed, approvalFromCache, authSession?.user?.id]);

  async function runSettingsNutritionSync({ pull = false } = {}) {
    const userId = authSession?.user?.id;

    if (!userId || !isSupabaseConfigured || !appAccessAllowed) {
      setNutritionSettingsStatus("Sign in and connect before syncing nutrition.");
      return;
    }

    setNutritionSettingsSyncing(true);
    setNutritionSettingsStatus(
      pull ? "Pulling recent nutrition changes..." : "Syncing queued nutrition changes..."
    );

    try {
      const localEntries =
        (await loadNutritionSnapshot(userId)) || calendarNutritionEntries;
      const result = pull
        ? await reconcileNutritionEntries(userId, authSession, {
            entries: localEntries,
          })
        : await flushNutritionOutbox(userId, authSession).then((flushResult) => ({
            entries: localEntries,
            failed: flushResult.failed,
            pending: flushResult.remaining.length,
          }));

      if (pull) {
        setCalendarNutritionEntries(result.entries);
        saveLocalArray(getNutritionLogStorageKey(userId), result.entries);
        const [bodyWeights, calorieTargets] = await Promise.all([
          downloadBodyWeightEntries(authSession),
          downloadNutritionTargets(authSession),
        ]);
        const pendingItems = await getNutritionOutbox(userId);
        const preserved = preservePendingNutritionSupportChanges(
          bodyWeights,
          calorieTargets,
          pendingItems
        );

        saveLocalArray(BODY_WEIGHT_LOG_KEY, preserved.bodyWeights);
        saveLocalArray(
          getDailyCalorieGoalHistoryStorageKey(userId),
          preserved.targets
        );
        const latestTarget = [...preserved.targets].sort((a, b) =>
          String(b.date).localeCompare(String(a.date))
        )[0];

        if (latestTarget?.goal) {
          localStorage.setItem(
            getDailyCalorieGoalStorageKey(userId),
            String(latestTarget.goal)
          );
        }
      }
      setNutritionSettingsPending(result.pending);
      setNutritionSettingsStatus(
        result.failed.length > 0
          ? `${result.failed.length} nutrition change${
              result.failed.length === 1 ? "" : "s"
            } remain queued for retry.`
          : pull
            ? `Nutrition pull complete: ${result.changes} changed food-log row${
                result.changes === 1 ? "" : "s"
              } read.`
            : "All queued nutrition changes are synced."
      );
    } catch (error) {
      console.error("Settings nutrition sync failed:", error);
      setNutritionSettingsStatus(`Nutrition sync failed: ${error.message}`);
    } finally {
      setNutritionSettingsSyncing(false);
    }
  }

  async function recoverNutritionHistory() {
    const userId = authSession?.user?.id;

    if (!userId || !isSupabaseConfigured || !appAccessAllowed) {
      setNutritionSettingsStatus("Sign in and connect before recovering nutrition.");
      return;
    }

    setNutritionSettingsSyncing(true);
    setNutritionSettingsStatus("Checking every available nutrition copy...");

    try {
      const scopedEntries = readLocalArray(getNutritionLogStorageKey(userId));
      const legacyEntries = readLocalArray(NUTRITION_LOG_KEY);
      const pullResult = await reconcileNutritionEntries(userId, authSession, {
        entries: [...calendarNutritionEntries, ...scopedEntries, ...legacyEntries],
        full: true,
      });
      const result = await recoverNutritionEntries(
        userId,
        [
          ...pullResult.entries,
          ...calendarNutritionEntries,
          ...scopedEntries,
          ...legacyEntries,
        ],
        pullResult.deletedIds
      );

      setCalendarNutritionEntries(result.entries);
      saveLocalArray(getNutritionLogStorageKey(userId), result.entries);
      setNutritionSettingsPending(
        (await getNutritionPersistenceStatus(userId)).pending
      );
      setNutritionSettingsStatus(
        result.invalid > 0
          ? `Recovery preserved ${result.invalid} row${result.invalid === 1 ? "" : "s"} with invalid identity, date, or nutrient values for manual review; none were uploaded.`
          : result.added > 0
          ? `Recovered ${result.added} missing food-log row${result.added === 1 ? "" : "s"}. Recovered rows are queued for cloud sync.`
          : `Recovery check complete. No additional rows were found across cloud, local caches, and ${result.backupCount} protected backup${result.backupCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      console.error("Nutrition recovery failed:", error);
      setNutritionSettingsStatus(`Nutrition recovery failed: ${error.message}`);
    } finally {
      setNutritionSettingsSyncing(false);
    }
  }

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
      setAuthStatus("Signed in. Automatic sync is on.");
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
          ? "Account created. Automatic sync is on."
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
      // Pending sync work is durable and user-scoped, so a network failure must
      // not prevent the local account session from being cleared.
      await signOut();
      authSessionRef.current = null;
      setAuthSession(null);
      setApprovalStatus(null);
      setApprovalError("");
      setApprovalFromCache(false);
      nutritionStartupHydratedUserRef.current = null;
      setAuthStatus("Signed out.");
    } catch (error) {
      console.error("Sign out failed:", error);
      setAuthStatus(`Sign out failed: ${error.message}`);
    } finally {
      setAuthLoading(false);
    }
  }

  function closeChangePasswordDialog() {
    if (changePasswordLoading) {
      return;
    }

    setChangePasswordDialogOpen(false);
    setChangePasswordDraft({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setChangePasswordStatus("");
  }

  async function submitChangePassword(event) {
    event.preventDefault();

    if (!authSession?.user?.email) {
      setChangePasswordStatus("Sign in before changing your password.");
      return;
    }

    const currentPassword = changePasswordDraft.currentPassword;
    const newPassword = changePasswordDraft.newPassword;
    const confirmPassword = changePasswordDraft.confirmPassword;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setChangePasswordStatus("Enter your current password and new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordStatus("New passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setChangePasswordStatus("Choose a new password that is different.");
      return;
    }

    setChangePasswordLoading(true);
    setChangePasswordStatus("Changing password...");

    try {
      await changePasswordWithCurrentPassword(
        authSession.user.email,
        currentPassword,
        newPassword
      );
      setChangePasswordDraft({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setChangePasswordStatus("");
      setAuthStatus("Password changed.");
      setChangePasswordDialogOpen(false);
    } catch (error) {
      console.error("Change password failed:", error);
      setChangePasswordStatus(`Password change failed: ${error.message}`);
    } finally {
      setChangePasswordLoading(false);
    }
  }

  function getCurrentWorkoutData() {
    const reconciledPlans = reconcilePlanCompletionsWithHistory(plans, history);
    const normalizedPlanData = normalizeStoredPlanWorkoutTypes(
      reconciledPlans,
      templates
    );

    return {
      exerciseLibrary,
      exerciseMetadata,
      history,
      ownerUserId: localOwnerUserId,
      plans: normalizedPlanData.plans,
      selectedSessionId,
      sessions,
      templates: normalizedPlanData.templates,
    };
  }

  function hasActiveWorkoutSession(data = currentWorkoutDataRef.current || getCurrentWorkoutData()) {
    return Boolean(
      data?.selectedSessionId &&
        (data.sessions || []).some(
          (session) => String(session.id) === String(data.selectedSessionId)
        )
    );
  }

  function replaceWorkoutData(data) {
    const reconciledPlans = reconcilePlanCompletionsWithHistory(
      data.plans,
      data.history
    );
    const normalizedPlanData = normalizeStoredPlanWorkoutTypes(
      reconciledPlans,
      data.templates
    );

    setTemplates(normalizedPlanData.templates);
    setPlans(normalizedPlanData.plans);
    setHistory(data.history);
    setSessions(data.sessions);
    setExerciseLibrary(data.exerciseLibrary);
    setExerciseMetadata(data.exerciseMetadata);
    setLocalOwnerUserId(data.ownerUserId || null);
    setSelectedSessionId(data.selectedSessionId);
  }

  async function saveLocalWorkoutDataImmediately(data) {
    saveWorkoutData(data, STORAGE_VERSION);

    if (indexedDbReady) {
      await saveWorkoutDataToIndexedDb(data, STORAGE_VERSION);
    }
  }

  function commitCompletedWorkoutData(updates) {
    const mergedData = {
      ...(currentWorkoutDataRef.current || getCurrentWorkoutData()),
      ...updates,
      ownerUserId: localOwnerUserId,
    };
    const data = {
      ...mergedData,
      plans: reconcilePlanCompletionsWithHistory(
        mergedData.plans,
        mergedData.history
      ),
    };

    currentWorkoutDataRef.current = data;
    localDataRevisionRef.current += 1;
    markNormalizedSyncDirty([
      "exercisePreferences",
      "history",
      "plans",
      "workouts",
    ]);
    workoutCompletionSyncHistoryLengthRef.current = data.history.length;
    window.setTimeout(() => {
      runAutomaticNormalizedSync("workout completion");
    }, 0);
    saveLocalWorkoutDataImmediately(data).catch((error) => {
      console.error("Failed to save completed workout immediately:", error);
    });
  }

  function getLastTrainingPrescription(weeklyPrescriptions, durationWeeks) {
    return [...(weeklyPrescriptions || [])]
      .filter(
        (week) =>
          !week.isDeload &&
          (!durationWeeks || Number(week.weekNumber) <= Number(durationWeeks))
      )
      .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber))[0];
  }

  function extendWeeklyPrescriptionsOneWeek(weeklyPrescriptions, plan) {
    if (!Array.isArray(weeklyPrescriptions)) {
      return weeklyPrescriptions;
    }

    const durationWeeks = Number(plan.durationWeeks) || 1;
    const nextDurationWeeks = durationWeeks + 1;
    const sourceWeek =
      getLastTrainingPrescription(weeklyPrescriptions, durationWeeks) ||
      weeklyPrescriptions.find((week) => !week.isDeload) ||
      {};
    const nextTrainingWeek = {
      ...((sourceWeek.minimumReps ?? sourceWeek.minimum_reps) == null
        ? {}
        : {
            minimumReps: sourceWeek.minimumReps ?? sourceWeek.minimum_reps,
          }),
      reps: sourceWeek.reps || "",
      ...(normalizeRestSeconds(
        sourceWeek.restSeconds ?? sourceWeek.rest_seconds
      )
        ? {
            restSeconds: normalizeRestSeconds(
              sourceWeek.restSeconds ?? sourceWeek.rest_seconds
            ),
          }
        : {}),
      rir: sourceWeek.rir || "",
      sets: sourceWeek.sets || "",
      weekNumber: nextDurationWeeks,
    };
    const trainingWeeks = weeklyPrescriptions.filter(
      (week) => !week.isDeload && Number(week.weekNumber) !== nextDurationWeeks
    );

    if (!plan.config?.deload) {
      return [...trainingWeeks, nextTrainingWeek].sort(
        (a, b) => Number(a.weekNumber) - Number(b.weekNumber)
      );
    }

    const deloadWeek = weeklyPrescriptions.find((week) => week.isDeload);

    return [
      ...trainingWeeks,
      nextTrainingWeek,
      {
        ...(deloadWeek || {}),
        isDeload: true,
        label: "D",
        reps: nextTrainingWeek.reps || deloadWeek?.reps || "",
        rir: deloadWeek?.rir || "5",
        sets: deloadWeek?.sets || "2",
        weekNumber: nextDurationWeeks + 1,
      },
    ].sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber));
  }

  function completePlanCompletionPrompt() {
    setPlanCompletionPrompt(null);
  }

  function extendPromptPlanOneWeek() {
    const prompt = planCompletionPrompt;

    if (!prompt) {
      return;
    }

    const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
    const planToExtend = data.plans.find(
      (plan) => String(plan.id) === String(prompt.planId)
    );

    if (!planToExtend) {
      setPlanCompletionPrompt(null);
      return;
    }

    const durationWeeks = Number(planToExtend.durationWeeks) || 1;
    const nextDurationWeeks = durationWeeks + 1;
    const templateIds = new Set(
      (planToExtend.workouts || []).map((workout) => String(workout.templateId))
    );
    const nextTemplates = data.templates.map((template) =>
      templateIds.has(String(template.id))
        ? {
            ...template,
            exercises: (template.exercises || []).map((exercise) => ({
              ...exercise,
              weeklyPrescriptions: extendWeeklyPrescriptionsOneWeek(
                exercise.weeklyPrescriptions,
                planToExtend
              ),
            })),
          }
        : template
    );
    const nextPlans = data.plans.map((plan) =>
      String(plan.id) === String(prompt.planId)
        ? {
            ...plan,
            completions: plan.config?.deload
              ? (plan.completions || []).filter(
                  (completion) => Number(completion.weekNumber) <= durationWeeks
                )
              : plan.completions || [],
            currentWeek: nextDurationWeeks,
            durationWeeks: nextDurationWeeks,
            status: "active",
          }
        : {
            ...plan,
            status: plan.status === "active" ? "inactive" : plan.status,
          }
    );

    setTemplates(nextTemplates);
    setPlans(nextPlans);
    commitCompletedWorkoutData({
      plans: nextPlans,
      templates: nextTemplates,
    });
    setPlanCompletionPrompt(null);
  }

  function repeatPromptPlan() {
    const prompt = planCompletionPrompt;

    if (!prompt) {
      return;
    }

    const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
    const nextPlans = data.plans.map((plan) =>
      String(plan.id) === String(prompt.planId)
        ? {
            ...plan,
            completions: [],
            currentWeek: 1,
            status: "active",
          }
        : {
            ...plan,
            status: plan.status === "active" ? "inactive" : plan.status,
          }
    );

    setPlans(nextPlans);
    commitCompletedWorkoutData({
      plans: nextPlans,
    });
    setPlanCompletionPrompt(null);
  }

  function resetLocalWorkoutDataForUser(userId = null) {
    setTemplates([]);
    setPlans([]);
    setHistory([]);
    setSessions([]);
    setExerciseLibrary(seedExercises);
    setExerciseMetadata({});
    setSelectedSessionId(null);
    setLocalOwnerUserId(userId);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
  }

  useEffect(() => {
    localDataRevisionRef.current += 1;
    currentWorkoutDataRef.current = {
      exerciseLibrary,
      exerciseMetadata,
      history,
      ownerUserId: localOwnerUserId,
      plans,
      selectedSessionId,
      sessions,
      templates,
    };
  }, [
    templates,
    plans,
    history,
    sessions,
    exerciseLibrary,
    exerciseMetadata,
    localOwnerUserId,
    selectedSessionId,
  ]);

  useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

  useEffect(() => {
    plateInventoryRef.current = plateInventory;
  }, [plateInventory]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    const nextUserId = authSession?.user?.id || null;
    const previousUserId = previousAuthUserIdRef.current;
    const switchedSignedInUsers =
      previousUserId && nextUserId && previousUserId !== nextUserId;
    const storedOwnerMismatch =
      nextUserId && localOwnerUserId && localOwnerUserId !== nextUserId;
    const plateOwnerMismatch =
      nextUserId &&
      plateInventoryOwnerUserId &&
      plateInventoryOwnerUserId !== nextUserId;
    const unownedSignedInData =
      nextUserId &&
      !localOwnerUserId &&
      hasLocalNormalizedUserData(
        currentWorkoutDataRef.current || getCurrentWorkoutData()
      );

    if (
      switchedSignedInUsers ||
      storedOwnerMismatch ||
      plateOwnerMismatch ||
      unownedSignedInData
    ) {
      const defaultPlateInventory = normalizePlateInventory(null);

      automaticSyncHydratedUserRef.current = null;
      automaticSyncSuppressUntilRef.current = getCurrentTimeMs() + AUTO_SYNC_SUPPRESS_MS;
      normalizedSyncDirtyDomainsRef.current = new Set();
      writeNormalizedSyncDirtyDomains([]);
      setNormalizedSyncDirtyDomains([]);
      resetLocalWorkoutDataForUser(nextUserId);
      setPlateInventory(defaultPlateInventory);
      plateInventoryRef.current = defaultPlateInventory;
      savePlateInventory(defaultPlateInventory);
      setPlateInventoryOwnerUserId(nextUserId);
      savePlateInventoryOwner(nextUserId);
      setSyncStatus("Account changed. Local data cleared before syncing this user.");
    }

    previousAuthUserIdRef.current = nextUserId;
  }, [
    authSession?.user?.id,
    indexedDbReady,
    localOwnerUserId,
    plateInventoryOwnerUserId,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(checkpointSyncTimeoutRef.current);
    },
    []
  );

  function isAutomaticSyncAvailable(session = authSessionRef.current) {
    return !getAutomaticSyncUnavailableReason(session);
  }

  function getAutomaticSyncUnavailableReason(session = authSessionRef.current) {
    if (!isSupabaseConfigured) {
      return "Supabase sync is not configured.";
    }

    if (!session?.user?.id) {
      return "Sign in before syncing.";
    }

    if (!appAccessAllowed) {
      return "App access is not approved yet.";
    }

    if (approvalFromCache) {
      return "Reconnect before syncing; app approval is only cached locally.";
    }

    if (!indexedDbReady) {
      return "Local database is still loading. Try again in a moment.";
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return "This device is offline.";
    }

    return "";
  }

  function markNormalizedSyncDirty(domains = NORMALIZED_SYNC_DOMAINS) {
    const nextDomains = new Set(normalizedSyncDirtyDomainsRef.current);

    domains.forEach((domain) => {
      if (NORMALIZED_SYNC_DOMAINS.includes(domain)) {
        nextDomains.add(domain);
      }
    });

    normalizedSyncDirtyDomainsRef.current = nextDomains;
    const nextDomainList = [...nextDomains];
    writeNormalizedSyncDirtyDomains(nextDomainList);
    setNormalizedSyncDirtyDomains(nextDomainList);
  }

  function markNormalizedSyncClean() {
    const syncedAt = new Date().toISOString();

    normalizedSyncDirtyDomainsRef.current = new Set();
    writeNormalizedSyncDirtyDomains([]);
    setNormalizedSyncDirtyDomains([]);
    safeSetLocalStorage(LAST_NORMALIZED_SYNC_KEY, syncedAt);
    setLastNormalizedSyncAt(syncedAt);
  }

  function requestSyncCheckpoint(domains, reason = "checkpoint") {
    markNormalizedSyncDirty(domains);

    if (!isAutomaticSyncAvailable()) {
      return;
    }

    window.clearTimeout(checkpointSyncTimeoutRef.current);
    checkpointSyncTimeoutRef.current = window.setTimeout(() => {
      runAutomaticNormalizedSync(reason);
    }, AUTO_SYNC_CHECKPOINT_DELAY_MS);
  }

  function getWorkoutHistoryTime(workout) {
    const parsed = Date.parse(
      workout?.completedAtIso ||
        workout?.completed_at ||
        workout?.completedAt ||
        workout?.completed_at_iso ||
        ""
    );

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getHistoryForSync(history = [], reason = "auto") {
    const lastSyncTime = Date.parse(lastNormalizedSyncAt || "");

    if (
      !Number.isFinite(lastSyncTime) ||
      reason === "history replacement" ||
      reason === "reset"
    ) {
      return {
        history,
        partial: false,
      };
    }

    const cutoff = Math.max(0, lastSyncTime - RECENT_HISTORY_SYNC_LOOKBACK_MS);
    const recentHistory = history.filter(
      (workout) => getWorkoutHistoryTime(workout) >= cutoff
    );

    const scopedHistory =
      recentHistory.length > 0 ? recentHistory : history.slice(0, 1);

    return {
      history: scopedHistory,
      partial: scopedHistory.length < history.length,
    };
  }

  async function uploadNormalizedWorkoutData(data, session, domains, options = {}) {
    const domainSet = new Set(domains);
    const shouldSyncWorkouts =
      domainSet.has("workouts") ||
      domainSet.has("history") ||
      domainSet.has("plans");
    let workoutsUploaded = false;

    if (domainSet.has("exercisePreferences")) {
      setSyncStatus("Syncing now... uploading exercise preferences.");
      await uploadCustomExercises(data.exerciseLibrary, session);
      await uploadExercisePreferences(
        data.exerciseLibrary,
        data.exerciseMetadata,
        session
      );
    }

    if (shouldSyncWorkouts) {
      setSyncStatus("Syncing now... uploading workouts.");
      await uploadWorkouts(data.templates, data.exerciseLibrary, session);
      workoutsUploaded = true;
    }

    if (domainSet.has("history")) {
      const historyScope = getHistoryForSync(data.history, options.reason);

      setSyncStatus(
        `Syncing now... uploading ${historyScope.history.length} completed workout${
          historyScope.history.length === 1 ? "" : "s"
        }${historyScope.partial ? " changed since the last sync" : ""}.`
      );
      await uploadWorkoutHistory(
        historyScope.history,
        data.templates,
        data.exerciseLibrary,
        session,
        {
          preserveCloudHistory: historyScope.partial,
          skipWorkoutRefresh: workoutsUploaded,
        }
      );
    }

    if (domainSet.has("plans")) {
      const reconciledPlans = reconcilePlanCompletionsWithHistory(
        data.plans,
        data.history
      );

      setSyncStatus("Syncing now... uploading plans.");
      await uploadPlans(
        reconciledPlans,
        data.templates,
        data.exerciseLibrary,
        session,
        {
          skipWorkoutRefresh: workoutsUploaded,
        }
      );
    }

    if (domainSet.has("plateInventory")) {
      setSyncStatus("Syncing now... uploading plate inventory.");
      await uploadPlateInventory(plateInventoryRef.current, session);
    }
  }

  async function downloadNormalizedWorkoutData(data, session, dirtyDomains = []) {
    const dirtyDomainSet = new Set(dirtyDomains);
    const exercisePreferences = await downloadExerciseLibraryWithPreferences(
      data.exerciseLibrary,
      data.exerciseMetadata,
      session
    );
    const workoutData = await downloadWorkouts(
      data.templates,
      exercisePreferences.exerciseLibrary,
      session,
      {
        keepLocalOnly: dirtyDomainSet.has("workouts"),
      }
    );
    const historyData = await downloadWorkoutHistory(
      data.history,
      workoutData.templates,
      exercisePreferences.exerciseLibrary,
      session,
      {
        keepLocalOnly: dirtyDomainSet.has("history"),
      }
    );
    const planData = await downloadPlans(
      data.plans,
      workoutData.templates,
      session,
      {
        keepLocalOnly: dirtyDomainSet.has("plans"),
      }
    );
    const plateInventoryData = await downloadPlateInventory(session);
    const resolvedPlans = resolvePlanWorkoutTemplateIds(
      planData.plans,
      workoutData.templates
    );
    const linkedTemplates = attachPlanLinksToTemplates(
      workoutData.templates,
      resolvedPlans
    );
    const nextData = {
      ...data,
      exerciseLibrary: exercisePreferences.exerciseLibrary,
      exerciseMetadata: exercisePreferences.exerciseMetadata,
      history: historyData.history,
      ownerUserId: session.user.id,
      plans: resolvedPlans,
      templates: linkedTemplates,
    };

    return {
      exercisePreferences,
      history: historyData,
      nextData,
      plateInventory: {
        downloaded: plateInventoryData.inventory ? 1 : 0,
        inventory: plateInventoryData.inventory
          ? normalizePlateInventory(plateInventoryData.inventory)
          : null,
      },
      plans: planData,
      workouts: workoutData,
    };
  }

  async function pullLatestNormalizedData() {
    setActiveSyncAction("pullLatest");
    setSyncLoading(true);
    setSyncStatus("Pulling latest cloud data...");

    try {
      const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
      const downloaded = await downloadNormalizedWorkoutData(data, authSession, []);

      automaticSyncSuppressUntilRef.current =
        getCurrentTimeMs() + AUTO_SYNC_SUPPRESS_MS;
      replaceWorkoutData(downloaded.nextData);
      if (downloaded.plateInventory.inventory) {
        setPlateInventory(downloaded.plateInventory.inventory);
        plateInventoryRef.current = downloaded.plateInventory.inventory;
        savePlateInventory(downloaded.plateInventory.inventory);
        setPlateInventoryOwnerUserId(authSession.user.id);
        savePlateInventoryOwner(authSession.user.id);
      }
      markNormalizedSyncClean();
      setSyncStatus(
        `${getAutoSyncSummary({
          exercisePreferences: downloaded.exercisePreferences,
          history: downloaded.history,
          mode: "check",
          plateInventory: downloaded.plateInventory,
          plans: downloaded.plans,
          workouts: downloaded.workouts,
        })} Pulled latest cloud data.`
      );
    } catch (error) {
      console.error("Pull latest failed:", error);
      setSyncStatus(`Pull latest failed: ${error.message}`);
    } finally {
      setActiveSyncAction(null);
      setSyncLoading(false);
    }
  }

  function repairLocalPlanLinks() {
    const resolvedPlans = resolvePlanWorkoutTemplateIds(plans, templates);
    const linkedTemplates = attachPlanLinksToTemplates(templates, resolvedPlans);
    const normalizedPlanData = normalizeStoredPlanWorkoutTypes(
      resolvedPlans,
      linkedTemplates
    );
    const beforeBrokenLinks = getAuditLocalSummary({
      exerciseLibrary,
      exerciseMetadata,
      history,
      plans,
      sessions,
      templates,
    }).missingPlanWorkouts.length;
    const afterBrokenLinks = getAuditLocalSummary({
      exerciseLibrary,
      exerciseMetadata,
      history,
      plans: normalizedPlanData.plans,
      sessions,
      templates: normalizedPlanData.templates,
    }).missingPlanWorkouts.length;

    setPlans(normalizedPlanData.plans);
    setTemplates(normalizedPlanData.templates);

    if (afterBrokenLinks < beforeBrokenLinks) {
      markNormalizedSyncDirty(["plans", "workouts"]);
    }

    setSyncStatus(
      `Plan link repair complete: ${beforeBrokenLinks} broken links before, ${afterBrokenLinks} after.`
    );
  }

  async function performNormalizedSync(reason, session) {
      // The remote write policy can force pull-only sync if outbound writes
      // need to be disabled for a platform or rollout.
      const nativePullOnly = !isRemoteWriteAllowed();
      const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
      const shouldDeferForActiveWorkout =
        hasActiveWorkoutSession(data) &&
        reason !== "manual" &&
        reason !== "workout completion";

      if (shouldDeferForActiveWorkout) {
        setSyncStatus(
          "Auto sync deferred while workout is active. Local workout data is saved on this device."
        );
        return;
      }

      const syncStartRevision = localDataRevisionRef.current;
      const plateInventoryStartRevision = plateInventoryRevisionRef.current;
      const forceUpload = reason === "workout completion";
      const dirtyDomains = [...normalizedSyncDirtyDomainsRef.current];

      if (reason === "manual") {
        setSyncStatus("Syncing now... checking cloud state.");
      }

      const cloudSummary = await getNormalizedCloudSummary(session);
      const shouldSeedPlateInventory =
        cloudSummary.plateInventory === 0 &&
        hasConfiguredPlateInventory(plateInventoryRef.current);
      const uploadDomains = forceUpload
        ? ["workouts", "history", "plans"]
        : shouldSeedPlateInventory
          ? [...new Set([...dirtyDomains, "plateInventory"])]
          : dirtyDomains;
      const shouldHydrateFirst =
        !hasLocalNormalizedUserData(data) &&
        hasNormalizedCloudData(cloudSummary) &&
        !shouldSeedPlateInventory;
      const shouldUpload =
        !nativePullOnly && !shouldHydrateFirst && uploadDomains.length > 0;
      const mode = shouldHydrateFirst
        ? "hydrate"
        : shouldUpload
          ? "sync"
          : "check";

      if (shouldUpload) {
        if (reason === "manual") {
          setSyncStatus(`Syncing now... uploading ${uploadDomains.join(", ")}.`);
        }

        await uploadNormalizedWorkoutData(data, session, uploadDomains, {
          reason,
        });
      }

      const shouldDownload =
        nativePullOnly ||
        shouldHydrateFirst ||
        reason === "startup" ||
        reason === "manual";

      if (!shouldDownload) {
        if (
          localDataRevisionRef.current !== syncStartRevision ||
          plateInventoryRevisionRef.current !== plateInventoryStartRevision
        ) {
          automaticSyncQueuedRef.current = true;
          setSyncStatus(
            "Sync finished, but newer local changes were detected. They will sync at the next checkpoint."
          );
          return;
        }

        if (shouldUpload) {
          markNormalizedSyncClean();
        }
        automaticSyncHydratedUserRef.current = session.user.id;
        setSyncStatus(
          shouldUpload
            ? `Uploaded checkpoint: ${uploadDomains.join(", ")}. Cloud download deferred until startup, Sync Now, or Pull Latest. Last upload: ${new Date().toLocaleTimeString()}.`
            : `Cloud state checked at ${new Date().toLocaleTimeString()}. No upload or download was needed.`
        );
        return;
      }

      if (reason === "manual") {
        setSyncStatus("Syncing now... pulling latest cloud data.");
      }

      const downloaded = await downloadNormalizedWorkoutData(
        data,
        session,
        uploadDomains
      );

      if (
        localDataRevisionRef.current !== syncStartRevision ||
        plateInventoryRevisionRef.current !== plateInventoryStartRevision
      ) {
        automaticSyncQueuedRef.current = true;
        setSyncStatus(
          "Sync finished, but newer local changes were detected. They will sync at the next checkpoint."
        );
        return;
      }

      automaticSyncSuppressUntilRef.current =
        getCurrentTimeMs() + AUTO_SYNC_SUPPRESS_MS;
      replaceWorkoutData(downloaded.nextData);
      if (downloaded.plateInventory.inventory) {
        setPlateInventory(downloaded.plateInventory.inventory);
        plateInventoryRef.current = downloaded.plateInventory.inventory;
        savePlateInventory(downloaded.plateInventory.inventory);
        setPlateInventoryOwnerUserId(session.user.id);
        savePlateInventoryOwner(session.user.id);
      }
      automaticSyncHydratedUserRef.current = session.user.id;
      // Keep dirty markers if outbound sync is temporarily blocked so local
      // changes are not treated as remotely persisted.
      if (!nativePullOnly) {
        markNormalizedSyncClean();
      }
      setSyncStatus(
        `${getAutoSyncSummary({
          exercisePreferences: downloaded.exercisePreferences,
          domains: shouldUpload ? uploadDomains : [],
          history: downloaded.history,
          mode,
          plateInventory: downloaded.plateInventory,
          plans: downloaded.plans,
          workouts: downloaded.workouts,
        })} Last ${reason === "manual" ? "manual" : "auto"} sync: ${new Date().toLocaleTimeString()}.`
      );
  }

  async function runAutomaticNormalizedSync(reason = "auto") {
    const session = authSessionRef.current || authSession;
    const unavailableReason = getAutomaticSyncUnavailableReason(session);

    if (unavailableReason) {
      if (reason === "manual") {
        setSyncStatus(`Sync unavailable: ${unavailableReason}`);
      }
      return;
    }

    const visibleSyncAction = reason === "manual" ? "sync" : null;

    if (automaticSyncInFlightRef.current && reason !== "manual") {
      automaticSyncQueuedRef.current = true;
      setSyncStatus(
        "Sync already in progress. New local changes will sync at the next checkpoint."
      );
      return;
    }

    if (automaticSyncInFlightRef.current && reason === "manual") {
      automaticSyncQueuedRef.current = false;
      setSyncStatus("Restarting sync now...");
    }

    automaticSyncInFlightRef.current = true;
    const syncAttemptId = automaticSyncAttemptIdRef.current + 1;

    automaticSyncAttemptIdRef.current = syncAttemptId;
    lastAutomaticSyncAttemptRef.current = getCurrentTimeMs();
    if (visibleSyncAction) {
      setActiveSyncAction(visibleSyncAction);
      setSyncLoading(true);
    }
    setSyncStatus(
      reason === "manual"
        ? "Syncing now..."
        : `Auto sync ${reason}...`
    );

    try {
      await withTimeout(
        performNormalizedSync(reason, session),
        NORMALIZED_SYNC_TIMEOUT_MS,
        "Sync timed out. Check your connection and try Sync Now again."
      );
    } catch (error) {
      console.error("Automatic normalized sync failed:", error);
      setSyncStatus(
        reason === "manual"
          ? `Sync Now failed: ${error.message}`
          : `Auto sync failed: ${error.message}`
      );
    } finally {
      if (automaticSyncAttemptIdRef.current === syncAttemptId) {
        automaticSyncInFlightRef.current = false;
        automaticSyncQueuedRef.current = false;
        if (visibleSyncAction) {
          setActiveSyncAction(null);
          setSyncLoading(false);
        }
      }
    }
  }

  useEffect(() => {
    if (!authSession?.user?.id || !indexedDbReady) {
      return;
    }

    if (!appAccessAllowed || approvalFromCache) {
      return;
    }

    const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
    const hasUnownedLocalData =
      !localOwnerUserId && hasLocalNormalizedUserData(data);
    const hasDifferentOwner =
      localOwnerUserId && localOwnerUserId !== authSession.user.id;

    if (hasUnownedLocalData || hasDifferentOwner) {
      return;
    }

    if (automaticSyncHydratedUserRef.current === authSession.user.id) {
      return;
    }

    runAutomaticNormalizedSync("startup");
    // Latest sync state is read from refs inside runAutomaticNormalizedSync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appAccessAllowed,
    approvalFromCache,
    authSession,
    indexedDbReady,
    localOwnerUserId,
  ]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    if (!exercisePreferencesDirtyReadyRef.current) {
      exercisePreferencesDirtyReadyRef.current = true;
      return;
    }

    if (
      !authSession?.user?.id ||
      automaticSyncHydratedUserRef.current !== authSession.user.id
    ) {
      return;
    }

    if (getCurrentTimeMs() < automaticSyncSuppressUntilRef.current) {
      return;
    }

    markNormalizedSyncDirty(["exercisePreferences"]);
  }, [exerciseLibrary, exerciseMetadata, indexedDbReady]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    if (!workoutDirtyReadyRef.current) {
      workoutDirtyReadyRef.current = true;
      return;
    }

    if (
      !authSession?.user?.id ||
      automaticSyncHydratedUserRef.current !== authSession.user.id
    ) {
      return;
    }

    if (getCurrentTimeMs() < automaticSyncSuppressUntilRef.current) {
      return;
    }

    markNormalizedSyncDirty(["workouts"]);
  }, [templates, indexedDbReady]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    if (!historyDirtyReadyRef.current) {
      historyDirtyReadyRef.current = true;
      return;
    }

    if (
      !authSession?.user?.id ||
      automaticSyncHydratedUserRef.current !== authSession.user.id
    ) {
      return;
    }

    if (getCurrentTimeMs() < automaticSyncSuppressUntilRef.current) {
      return;
    }

    markNormalizedSyncDirty(["history"]);
  }, [history, indexedDbReady]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    if (!planDirtyReadyRef.current) {
      planDirtyReadyRef.current = true;
      return;
    }

    if (
      !authSession?.user?.id ||
      automaticSyncHydratedUserRef.current !== authSession.user.id
    ) {
      return;
    }

    if (getCurrentTimeMs() < automaticSyncSuppressUntilRef.current) {
      return;
    }

    markNormalizedSyncDirty(["plans"]);
  }, [plans, indexedDbReady]);

  useEffect(() => {
    const previousHistoryLength = previousHistoryLengthRef.current;

    previousHistoryLengthRef.current = history.length;

    if (!authSession?.user?.id || !indexedDbReady) {
      return;
    }

    if (automaticSyncHydratedUserRef.current !== authSession.user.id) {
      return;
    }

    if (getCurrentTimeMs() < automaticSyncSuppressUntilRef.current) {
      return;
    }

    if (history.length > previousHistoryLength) {
      if (workoutCompletionSyncHistoryLengthRef.current === history.length) {
        workoutCompletionSyncHistoryLengthRef.current = null;
        return;
      }

      markNormalizedSyncDirty(["history"]);
      runAutomaticNormalizedSync("workout completion");
    }
    // Latest sync state is read from refs inside runAutomaticNormalizedSync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, authSession, indexedDbReady]);

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

  async function resetWorkoutSyncData() {
    const userId = authSession?.user?.id;

    if (!userId || !supabase) {
      setSyncStatus("Sign in before resetting workout sync data.");
      return;
    }

    if (skipBlockedRemoteWrite("workout-sync reset", true)) {
      setSyncStatus(
        "Native pull-only mode: cloud workout sync data was not reset."
      );
      return;
    }

    const confirmed = window.confirm(
      "Reset workout sync data?\n\nThis deletes normalized plans, workouts, completed workout history, saved workout sessions, and the old snapshot row for this signed-in user. It also clears the same workout data on this device.\n\nThe exercise library and exercise preferences are kept."
    );

    if (!confirmed) {
      setSyncStatus("Workout sync reset canceled.");
      return;
    }

    const typedConfirmation = window.prompt(
      'Type "RESET" to permanently clear workout sync data for this user.'
    );

    if (typedConfirmation !== "RESET") {
      setSyncStatus("Workout sync reset canceled.");
      return;
    }

    setSyncLoading(true);

    try {
      for (const table of NORMALIZED_WORKOUT_RESET_TABLES) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("user_id", userId);

        if (error) {
          throw new Error(`${table}: ${error.message}`);
        }
      }

      automaticSyncSuppressUntilRef.current =
        getCurrentTimeMs() + AUTO_SYNC_SUPPRESS_MS;
      const resetData = {
        exerciseLibrary,
        exerciseMetadata: {},
        history: [],
        plans: [],
        selectedSessionId: null,
        sessions: [],
        templates: [],
      };

      saveWorkoutData(resetData, STORAGE_VERSION);
      await saveWorkoutDataToIndexedDb(resetData, STORAGE_VERSION);
      setTemplates([]);
      setPlans([]);
      setHistory([]);
      setSessions([]);
      setExerciseMetadata({});
      setSelectedTemplateId(null);
      setSelectedTemplatePlanWeek(null);
      setSelectedSessionId(null);
      setSelectedHistory(null);
      setSelectedHistoryList(null);
      setConfirmDeleteTemplate(null);
      setCompletedPlanActions(null);
      setExtendPlanTarget(null);
      setExpandedPlanIds({});
      setDataAuditSummary(null);
      setDataAuditStatus("");
      markNormalizedSyncClean();
      setSyncStatus(
        "Workout sync data reset. Cloud plans, workouts, history, saved sessions, and this device's matching local data were cleared. Exercises were kept."
      );
    } catch (error) {
      console.error("Workout sync reset failed:", error);
      setSyncStatus(`Workout sync reset failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  }

  function getAiPlanContext(aiPlanningContext = {}) {
    const userId = authSession?.user?.id || null;
    const calorieGoal = readDailyCalorieGoalForAi(
      getDailyCalorieGoalStorageKey(userId)
    );
    const calorieGoalHistory = readDailyCalorieGoalHistoryForAi(
      getDailyCalorieGoalHistoryStorageKey(userId),
      calorieGoal
    );

    return buildAiPlanContext({
      athleteProfile: aiPlanningContext.athleteProfile || null,
      bodyWeightEntries: localBodyWeightEntries,
      calorieGoal,
      calorieGoalHistory,
      exerciseLibrary,
      history,
      nutritionEntries: calendarNutritionEntries,
      planningRequest: aiPlanningContext.planningRequest || null,
      plans,
      templates,
    });
  }

  async function copyAiPlanPrompt(aiPlanningContext) {
    const context = getAiPlanContext(aiPlanningContext);
    const prompt = getAiPlanPrompt(context);

    try {
      await writeTextToClipboard(prompt);
      const detail =
        "AI plan prompt copied. Attach the context JSON in your existing ChatGPT discussion.";
      setAiPlanStatus(detail);
      return { detail, message: "Prompt copied", ok: true };
    } catch (error) {
      console.error("AI plan prompt copy failed:", error);
      const detail =
        "Copy failed. Download the context and copy the visible prompt.";
      setAiPlanStatus(detail);
      return { detail, message: "Prompt copy failed", ok: false };
    }
  }

  async function copyAiPlanContext(aiPlanningContext) {
    const context = getAiPlanContext(aiPlanningContext);

    try {
      await writeTextToClipboard(JSON.stringify(context, null, 2));
      const detail = "Complete AI context JSON copied.";
      setAiPlanStatus(detail);
      return { detail, message: "Context copied", ok: true };
    } catch (error) {
      console.error("AI plan context copy failed:", error);
      const detail = "Context copy failed. Use Download Context instead.";
      setAiPlanStatus(detail);
      return { detail, message: "Context copy failed", ok: false };
    }
  }

  async function downloadAiTextFile({ contents, fileName, mimeType, title }) {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        path: fileName,
      });
      const { uri } = await Filesystem.getUri({
        directory: Directory.Cache,
        path: fileName,
      });

      await Share.share({ files: [uri], title });
      return "shared";
    }

    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return "downloaded";
  }

  async function downloadAiPlanContext(aiPlanningContext) {
    const context = getAiPlanContext(aiPlanningContext);
    const fileName = `workout-ai-context-${new Date().toISOString().slice(0, 10)}.json`;

    try {
      const result = await downloadAiTextFile({
        contents: JSON.stringify(context, null, 2),
        fileName,
        mimeType: "application/json;charset=utf-8",
        title: "Save AI workout-plan context",
      });
      const detail =
        result === "shared"
          ? "AI context ready. Choose Save to Files to keep it on this device."
          : "AI context downloaded. Attach it to your ChatGPT discussion.";
      setAiPlanStatus(detail);
      return {
        detail,
        message: result === "shared" ? "Context file ready" : "Context downloaded",
        ok: true,
      };
    } catch (error) {
      console.error("AI plan context download failed:", error);
      const detail =
        "Context download did not complete. Try Copy Context instead.";
      setAiPlanStatus(detail);
      return { detail, message: "Context download failed", ok: false };
    }
  }

  async function downloadAiPlanPrompt(aiPlanningContext) {
    const context = getAiPlanContext(aiPlanningContext);
    const prompt = getAiPlanPrompt(context);
    const fileName = `workout-ai-prompt-${new Date().toISOString().slice(0, 10)}.txt`;

    try {
      const result = await downloadAiTextFile({
        contents: prompt,
        fileName,
        mimeType: "text/plain;charset=utf-8",
        title: "Save AI workout-plan prompt",
      });
      const detail =
        result === "shared"
          ? "AI prompt ready. Choose Save to Files to keep it on this device."
          : "AI prompt downloaded.";
      setAiPlanStatus(detail);
      return {
        detail,
        message: result === "shared" ? "Prompt file ready" : "Prompt downloaded",
        ok: true,
      };
    } catch (error) {
      console.error("AI plan prompt download failed:", error);
      const detail = "Prompt download did not complete. Try Copy Prompt instead.";
      setAiPlanStatus(detail);
      return { detail, message: "Prompt download failed", ok: false };
    }
  }

  async function shareAiPlanContext(aiPlanningContext) {
    const context = getAiPlanContext(aiPlanningContext);
    const prompt = getAiPlanPrompt(context);
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `workout-ai-context-${date}.json`;
    const json = JSON.stringify(context, null, 2);
    let promptCopied = false;

    try {
      await writeTextToClipboard(prompt);
      promptCopied = true;
    } catch (error) {
      console.error("AI plan prompt copy before share failed:", error);
    }

    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          path: fileName,
        });
        const { uri } = await Filesystem.getUri({
          directory: Directory.Cache,
          path: fileName,
        });

        await Share.share({
          files: [uri],
          title: "Create a workout plan in ChatGPT",
        });
        const detail = `Context shared.${
          promptCopied ? " The prompt was also copied." : ""
        } Continue in ChatGPT, then return with the finalized JSON file.`;
        setAiPlanStatus(detail);
        return { detail, message: "Context shared", ok: true };
      }

      const file = new File([json], fileName, { type: "application/json" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Create a workout plan in ChatGPT",
        });
        const detail = `Context shared.${
          promptCopied ? " The prompt was also copied." : ""
        }`;
        setAiPlanStatus(detail);
        return { detail, message: "Context shared", ok: true };
      }

      const downloadResult = await downloadAiPlanContext(aiPlanningContext);

      if (downloadResult?.ok === false) {
        return downloadResult;
      }

      const detail = `Native sharing is unavailable here. The context was downloaded${
        promptCopied ? " and the prompt was copied" : ""
      }. Attach it in ChatGPT.`;
      setAiPlanStatus(detail);
      return { detail, message: "Context downloaded", ok: true };
    } catch (error) {
      console.error("AI plan context share failed:", error);
      const detail = `Sharing did not complete.${
        promptCopied ? " The prompt is copied;" : ""
      } use Download Context and Open ChatGPT instead.`;
      setAiPlanStatus(detail);
      return { detail, message: "Sharing did not complete", ok: false };
    }
  }

  function openChatGptForAiPlan() {
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    const detail =
      "ChatGPT opened. Use Copy Prompt and attach the JSON context.";
    setAiPlanStatus(detail);
    return { detail, message: "ChatGPT opened", ok: true };
  }

  function buildAiPlanDraftFromText(text) {
    const draft = parseAiPlanDraft(text);

    return buildImportedAiPlanDraft({
      draft,
      exerciseLibrary,
    });
  }

  function getExerciseHistoryExportCsv() {
    const selectedExerciseKeys =
      exerciseExportMode === "selected" ? selectedExerciseExportKeys : null;
    const rows = buildExerciseHistoryExportRows({
      bodyWeightEntries: localBodyWeightEntries,
      exerciseLibrary,
      history,
      selectedExerciseKeys,
    });

    if (exerciseExportMode === "selected" && selectedExerciseExportKeys.length === 0) {
      setExerciseExportStatus("Select at least one exercise to export.");
      return null;
    }

    if (rows.length === 0) {
      setExerciseExportStatus("No completed exercise history matched the export selection.");
      return null;
    }

    return buildCsv(
      [
        "completed_date",
        "completed_at",
        "workout_name",
        "workout_id",
        "plan_id",
        "plan_week",
        "plan_workout_id",
        "exercise_name",
        "exercise_id",
        "equipment",
        "set_number",
        "set_id",
        "is_drop_set",
        "drop_set_index",
        "weight",
        "weight_unit",
        "reps",
        "rir",
        "volume",
        "e1rm",
        "e1rm_unit",
        "completed",
      ],
      rows
    );
  }

  function getExerciseHistoryExportFilename() {
    const date = new Date().toISOString().slice(0, 10);
    const scope =
      exerciseExportMode === "selected"
        ? `${selectedExerciseExportKeys.length}-selected`
        : "all";

    return `exercise-history-${scope}-${date}.csv`;
  }

  function toggleExerciseExportSelection(exerciseKey) {
    setSelectedExerciseExportKeys((currentKeys) =>
      currentKeys.includes(exerciseKey)
        ? currentKeys.filter((key) => key !== exerciseKey)
        : [...currentKeys, exerciseKey]
    );
    setExerciseExportStatus("");
  }

  function downloadExerciseHistoryExport() {
    const csv = getExerciseHistoryExportCsv();

    if (!csv) {
      return;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getExerciseHistoryExportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExerciseExportStatus("Exercise history CSV downloaded.");
  }

  async function copyExerciseHistoryExport() {
    const csv = getExerciseHistoryExportCsv();

    if (!csv) {
      return;
    }

    try {
      await writeTextToClipboard(csv);
      setExerciseExportStatus("Exercise history CSV copied.");
    } catch (error) {
      console.error("Exercise history export copy failed:", error);
      setExerciseExportStatus("Copy failed. Download the CSV instead.");
    }
  }

  function getPlanExportCsv() {
    const selectedPlanIds =
      planExportMode === "active"
        ? plans
            .filter((plan) => plan.status === "active")
            .map((plan) => String(plan.id))
        : selectedPlanExportIds;

    if (selectedPlanIds.length === 0) {
      setPlanExportStatus(
        planExportMode === "active"
          ? "No active plan is available to export."
          : "Select at least one plan to export."
      );
      return null;
    }

    const rows = buildPlanExportRows({
      plans,
      selectedPlanIds,
      templates,
    });

    if (rows.length === 0) {
      setPlanExportStatus("No plan rows matched the export selection.");
      return null;
    }

    return buildCsv(
      [
        "plan_id",
        "plan_name",
        "plan_status",
        "plan_type",
        "plan_goal",
        "total_weeks",
        "training_weeks",
        "configured_total_weeks",
        "workouts_per_week",
        "current_week",
        "week_number",
        "week_role",
        "is_deload_week",
        "workout_day",
        "plan_workout_id",
        "workout_name",
        "workout_type",
        "stored_workout_type",
        "workout_type_source",
        "exercise_position",
        "exercise_name",
        "exercise_id",
        "equipment",
        "superset_group",
        "set_number",
        "prescribed_sets",
        "prescribed_drop_sets",
        "prescribed_reps",
        "prescribed_minimum_reps",
        "prescribed_rir",
        "rest_seconds",
      ],
      rows
    );
  }

  function getPlanExportFilename() {
    const date = new Date().toISOString().slice(0, 10);
    const scope =
      planExportMode === "selected"
        ? `${selectedPlanExportIds.length}-selected`
        : "active";

    return `plans-${scope}-${date}.csv`;
  }

  function getSelectedPlanForSupportedJson() {
    const selectedPlans =
      planExportMode === "active"
        ? plans.filter((plan) => plan.status === "active")
        : plans.filter((plan) =>
            selectedPlanExportIds.includes(String(plan.id))
          );

    if (selectedPlans.length !== 1) {
      setPlanExportStatus(
        selectedPlans.length === 0
          ? planExportMode === "active"
            ? "No active plan is available to export."
            : "Select one plan to export as supported JSON."
          : "Supported JSON contains one plan. Select exactly one plan."
      );
      return null;
    }

    return selectedPlans[0];
  }

  function getSupportedPlanJsonExport() {
    const plan = getSelectedPlanForSupportedJson();

    if (!plan) return null;

    return {
      json: JSON.stringify(buildSupportedPlanJson({ plan, templates }), null, 2),
      plan,
    };
  }

  function getSupportedPlanJsonFilename(plan) {
    const date = new Date().toISOString().slice(0, 10);
    const planSlug = String(plan?.name || "plan")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "plan";

    return `workout-plan-${planSlug}-${date}.json`;
  }

  function togglePlanExportSelection(planId) {
    setSelectedPlanExportIds((currentIds) =>
      currentIds.includes(String(planId))
        ? currentIds.filter((id) => id !== String(planId))
        : [...currentIds, String(planId)]
    );
    setPlanExportStatus("");
  }

  function downloadPlanExport() {
    const csv = getPlanExportCsv();

    if (!csv) {
      return;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getPlanExportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setPlanExportStatus("Plan CSV downloaded.");
  }

  async function copyPlanExport() {
    const csv = getPlanExportCsv();

    if (!csv) {
      return;
    }

    try {
      await writeTextToClipboard(csv);
      setPlanExportStatus("Plan CSV copied.");
    } catch (error) {
      console.error("Plan export copy failed:", error);
      setPlanExportStatus("Copy failed. Download the CSV instead.");
    }
  }

  async function downloadSupportedPlanJson() {
    const planExport = getSupportedPlanJsonExport();

    if (!planExport) return;

    const fileName = getSupportedPlanJsonFilename(planExport.plan);

    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          data: planExport.json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          path: fileName,
        });
        const { uri } = await Filesystem.getUri({
          directory: Directory.Cache,
          path: fileName,
        });

        await Share.share({
          files: [uri],
          title: `Export ${planExport.plan.name || "workout plan"}`,
        });
        setPlanExportStatus(
          `“${planExport.plan.name || "Plan"}” JSON shared. Choose Save to Files to keep it on this iPhone.`
        );
      } catch (error) {
        console.error("Supported plan JSON share failed:", error);
        setPlanExportStatus(
          "JSON export did not complete. Try Download JSON again and choose Save to Files."
        );
      }
      return;
    }

    const blob = new Blob([planExport.json], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setPlanExportStatus(
      `“${planExport.plan.name || "Plan"}” JSON downloaded.`
    );
  }

  async function copySupportedPlanJson() {
    const planExport = getSupportedPlanJsonExport();

    if (!planExport) return;

    try {
      await writeTextToClipboard(planExport.json);
      setPlanExportStatus("Supported plan JSON copied.");
    } catch (error) {
      console.error("Supported plan JSON copy failed:", error);
      setPlanExportStatus("Copy failed. Download the JSON instead.");
    }
  }

  async function runPersistenceAudit() {
    setSyncLoading(true);

    try {
      const localData = getCurrentWorkoutData();
      const localSummary = getAuditLocalSummary(localData);
      const normalizedSummary = authSession
        ? await getNormalizedCloudSummary(authSession)
        : null;

      setDataAuditSummary({
        local: localSummary,
        normalized: normalizedSummary,
      });
      setDataAuditStatus(
        authSession
          ? "Audit complete. No data was changed."
          : "Local audit complete. Sign in to include cloud checks."
      );
    } catch (error) {
      console.error("Persistence audit failed:", error);
      setDataAuditStatus(`Audit failed: ${error.message}`);
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
          const normalizedIndexedDbData =
            normalizeWorkoutDataPlanTypes(indexedDbData);

          setTemplates(normalizedIndexedDbData.templates);
          setPlans(normalizedIndexedDbData.plans);
          setHistory(normalizedIndexedDbData.history);
          setSessions(normalizedIndexedDbData.sessions);
          setExerciseLibrary(normalizedIndexedDbData.exerciseLibrary);
          setExerciseMetadata(normalizedIndexedDbData.exerciseMetadata);
          setLocalOwnerUserId(normalizedIndexedDbData.ownerUserId || null);
          setSelectedSessionId(normalizedIndexedDbData.selectedSessionId);
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
    if (!indexedDbReady) {
      return undefined;
    }

    const hasRestoredActiveWorkout = hasActiveWorkoutSession();
    const timeoutId = window.setTimeout(() => {
      document.documentElement.classList.add("app-ready");
    }, hasRestoredActiveWorkout
      ? ACTIVE_WORKOUT_STARTUP_SPLASH_MINIMUM_MS
      : STARTUP_SPLASH_MINIMUM_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [indexedDbReady]);

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
    setUpdateStatus("checking");
    rememberPendingUpdate();
    localStorage.removeItem(UPDATE_CONFIRMATION_KEY);
    setBuildNotice("");

    try {
      let result = {
        status: "unsupported",
      };

      if ("serviceWorker" in navigator && window.checkForAppUpdate) {
        result = await withUpdateTimeout(
          window.checkForAppUpdate(),
          "Service worker update check timed out."
        );
      } else if ("serviceWorker" in navigator) {
        result = await withUpdateTimeout(
          navigator.serviceWorker.ready.then(async (registration) => {
            await registration.update();
            await new Promise((resolve) => window.setTimeout(resolve, 1000));

            if (registration.waiting) {
              registration.waiting.postMessage({
                type: "SKIP_WAITING",
              });
            }

            return {
              shouldReload: Boolean(registration.waiting),
              status: registration.waiting ? "found" : "current",
            };
          }),
          "Service worker registration update timed out."
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

      const liveBuildTime = await getLiveBuildTime();

      if (liveBuildTime && liveBuildTime !== BUILD_TIME) {
        rememberPendingUpdate();
        setUpdateStatus("found");
        setTimeout(() => {
          reloadWithoutServiceWorkerCache().catch((error) => {
            console.error("Clean update reload failed:", error);
            window.location.reload();
          });
        }, 750);

        return;
      }

      localStorage.removeItem(PENDING_UPDATE_KEY);
      setLastUpdateCheck(new Date());
      setUpdateStatus(
        result.status === "unsupported" ? "current" : result.status || "current"
      );
    } catch (error) {
      localStorage.removeItem(PENDING_UPDATE_KEY);
      console.error("Update check failed:", error);
      setUpdateStatus("error");
    }
  }

  const persistedWorkoutDataRef = useRef(null);

  useEffect(() => {
    const normalizedPlanData = normalizeStoredPlanWorkoutTypes(plans, templates);
    const data = {
      exerciseLibrary,
      exerciseMetadata,
      history,
      ownerUserId: localOwnerUserId,
      plans: normalizedPlanData.plans,
      selectedSessionId,
      sessions,
      templates: normalizedPlanData.templates,
    };

    persistedWorkoutDataRef.current = data;

    saveWorkoutData(data, STORAGE_VERSION);
  }, [
    templates,
    plans,
    history,
    sessions,
    exerciseLibrary,
    exerciseMetadata,
    localOwnerUserId,
    selectedSessionId,
  ]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    saveWorkoutSessionJournal({
      ownerUserId: localOwnerUserId,
      selectedSessionId,
      sessions,
    }).catch((error) => {
      console.error("Failed to journal active workout session:", error);
    });
  }, [
    indexedDbReady,
    localOwnerUserId,
    selectedSessionId,
    sessions,
  ]);

  useEffect(() => {
    if (!indexedDbReady) {
      return;
    }

    const data = persistedWorkoutDataRef.current;

    if (!data) {
      return;
    }

    saveWorkoutDataToIndexedDb(data, STORAGE_VERSION).catch((error) => {
      console.error("Failed to save workout data to IndexedDB:", error);
    });
  }, [
    templates,
    plans,
    history,
    exerciseLibrary,
    exerciseMetadata,
    localOwnerUserId,
    indexedDbReady,
  ]);

  useEffect(() => {
    if (!indexedDbReady) {
      return undefined;
    }

    const checkpointTimer = window.setTimeout(() => {
      if (!persistedWorkoutDataRef.current) {
        return;
      }

      saveWorkoutDataToIndexedDb(
        persistedWorkoutDataRef.current,
        STORAGE_VERSION
      ).catch((error) => {
        console.error("Failed to checkpoint workout data:", error);
      });
    }, 5000);

    return () => window.clearTimeout(checkpointTimer);
  }, [indexedDbReady, selectedSessionId, sessions]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const localBodyWeightEntries = readLocalArray(BODY_WEIGHT_LOG_KEY);
  const editingPlan = plans.find(
    (plan) => String(plan.id) === String(editingPlanId)
  );
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

      if (getCurrentTimeMs() - lastCheck < AUTO_UPDATE_CHECK_INTERVAL) {
        return;
      }

      safeSetLocalStorage(
        LAST_AUTO_UPDATE_CHECK_KEY,
        String(getCurrentTimeMs())
      );

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
    const name = prompt("Workout name");

    if (!name) return;

    setTemplates([
      ...templates,

      {
        id: getCurrentTimeMs(),

        name,

        exercises: [],

        lastCompleted: null,
      },
    ]);
    requestSyncCheckpoint(["workouts"], "workout save");
  }

  function activatePlan(planId) {
    const planToActivate = plans.find(
      (plan) => String(plan.id) === String(planId)
    );
    const unfinishedActivePlan = plans.find(
      (plan) =>
        plan.status === "active" && String(plan.id) !== String(planId)
    );

    if (
      unfinishedActivePlan &&
      !window.confirm(
        `Activate ${planToActivate?.name || "this plan"}? ${unfinishedActivePlan.name} is still active and has not been completed. It will become inactive, but its progress will be kept.`
      )
    ) {
      return;
    }

    setPlans(
      plans.map((plan) => ({
        ...plan,
        currentWeek: plan.currentWeek || 1,
        status:
          String(plan.id) === String(planId)
            ? "active"
            : plan.status === "active"
              ? "inactive"
              : plan.status,
      }))
    );
    setExpandedPlanIds((current) => ({
      ...current,
      [planId]: true,
    }));
    requestSyncCheckpoint(["plans"], "plan status");
  }

  function restartPlan(planId) {
    const planToRestart = plans.find(
      (plan) => String(plan.id) === String(planId)
    );
    const confirmed = window.confirm(
      `Restart ${planToRestart?.name || "this plan"}? Its plan progress will return to week 1 and it will become the active plan. Completed workout history will be kept.`
    );

    if (!confirmed) {
      return;
    }

    setPlans(
      plans.map((plan) => ({
        ...plan,
        completions:
          String(plan.id) === String(planId) ? [] : plan.completions || [],
        currentWeek:
          String(plan.id) === String(planId) ? 1 : plan.currentWeek || 1,
        status:
          String(plan.id) === String(planId)
            ? "active"
            : plan.status === "active"
              ? "inactive"
              : plan.status,
      }))
    );
    setExpandedPlanIds((current) => ({
      ...current,
      [planId]: true,
    }));
    setCompletedPlanActions(null);
    requestSyncCheckpoint(["plans"], "plan restart");
  }

  function extendPlan(planId, weeksToAdd) {
    setPlans(
      plans.map((plan) => {
        if (String(plan.id) !== String(planId)) {
          return {
            ...plan,
            status: plan.status === "active" ? "inactive" : plan.status,
          };
        }

        const durationWeeks = Number(plan.durationWeeks) || 1;

        return {
          ...plan,
          currentWeek: durationWeeks + 1,
          durationWeeks: durationWeeks + weeksToAdd,
          status: "active",
        };
      })
    );
    setExpandedPlanIds((current) => ({
      ...current,
      [planId]: true,
    }));
    setCompletedPlanActions(null);
    setExtendPlanTarget(null);
    requestSyncCheckpoint(["plans"], "plan extend");
  }

  function clonePlan(plan) {
    const clonedAt = getCurrentTimeMs();
    const clonedPlanId = clonedAt;
    const clonedTemplates = (plan.workouts || []).map((planWorkout, index) => {
      const originalTemplate = templates.find(
        (template) => String(template.id) === String(planWorkout.templateId)
      );
      const templateId = clonedAt + index + 1;
      const planWorkoutId = `${clonedPlanId}:workout-${index + 1}`;

      return {
        ...(originalTemplate || {
          exercises: [],
          name: planWorkout.name,
        }),
        id: templateId,
        exercises: (originalTemplate?.exercises || []).map(
          (exercise, exerciseIndex) => ({
            ...exercise,
            id: clonedAt + index * 100 + exerciseIndex,
            sets: (exercise.sets || []).map((set, setIndex) => ({
              ...set,
              id: clonedAt + index * 1000 + exerciseIndex * 100 + setIndex,
            })),
          })
        ),
        lastCompleted: null,
        name: originalTemplate?.name || planWorkout.name,
        planId: clonedPlanId,
        planWorkoutId,
      };
    });
    const clonedPlan = {
      ...plan,
      id: clonedPlanId,
      name: `${plan.name} Copy`,
      status: "inactive",
      currentWeek: 1,
      createdAt: new Date().toISOString(),
      completions: [],
      workouts: clonedTemplates.map((template, index) => ({
        dayNumber: index + 1,
        name: template.name,
        planWorkoutId: template.planWorkoutId,
        templateId: template.id,
      })),
    };

    setPlans([...plans, clonedPlan]);
    setTemplates([...templates, ...clonedTemplates]);
    setExpandedPlanIds((current) => ({
      ...current,
      [clonedPlanId]: true,
    }));
    setCompletedPlanActions(null);
    requestSyncCheckpoint(["plans", "workouts"], "plan clone");
  }

  function deletePlan(plan) {
    const confirmed = window.confirm(
      `Delete ${plan.name}? Completed workout history will be kept, but this plan and its generated workout templates will be removed.`
    );

    if (!confirmed) {
      return;
    }

    const planTemplateIds = new Set(
      (plan.workouts || []).map((workout) => String(workout.templateId))
    );

    setPlans(plans.filter((item) => item.id !== plan.id));
    setTemplates(
      templates.filter((template) => !planTemplateIds.has(String(template.id)))
    );
    requestSyncCheckpoint(["plans", "workouts"], "plan delete");
  }

  function deleteStandaloneTemplate(template, { includeHistory = false } = {}) {
    setTemplates(templates.filter((item) => item.id !== template.id));

    if (includeHistory) {
      setHistory(
        history.filter(
          (workout) => String(workout.templateId) !== String(template.id)
        )
      );
    }

    setConfirmDeleteTemplate(null);
    requestSyncCheckpoint(
      includeHistory ? ["workouts", "history"] : ["workouts"],
      "workout delete"
    );
  }

  function deleteHistoryWorkout(workout) {
    const nextHistory = history.filter(
      (item) => String(item.id) !== String(workout.id)
    );

    setHistory(nextHistory);
    setSelectedHistory((current) =>
      current && String(current.id) === String(workout.id) ? null : current
    );
    setSelectedHistoryList((currentList) => {
      if (!Array.isArray(currentList)) {
        return currentList;
      }

      const nextList = currentList.filter(
        (item) => String(item.id) !== String(workout.id)
      );

      return nextList.length > 0 ? nextList : null;
    });
    setConfirmDeleteHistory(null);
    requestSyncCheckpoint(["history"], "history delete");
  }

  function updateHistoryWorkoutSet({
    workoutId,
    exerciseId,
    exerciseIndex,
    setId,
    setIndex,
    field,
    updates,
    value,
  }) {
    const editedExerciseIds = new Set();
    const pendingUpdates = Array.isArray(updates)
      ? updates
      : [
          {
            exerciseId,
            exerciseIndex,
            field,
            setId,
            setIndex,
            value,
          },
        ];
    const nextHistory = history.map((workout) => {
      if (String(workout.id) !== String(workoutId)) {
        return workout;
      }

      return {
        ...workout,
        exercises: (workout.exercises || []).map((exercise, currentExerciseIndex) => {
          const exerciseUpdates = pendingUpdates.filter((update) => {
            return (
              String(exercise.id) === String(update.exerciseId) ||
              (update.exerciseId == null &&
                Number.isInteger(update.exerciseIndex) &&
                currentExerciseIndex === update.exerciseIndex)
            );
          });

          if (exerciseUpdates.length === 0) {
            return exercise;
          }

          if (exercise.exerciseId) {
            editedExerciseIds.add(exercise.exerciseId);
          }

          return {
            ...exercise,
            sets: (exercise.sets || []).map((set, currentSetIndex) => {
              const setUpdates = exerciseUpdates.filter((update) => {
                return (
                  String(set.id) === String(update.setId) ||
                  (update.setId == null &&
                    Number.isInteger(update.setIndex) &&
                    currentSetIndex === update.setIndex)
                );
              });

              if (setUpdates.length === 0) {
                return set;
              }

              return setUpdates.reduce(
                (nextSet, update) => ({
                  ...nextSet,
                  [update.field]: update.value,
                }),
                set
              );
            }),
          };
        }),
      };
    });

    setHistory(nextHistory);
    setSelectedHistory((current) => {
      if (!current || String(current.id) !== String(workoutId)) {
        return current;
      }

      return nextHistory.find((workout) => String(workout.id) === String(workoutId)) || current;
    });
    setSelectedHistoryList((currentList) => {
      if (!Array.isArray(currentList)) {
        return currentList;
      }

      return currentList.map(
        (workout) =>
          nextHistory.find((item) => String(item.id) === String(workout.id)) || workout
      );
    });

    if (editedExerciseIds.size > 0) {
      setExerciseMetadata((currentMetadata) =>
        recomputeExerciseE1RMMetadata(
          nextHistory,
          currentMetadata,
          editedExerciseIds,
          exerciseLibrary,
          localBodyWeightEntries
        )
      );
    }

    requestSyncCheckpoint(["history", "exercisePreferences"], "history edit");
  }

  function getTemplateHistoryCount(templateId) {
    return history.filter(
      (workout) => String(workout.templateId) === String(templateId)
    ).length;
  }

  function getSortedPlansForComparison() {
    return [...plans].sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }

  function openPlanComparison() {
    const selectedIds = getSortedPlansForComparison()
      .slice(0, 4)
      .map((plan) => String(plan.id));

    setSelectedPlanComparisonIds((currentIds) => {
      const validCurrentIds = currentIds
        .filter((id) => plans.some((plan) => String(plan.id) === String(id)))
        .slice(0, 4);

      return validCurrentIds.length >= 2 ? validCurrentIds : selectedIds;
    });
    setPlanComparisonOpen(true);
  }

  function renderPlanComparisonDialog() {
    if (!planComparisonOpen) {
      return null;
    }

    const sortedPlans = getSortedPlansForComparison();
    const selectedIdSet = new Set(selectedPlanComparisonIds.map(String));
    const selectedPlans = sortedPlans.filter((plan) =>
      selectedIdSet.has(String(plan.id))
    );
    const planSummaries = selectedPlans.map((plan) => ({
      muscleSets: getPlanPrimaryMuscleSetSummary(
        plan,
        templates,
        exerciseLibrary
      ),
      plan,
    }));
    const muscles = [
      ...new Set(
        planSummaries.flatMap((summary) => Object.keys(summary.muscleSets))
      ),
    ];
    const muscleSections = buildPrimaryMuscleSections(
      Object.fromEntries(muscles.map((muscle) => [muscle, 0]))
    );
    const comparisonRows = muscleSections.flatMap((section) => [
      ...(section.showSubtotal
        ? [
            {
              isSubtotal: true,
              key: `section:${section.key}`,
              label: section.label,
              section,
            },
          ]
        : []),
      ...section.items.map((item) => ({
        isGroupedChild: section.showSubtotal,
        isSubtotal: false,
        key: `muscle:${item.muscle}`,
        label: item.muscle,
        muscle: item.muscle,
        section,
      })),
    ]);
    const selectedCount = selectedPlans.length;

    function togglePlanSelection(planId) {
      const id = String(planId);

      setSelectedPlanComparisonIds((currentIds) => {
        if (currentIds.includes(id)) {
          return currentIds.filter((item) => item !== id);
        }

        if (currentIds.length >= 4) {
          return currentIds;
        }

        return [...currentIds, id];
      });
    }

    function getComparisonCellStyle(values, value) {
      const distinctValues = [...new Set(values)];

      if (distinctValues.length <= 1) {
        return {};
      }

      const min = Math.min(...values);
      const max = Math.max(...values);

      if (value === max) {
        return {
          background: "color-mix(in srgb, var(--success-bg) 72%, transparent)",
          color: "var(--success-text)",
          fontWeight: "bold",
        };
      }

      if (value === min) {
        return {
          background: "color-mix(in srgb, var(--warning-bg) 72%, transparent)",
          color: "var(--warning-text)",
          fontWeight: "bold",
        };
      }

      return {
        background: "color-mix(in srgb, var(--accent) 10%, transparent)",
        fontWeight: "bold",
      };
    }

    return (
      <div
        aria-label="Plan muscle set comparison"
        aria-modal="true"
        onClick={() => setPlanComparisonOpen(false)}
        role="dialog"
        style={{
          alignItems: "center",
          background: "rgba(0,0,0,.48)",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          padding: "18px",
          position: "fixed",
          zIndex: 2400,
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxSizing: "border-box",
            color: "var(--text)",
            display: "grid",
            gap: "12px",
            maxHeight: "calc(100dvh - 36px)",
            maxWidth: "760px",
            overflowY: "auto",
            padding: "16px",
            width: "min(100%, 760px)",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "10px",
              justifyContent: "space-between",
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
                Compare Plans
              </h2>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "3px",
                }}
              >
                Primary-muscle sets per plan
              </div>
            </div>
            <button
              aria-label="Close plan comparison"
              onClick={() => setPlanComparisonOpen(false)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: "4px",
              }}
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gap: "6px",
            }}
          >
            {sortedPlans.map((plan) => {
              const selected = selectedIdSet.has(String(plan.id));
              const disabled = !selected && selectedCount >= 4;
              const selectedIndex = selectedPlans.findIndex(
                (selectedPlan) => String(selectedPlan.id) === String(plan.id)
              );

              return (
                <button
                  aria-pressed={selected}
                  disabled={disabled}
                  key={plan.id}
                  onClick={() => togglePlanSelection(plan.id)}
                  style={{
                    alignItems: "center",
                    background: selected
                      ? "color-mix(in srgb, var(--accent) 12%, var(--surface-raised))"
                      : "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: disabled ? "var(--text-muted)" : "var(--text)",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    minHeight: "38px",
                    opacity: disabled ? 0.55 : 1,
                    padding: "7px 9px",
                    textAlign: "left",
                  }}
                  type="button"
                >
                  {selected ? (
                    <CheckCircle2 size={17} color="var(--accent)" />
                  ) : (
                    <Circle size={17} color="var(--text-muted)" />
                  )}
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedIndex >= 0 ? `${selectedIndex + 1}. ` : ""}
                    {getPlanCompareLabel(plan)}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedPlans.length < 2 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: "8px",
                color: "var(--text-muted)",
                padding: "14px",
                textAlign: "center",
              }}
            >
              Select at least 2 plans to compare.
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "8px",
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  borderCollapse: "collapse",
                  fontSize: "13px",
                  minWidth: `${150 + selectedPlans.length * 58}px`,
                  width: "100%",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        borderBottom: "1px solid var(--border)",
                        padding: "8px",
                        textAlign: "left",
                      }}
                    >
                      Muscle
                    </th>
                    {selectedPlans.map((plan, index) => (
                      <th
                        key={plan.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          padding: "8px",
                          textAlign: "right",
                          verticalAlign: "bottom",
                        }}
                      >
                        {index + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => {
                    const values = planSummaries.map((summary) =>
                      row.isSubtotal
                        ? getPrimaryMuscleSectionTotal(
                            row.section,
                            summary.muscleSets
                          )
                        : summary.muscleSets[row.muscle] || 0
                    );

                    return (
                      <tr
                        key={row.key}
                        style={{
                          background: row.isSubtotal
                            ? "var(--surface-muted)"
                            : undefined,
                        }}
                      >
                        <th
                          style={{
                            borderBottom: "1px solid var(--border)",
                            fontWeight: row.isSubtotal
                              ? 800
                              : row.isGroupedChild
                                ? 500
                                : 700,
                            padding: "8px",
                            paddingLeft: row.isGroupedChild ? "18px" : "8px",
                            textAlign: "left",
                          }}
                        >
                          {row.label}
                        </th>
                        {planSummaries.map((summary, index) => {
                          const value = values[index];

                          return (
                            <td
                              key={summary.plan.id}
                              style={{
                                borderBottom: "1px solid var(--border)",
                                padding: "8px",
                                textAlign: "right",
                                ...getComparisonCellStyle(values, value),
                              }}
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderCompletedPlanActions() {
    if (!completedPlanActions) {
      return null;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${completedPlanActions.name} options`}
        style={{
          alignItems: "flex-end",
          background: "rgba(0,0,0,.42)",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          position: "fixed",
          zIndex: 1500,
        }}
      >
        <div
          style={{
            background: "var(--surface-raised)",
            borderRadius: "18px 18px 0 0",
            boxSizing: "border-box",
            maxWidth: "520px",
            padding: "16px",
            paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  fontSize: "18px",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Completed plan
              </h2>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "3px",
                }}
              >
                {completedPlanActions.name}
              </div>
            </div>
            <button
              aria-label="Close completed plan options"
              onClick={() => setCompletedPlanActions(null)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: "4px",
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >
            <button
              onClick={() => restartPlan(completedPlanActions.id)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                gap: "8px",
                justifyContent: "center",
                minHeight: "44px",
              }}
            >
              <RotateCcw size={17} /> Restart
            </button>
            <button
              onClick={() => setExtendPlanTarget(completedPlanActions)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                gap: "8px",
                justifyContent: "center",
                minHeight: "44px",
              }}
            >
              <CalendarPlus size={17} /> Extend
            </button>
            <button
              onClick={() => clonePlan(completedPlanActions)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                gap: "8px",
                justifyContent: "center",
                minHeight: "44px",
              }}
            >
              <Copy size={17} /> Clone
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderExtendPlanPicker() {
    if (!extendPlanTarget) {
      return null;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose extension length"
        style={{
          alignItems: "flex-end",
          background: "rgba(0,0,0,.42)",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          position: "fixed",
          zIndex: 1600,
        }}
      >
        <div
          style={{
            background: "var(--surface-raised)",
            borderRadius: "18px 18px 0 0",
            boxSizing: "border-box",
            maxWidth: "520px",
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
              Extend by weeks
            </h2>
            <button
              aria-label="Cancel extension"
              onClick={() => setExtendPlanTarget(null)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: "4px",
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(3, 1fr)",
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((weeks) => (
              <button
                key={weeks}
                onClick={() => extendPlan(extendPlanTarget.id, weeks)}
                style={{
                  minHeight: "46px",
                }}
              >
                {weeks}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderAiPlanNotesDialog() {
    const analysis = aiPlanNotesTarget?.aiAnalysis;

    if (!analysis) {
      return null;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${aiPlanNotesTarget.name} AI notes`}
        onClick={() => setAiPlanNotesTarget(null)}
        style={{
          alignItems: "flex-end",
          background: "rgba(0,0,0,.42)",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          position: "fixed",
          zIndex: 1700,
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            background: "var(--surface-raised)",
            borderRadius: "18px 18px 0 0",
            boxSizing: "border-box",
            display: "grid",
            gap: "12px",
            maxHeight: "82vh",
            maxWidth: "640px",
            overflow: "auto",
            padding: "16px",
            paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              justifyContent: "space-between",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: "18px",
                  gap: "7px",
                  margin: 0,
                }}
              >
                <Brain size={18} />
                AI Notes
              </h2>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "3px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {aiPlanNotesTarget.name}
              </div>
            </div>
            <button
              aria-label="Close AI notes"
              onClick={() => setAiPlanNotesTarget(null)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: "4px",
              }}
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          {analysis.summary && (
            <section>
              <h3 style={{ fontSize: "13px", margin: "0 0 6px" }}>Summary</h3>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "13px",
                  lineHeight: 1.45,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {analysis.summary}
              </p>
            </section>
          )}

          {analysis.rationale?.length > 0 && (
            <section>
              <h3 style={{ fontSize: "13px", margin: "0 0 6px" }}>Rationale</h3>
              <ul
                style={{
                  color: "var(--text-muted)",
                  display: "grid",
                  fontSize: "13px",
                  gap: "6px",
                  lineHeight: 1.45,
                  margin: "0 0 0 18px",
                  padding: 0,
                }}
              >
                {analysis.rationale.map((item, index) => (
                  <li key={`ai-note-rationale-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {analysis.watchNext?.length > 0 && (
            <section>
              <h3 style={{ fontSize: "13px", margin: "0 0 6px" }}>Watch Next</h3>
              <ul
                style={{
                  color: "var(--text-muted)",
                  display: "grid",
                  fontSize: "13px",
                  gap: "6px",
                  lineHeight: 1.45,
                  margin: "0 0 0 18px",
                  padding: 0,
                }}
              >
                {analysis.watchNext.map((item, index) => (
                  <li key={`ai-note-watch-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    );
  }

  function renderPlanCard(plan) {
    const displayWeek = planDisplayWeeks[plan.id] || plan.currentWeek || 1;
    const weekStatus = getPlanWeekStatus(plan, displayWeek, history);
    const active = plan.status === "active";
    const completed = plan.status === "completed";
    const expanded = expandedPlanIds[plan.id] ?? false;
    const missingWorkouts = getMissingPlanWorkouts(plan, templates);

    function toggleExpanded() {
      setExpandedPlanIds((current) => ({
        ...current,
        [plan.id]: !current[plan.id],
      }));
    }

    return (
      <section
        key={plan.id}
        style={{
          background: active ? "var(--surface-muted)" : "var(--surface)",
          border: active
            ? "1px solid color-mix(in srgb, var(--accent) 38%, var(--border))"
            : "1px solid var(--border)",
          borderRadius: "14px",
          boxShadow: active ? "0 8px 22px rgba(0,0,0,.06)" : "none",
          marginBottom: "12px",
          padding: "14px",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              minWidth: 0,
            }}
          >
            <button
              aria-label={`${expanded ? "Collapse" : "Expand"} ${plan.name}`}
              onClick={toggleExpanded}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "44px",
                minWidth: "44px",
                padding: "4px",
              }}
            >
              {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            </button>
            <button
              onClick={toggleExpanded}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                flex: "1 1 auto",
                minHeight: "44px",
                minWidth: 0,
                padding: 0,
                textAlign: "left",
                width: "100%",
              }}
            >
              <strong
                style={{
                  display: "block",
                  lineHeight: 1.3,
                  overflowWrap: "anywhere",
                  whiteSpace: "normal",
                }}
              >
                {plan.name}
              </strong>
            </button>
            <button
              aria-label={`Delete ${plan.name}`}
              onClick={() => deletePlan(plan)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                flex: "0 0 auto",
                justifyContent: "center",
                minHeight: "44px",
                minWidth: "44px",
                padding: "4px",
              }}
              title="Delete plan"
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              justifyContent: "flex-start",
            }}
          >
            {!completed && (
              <button
                aria-label={`Edit ${plan.name}`}
                onClick={() => openPlanEditor(plan)}
                title="Edit plan"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "5px",
                  justifyContent: "center",
                  minHeight: "44px",
                  padding: "6px 9px",
                }}
              >
                <Pencil size={15} />
                <span style={{ fontSize: "12px" }}>Edit</span>
              </button>
            )}
            {plan.aiAnalysis && (
              <button
                aria-label={`Show AI notes for ${plan.name}`}
                onClick={() => setAiPlanNotesTarget(plan)}
                title="AI notes"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "5px",
                  justifyContent: "center",
                  minHeight: "44px",
                  padding: "6px 9px",
                }}
                type="button"
              >
                <Brain size={15} />
                <span style={{ fontSize: "12px" }}>AI</span>
              </button>
            )}
            {!active && (
              <button
                aria-label={`Duplicate ${plan.name}`}
                onClick={() => clonePlan(plan)}
                title="Duplicate plan"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "5px",
                  justifyContent: "center",
                  minHeight: "44px",
                  padding: "6px 9px",
                }}
                type="button"
              >
                <Copy size={15} />
                <span style={{ fontSize: "12px" }}>Duplicate</span>
              </button>
            )}
            {completed ? (
              <>
                <button
                  onClick={() => restartPlan(plan.id)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "5px",
                    minHeight: "44px",
                    padding: "6px 9px",
                  }}
                  type="button"
                >
                  <RotateCcw size={15} />
                  <span style={{ fontSize: "12px" }}>Restart</span>
                </button>
                <button
                  onClick={() => setExtendPlanTarget(plan)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "5px",
                    minHeight: "44px",
                    padding: "6px 9px",
                  }}
                  type="button"
                >
                  <CalendarPlus size={15} />
                  <span style={{ fontSize: "12px" }}>Extend</span>
                </button>
              </>
            ) : !active ? (
              <button
                onClick={() => activatePlan(plan.id)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "5px",
                  minHeight: "44px",
                  padding: "6px 9px",
                }}
                type="button"
              >
                <Play size={15} />
                <span style={{ fontSize: "12px" }}>Activate</span>
              </button>
            ) : null}
          </div>
        </div>

        {expanded && (
          <>
            <div
              style={{
                alignItems: "center",
                color: "var(--text-muted)",
                display: "flex",
                fontSize: "12px",
                gap: "8px",
                justifyContent: "space-between",
                marginTop: "8px",
              }}
            >
              <span
                style={{
                  minWidth: 0,
                }}
              >
                {(plan.planType || plan.config?.planType) === "ai"
                  ? "AI"
                  : plan.goal === "progress"
                    ? "Progress"
                    : "Maintain"}{" "}
                · Week{" "}
                {weekStatus.currentWeekLabel} of {weekStatus.totalWeeks} ·{" "}
                {weekStatus.completedThisWeek}/{weekStatus.totalThisWeek} this week
              </span>
              <button
                onClick={() => setWeekPickerPlanId(plan.id)}
                style={{
                  minHeight: "30px",
                  padding: "3px 9px",
                  whiteSpace: "nowrap",
                }}
                type="button"
              >
                Week
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: "6px",
                marginTop: "10px",
              }}
            >
              {missingWorkouts.length > 0 && (
                <div
                  style={{
                    background: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)",
                    borderRadius: "6px",
                    color: "var(--danger-text)",
                    display: "grid",
                    gap: "6px",
                    padding: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    Missing {missingWorkouts.length} generated{" "}
                    {missingWorkouts.length === 1 ? "workout" : "workouts"}
                  </div>
                  <button
                    onClick={() => deletePlan(plan)}
                    style={{
                      justifySelf: "start",
                      minHeight: "32px",
                    }}
                  >
                    Remove incomplete plan
                  </button>
                </div>
              )}
              {(plan.workouts || []).map((planWorkout) => {
                const template = templates.find(
                  (item) => String(item.id) === String(planWorkout.templateId)
                );
                const done = isPlanWorkoutComplete(
                  plan,
                  planWorkout.planWorkoutId,
                  weekStatus.currentWeek,
                  history
                );
                const completedWorkout = done
                  ? getCompletedPlanWorkoutHistory(
                      plan,
                      planWorkout.planWorkoutId,
                      weekStatus.currentWeek,
                      history
                    )
                  : null;

                return (
                  <button
                    key={planWorkout.planWorkoutId}
                    disabled={!template}
                    onClick={() => {
                      if (!template) {
                        return;
                      }

                      if (completedWorkout) {
                        setSelectedHistory(completedWorkout);
                        return;
                      }

                      setSelectedTemplatePlanWeek(weekStatus.currentWeek);
                      setSelectedTemplateId(template.id);
                    }}
                    style={{
                      alignItems: "center",
                      background: template
                        ? "var(--surface-raised)"
                        : "var(--surface-muted)",
                      border: template
                        ? "1px solid var(--border)"
                        : "1px dashed var(--danger-border)",
                      borderRadius: "6px",
                      color: template ? "var(--text)" : "var(--danger-text)",
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
                      minHeight: "44px",
                      opacity: template ? 1 : 0.82,
                      padding: "7px 9px",
                      textAlign: "left",
                    }}
                  >
                    {done ? (
                      <CheckCircle2 size={17} color="var(--success-text)" />
                    ) : (
                      <Circle size={17} color="var(--text-muted)" />
                    )}
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "11px",
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Day {planWorkout.dayNumber}
                    </span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {template?.name || planWorkout.name}
                    </span>
                    <span
                      style={{
                        alignItems: "center",
                        display: "inline-flex",
                        gap: "3px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {template ? (
                        <>
                          <Eye size={15} /> {done ? "Review" : "Preview"}
                        </>
                      ) : (
                        "Missing"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!expanded && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
              marginTop: "6px",
            }}
          >
            Week {weekStatus.currentWeekLabel} · {weekStatus.completedThisWeek}/
            {weekStatus.totalThisWeek} done
          </div>
        )}
      </section>
    );
  }

  function renderWeekPicker() {
    const plan = plans.find((item) => String(item.id) === String(weekPickerPlanId));

    if (!plan) {
      return null;
    }

    const selectedWeek = planDisplayWeeks[plan.id] || plan.currentWeek || 1;

    return (
      <div
        aria-label={`${plan.name} week selector`}
        aria-modal="true"
        onClick={() => setWeekPickerPlanId(null)}
        role="dialog"
        style={{
          alignItems: "center",
          background: "rgba(0,0,0,.48)",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          padding: "18px",
          position: "fixed",
          zIndex: 2300,
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "0 18px 48px rgba(0,0,0,.28)",
            boxSizing: "border-box",
            display: "grid",
            gap: "10px",
            maxHeight: "80vh",
            maxWidth: "360px",
            overflowY: "auto",
            padding: "16px",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "minmax(0, 1fr) auto",
            }}
          >
            <strong
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {plan.name}
            </strong>
            <button
              aria-label="Close week selector"
              onClick={() => setWeekPickerPlanId(null)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "34px",
                minWidth: "34px",
                padding: "5px",
              }}
              type="button"
            >
              <X size={17} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gap: "6px",
            }}
          >
            {getPlanWeekOptions(plan).map((week) => {
              const selected = Number(selectedWeek) === Number(week.weekNumber);

              return (
                <button
                  key={week.weekNumber}
                  onClick={() => {
                    setPlanDisplayWeeks((current) => ({
                      ...current,
                      [plan.id]: week.weekNumber,
                    }));
                    setExpandedPlanIds((current) => ({
                      ...current,
                      [plan.id]: true,
                    }));
                    setWeekPickerPlanId(null);
                  }}
                  style={{
                    alignItems: "center",
                    background: selected
                      ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                      : "var(--surface)",
                    border: selected
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    minHeight: "42px",
                    padding: "8px 10px",
                    textAlign: "left",
                  }}
                  type="button"
                >
                  {week.completed ? (
                    <CheckCircle2 size={17} color="var(--success-text)" />
                  ) : (
                    <Circle size={17} color="var(--text-muted)" />
                  )}
                  <span>{week.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function goHome() {
    if (templatePreviewEditActive) {
      return;
    }

    const activePlan = plans.find((plan) => plan.status === "active");

    if (activePlan) {
      setExpandedPlanIds((current) => ({
        ...current,
        [activePlan.id]: true,
      }));
    }

    setShowExercises(false);
    setShowPlans(false);
    setEditingPlanId(null);
    setPlanEditorOpen(false);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
  }

  function goExercises() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(true);
    setShowPlans(false);
    setEditingPlanId(null);
    setPlanEditorOpen(false);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
  }

  function goPlans() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(false);
    setEditingPlanId(null);
    setPlanEditorOpen(false);
    setExpandedPlanIds((current) => {
      const next = { ...current };
      plans.forEach((plan) => {
        next[plan.id] = false;
      });
      return next;
    });
    setShowPlans(true);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
  }

  function openActivePlanInPlans(plan) {
    goPlans();
    setExpandedPlanIds((current) => ({
      ...current,
      [plan.id]: true,
    }));
  }

  function openNewPlanBuilder() {
    goPlans();
    setEditingPlanId(null);
    setPlanEditorOpen(true);
  }

  function goNutrition() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(false);
    setShowPlans(false);
    setEditingPlanId(null);
    setPlanEditorOpen(false);
    setShowNutrition(true);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
  }

  function goSettings() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(false);
    setShowPlans(false);
    setEditingPlanId(null);
    setPlanEditorOpen(false);
    setShowNutrition(false);
    setShowSettings(true);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
  }

  function openPlanEditor(plan) {
    if (templatePreviewEditActive) {
      return;
    }

    setEditingPlanId(plan.id);
    setPlanEditorOpen(true);
    setExpandedPlanIds((current) => ({
      ...current,
      [plan.id]: true,
    }));
    setShowExercises(false);
    setShowPlans(true);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
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
        icon: ExerciseArmIcon,
        key: "exercises",
        label: "Exercises",
        onClick: goExercises,
      },
      {
        icon: PlansBrainIcon,
        key: "plans",
        label: "Plans",
        onClick: goPlans,
      },
      {
        icon: NutritionBowlIcon,
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

    const navigation = (
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
              disabled={templatePreviewEditActive}
              onClick={item.onClick}
              title={
                templatePreviewEditActive
                  ? "Finish workout edits with OK or Cancel first."
                  : item.label
              }
              style={
                templatePreviewEditActive
                  ? {
                      ...(active
                        ? activeBottomNavButtonStyle
                        : bottomNavButtonStyle),
                      cursor: "not-allowed",
                      opacity: 0.38,
                    }
                  : active
                    ? activeBottomNavButtonStyle
                    : bottomNavButtonStyle
              }
            >
              <span className="bottom-nav__icon-slot">
                {["exercises", "plans"].includes(item.key) ? (
                  <Icon
                    active={active}
                    color={active ? "var(--accent)" : "var(--text-muted)"}
                    emphasized
                    monochrome
                    size={item.key === "exercises" ? 28 : 25}
                  />
                ) : (
                  <Icon
                    size={item.key === "nutrition" ? 24 : 22}
                    strokeWidth={
                      item.key === "nutrition" ? 1.55 : active ? 2.5 : 2
                    }
                  />
                )}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );

    return createPortal(navigation, document.body);
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
        {renderPlanCompletionPrompt()}
        {renderPlanComparisonDialog()}
        {renderAiPlanNotesDialog()}
        {renderBottomNav(activeView)}
      </div>
    );
  }

  function renderPlanCompletionPrompt() {
    if (!planCompletionPrompt) {
      return null;
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plan completed"
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
            display: "grid",
            gap: "12px",
            maxWidth: "340px",
            padding: "20px",
            width: "calc(100% - 32px)",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "grid",
              gap: "8px",
              justifyItems: "center",
              textAlign: "center",
            }}
          >
            <Trophy size={30} />
            <div
              style={{
                color: "var(--text-h)",
                fontSize: "20px",
                fontWeight: "bold",
              }}
            >
              Plan completed
            </div>
            {planCompletionPrompt.planName && (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                {planCompletionPrompt.planName}
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >
            <button
              onClick={completePlanCompletionPrompt}
              style={{ minHeight: "48px" }}
              type="button"
            >
              Complete plan
            </button>
            <button
              onClick={extendPromptPlanOneWeek}
              style={{ minHeight: "48px" }}
              type="button"
            >
              Extend plan one week
            </button>
            <button
              onClick={repeatPromptPlan}
              style={{ minHeight: "48px" }}
              type="button"
            >
              Repeat plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderAuthSyncIndicator({ inHeader = false } = {}) {
    const signedIn = Boolean(authSession?.user?.id);
    const hasPendingApprovals = signedIn && pendingApprovalCount > 0;

    return (
      <div
        style={{
          alignItems: "center",
          display: "inline-flex",
          gap: "6px",
          justifyContent: inHeader ? "flex-end" : "center",
          justifySelf: inHeader ? "end" : "center",
          margin: inHeader ? 0 : "-6px 0 14px",
          maxWidth: "100%",
        }}
      >
        <span
          aria-label={
            signedIn ? "Signed in; sync is on" : "Signed out; local only"
          }
          style={{
            alignItems: "center",
            background: signedIn ? "#e8f5e9" : "#fff8e1",
            border: `1px solid ${signedIn ? "#a5d6a7" : "#ffe082"}`,
            borderRadius: "999px",
            color: signedIn ? "#1b5e20" : "#7a4f01",
            display: "inline-flex",
            fontSize: inHeader ? "11px" : "12px",
            gap: "6px",
            lineHeight: 1.2,
            padding: inHeader ? "4px 8px" : "5px 10px",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              background: signedIn ? "#2e7d32" : "#f9a825",
              borderRadius: "999px",
              height: "8px",
              width: "8px",
            }}
          />
          {signedIn ? "Signed in - sync on" : "Signed out - local only"}
        </span>
        {hasPendingApprovals && (
          <span
            aria-label={pendingApprovalMessage}
            style={{
              alignItems: "center",
              background: "#ffebee",
              border: "1px solid #ef9a9a",
              borderRadius: "999px",
              color: "#b71c1c",
              display: "inline-flex",
              fontSize: inHeader ? "11px" : "12px",
              gap: "6px",
              lineHeight: 1.2,
              padding: inHeader ? "4px 8px" : "5px 10px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                background: "#c62828",
                borderRadius: "999px",
                height: "8px",
                width: "8px",
              }}
            />
            <span>{pendingApprovalMessage}</span>
          </span>
        )}
      </div>
    );
  }

  function updatePlateInventory(updater) {
    const updatedInventory = normalizePlateInventory(updater(plateInventoryRef.current));

    plateInventoryRef.current = updatedInventory;
    plateInventoryRevisionRef.current += 1;
    savePlateInventory(updatedInventory);
    if (authSessionRef.current?.user?.id) {
      setPlateInventoryOwnerUserId(authSessionRef.current.user.id);
      savePlateInventoryOwner(authSessionRef.current.user.id);
    }
    setPlateInventory(updatedInventory);
    requestSyncCheckpoint(["plateInventory"], "plate inventory");
  }

  function setPlateCount(categoryKey, plateId, count) {
    updatePlateInventory((currentInventory) => ({
      ...currentInventory,
      [categoryKey]: currentInventory[categoryKey].map((plate) =>
        plate.id === plateId
          ? {
              ...plate,
              count: Math.max(0, Number.parseInt(count, 10) || 0),
            }
          : plate
      ),
    }));
  }

  function setEquipmentWeight(equipmentId, weight) {
    updatePlateInventory((currentInventory) => ({
      ...currentInventory,
      equipmentWeights: {
        ...(currentInventory.equipmentWeights || {}),
        [equipmentId]: Math.max(0, Number(weight) || 0),
      },
    }));
  }

  function resetEquipmentInventory() {
    updatePlateInventory((currentInventory) => ({
      ...currentInventory,
      equipmentWeights: DEFAULT_EQUIPMENT_WEIGHTS,
    }));
  }

  function addPlateSize(categoryKey) {
    const weight = Number.parseFloat(newPlateDrafts[categoryKey]);

    if (!Number.isFinite(weight) || weight <= 0) {
      return;
    }

    updatePlateInventory((currentInventory) => {
      const existingPlate = currentInventory[categoryKey].find(
        (plate) => Number(plate.weight) === weight
      );

      if (existingPlate) {
        return {
          ...currentInventory,
          [categoryKey]: currentInventory[categoryKey].map((plate) =>
            plate.id === existingPlate.id
              ? {
                  ...plate,
                  count: plate.count + 2,
                }
              : plate
          ),
        };
      }

      return {
        ...currentInventory,
        [categoryKey]: [
          ...currentInventory[categoryKey],
          {
            count: 2,
            id: `${categoryKey}-${weight}-${Date.now()}`,
            weight,
          },
        ],
      };
    });
    setNewPlateDrafts((drafts) => ({
      ...drafts,
      [categoryKey]: "",
    }));
  }

  function removePlateSize(categoryKey, plateId) {
    updatePlateInventory((currentInventory) => ({
      ...currentInventory,
      [categoryKey]: currentInventory[categoryKey].filter(
        (plate) => plate.id !== plateId
      ),
    }));
  }

  function resetPlateInventory() {
    const defaults = normalizePlateInventory(null);

    setPlateInventory(defaults);
    plateInventoryRef.current = defaults;
    plateInventoryRevisionRef.current += 1;
    savePlateInventory(defaults);
    if (authSessionRef.current?.user?.id) {
      setPlateInventoryOwnerUserId(authSessionRef.current.user.id);
      savePlateInventoryOwner(authSessionRef.current.user.id);
    }
    requestSyncCheckpoint(["plateInventory"], "plate inventory");
    setNewPlateDrafts({
      oneInch: "",
      twoInch: "",
    });
  }

  function renderPlateInventoryCategory(categoryKey, label, description) {
    const plates = plateInventory[categoryKey] || [];
    const expanded = plateCategoryExpanded[categoryKey] !== false;

    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: "8px",
          padding: "10px",
        }}
      >
        <button
          aria-expanded={expanded}
          onClick={() =>
            setPlateCategoryExpanded((current) => ({
              ...current,
              [categoryKey]: !expanded,
            }))
          }
          style={{
            alignItems: "center",
            background: "transparent",
            border: "none",
            color: "var(--text)",
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            padding: 0,
            textAlign: "left",
          }}
          type="button"
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span>
            <strong>{label}</strong>
            <span
              style={{
                color: "var(--text-muted)",
                display: "block",
                fontSize: "12px",
                marginTop: "2px",
              }}
            >
              {description}
            </span>
          </span>
        </button>

        {expanded && (
          <>
            <div
              style={{
                display: "grid",
                gap: "6px",
              }}
            >
              {plates.map((plate) => (
                <div
                  key={plate.id}
                  style={{
                    alignItems: "center",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "minmax(0, 1fr) auto auto auto auto",
                    padding: "8px",
                  }}
                >
                  <strong
                    style={{
                      justifySelf: "start",
                      minWidth: 0,
                      textAlign: "left",
                    }}
                  >
                    {plate.weight} lb
                  </strong>
                  <button
                    aria-label={`Remove one ${plate.weight} lb plate`}
                    onClick={() =>
                      setPlateCount(categoryKey, plate.id, plate.count - 1)
                    }
                    style={{
                      minHeight: "32px",
                      minWidth: "32px",
                      padding: "4px 8px",
                    }}
                    type="button"
                  >
                    -
                  </button>
                  <button
                    aria-label={`${label} ${plate.weight} lb plate count`}
                    onClick={() =>
                      setPlateCountPicker({
                        categoryKey,
                        count: plate.count,
                        plateId: plate.id,
                        weight: plate.weight,
                      })
                    }
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      font: "inherit",
                      minHeight: "32px",
                      minWidth: "54px",
                      padding: "4px 8px",
                      textAlign: "center",
                    }}
                    type="button"
                  >
                    {plate.count}
                  </button>
                  <button
                    aria-label={`Add one ${plate.weight} lb plate`}
                    onClick={() =>
                      setPlateCount(categoryKey, plate.id, plate.count + 1)
                    }
                    style={{
                      minHeight: "32px",
                      minWidth: "32px",
                      padding: "4px 8px",
                    }}
                    type="button"
                  >
                    +
                  </button>
                  <button
                    aria-label={`Delete ${plate.weight} lb plate size`}
                    onClick={() => removePlateSize(categoryKey, plate.id)}
                    style={{
                      color: "var(--danger-text)",
                      minHeight: "30px",
                      padding: "4px 8px",
                    }}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              }}
            >
              <input
                aria-label={`New ${label} plate weight`}
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setNewPlateDrafts((drafts) => ({
                    ...drafts,
                    [categoryKey]: event.target.value,
                  }))
                }
                placeholder="weight"
                style={{
                  boxSizing: "border-box",
                  font: "inherit",
                  minWidth: 0,
                }}
                type="number"
                value={newPlateDrafts[categoryKey]}
              />
              <button
                onClick={() => addPlateSize(categoryKey)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  justifyContent: "center",
                  minHeight: "38px",
                  padding: "6px 10px",
                }}
                type="button"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderEquipmentInventory() {
    const equipmentWeights = plateInventory.equipmentWeights || {};

    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: "8px",
          padding: "10px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "minmax(0, 1fr) auto",
          }}
        >
          <button
            aria-expanded={equipmentInventoryExpanded}
            onClick={() =>
              setEquipmentInventoryExpanded((expanded) => !expanded)
            }
            style={{
              alignItems: "center",
              background: "transparent",
              border: "none",
              color: "var(--text)",
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "auto minmax(0, 1fr)",
              padding: 0,
              textAlign: "left",
            }}
            type="button"
          >
            {equipmentInventoryExpanded ? (
              <ChevronDown size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
            <strong>Equipment Inventory</strong>
          </button>
          {equipmentInventoryExpanded && (
            <button onClick={resetEquipmentInventory} type="button">
              Reset
            </button>
          )}
        </div>

        {equipmentInventoryExpanded && (
          <div
            style={{
              display: "grid",
              gap: "6px",
            }}
          >
            {LOAD_CALCULATOR_EQUIPMENT.map((equipment) => {
              const weight =
                equipmentWeights[equipment.id] ??
                DEFAULT_EQUIPMENT_WEIGHTS[equipment.id];

              return (
                <div
                  key={equipment.id}
                  style={{
                    alignItems: "center",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    padding: "8px",
                  }}
                >
                  <strong>{equipment.label}</strong>
                  <button
                    aria-label={`${equipment.label} equipment weight`}
                    onClick={() =>
                      setEquipmentWeightPicker({
                        equipmentId: equipment.id,
                        label: equipment.label,
                        weight,
                      })
                    }
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      font: "inherit",
                      minHeight: "32px",
                      minWidth: "68px",
                      padding: "4px 8px",
                      textAlign: "center",
                    }}
                    type="button"
                  >
                    {formatPlateNumber(weight)} lb
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderPlateLoadingDiagram(loading, optionCount) {
    const leftPlates = loading.leftPlates || [];
    const rightPlates = loading.rightPlates || [];
    const machinePlates = loading.machinePlates || [];
    const allPlates = [...leftPlates, ...rightPlates, ...machinePlates];
    const maxPlateWeight = Math.max(55, ...allPlates);
    const leftTotal = leftPlates.reduce((total, plate) => total + plate, 0);
    const rightTotal = rightPlates.reduce((total, plate) => total + plate, 0);
    const machineTotal = machinePlates.reduce((total, plate) => total + plate, 0);
    const canCycleOptions = optionCount > 1;
    const showMachineStack = loading.equipment.loadMode === "stack";
    const showCableToggle = loading.equipment.loadMode === "cable";
    const showDumbbellToggle = loading.equipment.id === "dumbbell";
    const showCountToggle = showCableToggle || showDumbbellToggle;
    const isOneEndedLoad =
      loading.equipment.loadMode === "singleEnd" || showMachineStack;
    const shownLeftPlates = showMachineStack ? [] : leftPlates;
    const shownRightPlates = showMachineStack ? machinePlates : rightPlates;
    const shownLeftTotal = showMachineStack ? 0 : leftTotal;
    const shownRightTotal = showMachineStack ? machineTotal : rightTotal;
    const barWidth =
      LOAD_CALCULATOR_BAR_WIDTHS[loading.equipment.id] ||
      LOAD_CALCULATOR_BAR_WIDTHS.barbell;
    const barColumnWidth =
      LOAD_CALCULATOR_BAR_COLUMNS[loading.equipment.id] ||
      LOAD_CALCULATOR_BAR_COLUMNS.barbell;
    const diagramColumns = isOneEndedLoad
      ? `minmax(0, .5fr) ${barColumnWidth} minmax(0, 1.5fr)`
      : `minmax(0, 1fr) ${barColumnWidth} minmax(0, 1fr)`;
    const getPlateStyle = (plate) =>
      loading.equipment.categoryKey === "twoInch"
        ? TWO_INCH_PLATE_STYLES[formatPlateNumber(plate)] || {
            background: "#d7e7f5",
            border: "#7da4c3",
            color: "#17324a",
          }
        : {
            background: "#d7e7f5",
            border: "#7da4c3",
            color: "#17324a",
          };
    const renderPlate = (plate, index, side) => {
      const height = 32 + (plate / maxPlateWeight) * 36;
      const plateStyle = getPlateStyle(plate);

      return (
        <div
          key={`${side}-${plate}-${index}`}
          title={`${formatPlateNumber(plate)} lb`}
          style={{
            alignItems: "center",
            background: plateStyle.background,
            border: `1px solid ${plateStyle.border}`,
            borderRadius: "5px",
            color: plateStyle.color,
            display: "flex",
            flex: "0 0 clamp(12px, 3.4vw, 15px)",
            fontSize: "10px",
            fontWeight: 700,
            height: `${height}px`,
            justifyContent: "center",
            lineHeight: 1,
            padding: "2px",
            writingMode: "vertical-rl",
          }}
        >
          {formatPlateNumber(plate)}
        </div>
      );
    };
    const renderCountToggle = () => {
      if (!showCountToggle) {
        return null;
      }

      const toggleConfig = showCableToggle
        ? {
            ariaLabel: "Cable pulleys",
            icon: <Cable size={15} />,
            stateKey: "cablePulleyCount",
          }
        : {
            ariaLabel: "Dumbbell count",
            icon: <Dumbbell size={15} />,
            stateKey: "dumbbellCount",
          };

      return (
        <div
          aria-label={toggleConfig.ariaLabel}
          onClick={(event) => event.stopPropagation()}
          style={{
            alignItems: "center",
            display: "inline-flex",
            gap: "4px",
            justifySelf: "end",
          }}
        >
          {toggleConfig.icon}
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: "999px",
              display: "inline-grid",
              gridTemplateColumns: "1fr 1fr",
              overflow: "hidden",
            }}
          >
            {[1, 2].map((pulleyCount) => {
              const active =
                Number(loadCalculatorDraft[toggleConfig.stateKey]) === pulleyCount;

              return (
                <button
                  key={pulleyCount}
                  aria-pressed={active}
                  onClick={() =>
                    setLoadCalculatorDraft((draft) => ({
                      ...draft,
                      [toggleConfig.stateKey]: pulleyCount,
                      optionIndex: 0,
                    }))
                  }
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    border: "none",
                    color: active ? "var(--surface)" : "var(--text)",
                    font: "inherit",
                    fontSize: "12px",
                    fontWeight: active ? 700 : 500,
                    minHeight: "24px",
                    minWidth: "28px",
                    padding: "2px 8px",
                  }}
                  type="button"
                >
                  {pulleyCount}
                </button>
              );
            })}
          </span>
        </div>
      );
    };

    return (
      <div
        aria-label="Plate loading diagram"
        aria-disabled={!canCycleOptions}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!canCycleOptions) {
            return;
          }

          setLoadCalculatorDraft((draft) => ({
            ...draft,
            optionIndex: (draft.optionIndex + 1) % optionCount,
          }));
        }}
        onKeyDown={(event) => {
          if (!canCycleOptions || (event.key !== "Enter" && event.key !== " ")) {
            return;
          }

          event.preventDefault();
          setLoadCalculatorDraft((draft) => ({
            ...draft,
            optionIndex: (draft.optionIndex + 1) % optionCount,
          }));
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: canCycleOptions ? "pointer" : "default",
          display: "grid",
          gap: "8px",
          marginTop: "12px",
          overflow: "hidden",
          padding: 0,
          textAlign: "inherit",
          width: "100%",
        }}
      >
        {showCountToggle && renderCountToggle()}

        <div
          style={{
            alignItems: "center",
            display: "grid",
            gap: "3px",
            gridTemplateColumns: diagramColumns,
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "row-reverse",
              gap: "3px",
              justifyContent: "end",
              minWidth: 0,
            }}
          >
            {shownLeftPlates.map((plate, index) =>
              renderPlate(plate, index, "left")
            )}
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              height: "72px",
              justifyContent: "center",
              minWidth: 0,
              width: "100%",
            }}
          >
            <div
              style={{
                background: "#67717c",
                borderRadius: "999px",
                height: "8px",
                width: barWidth,
              }}
            />
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "3px",
              justifyContent: "start",
              minWidth: 0,
            }}
          >
            {shownRightPlates.map((plate, index) =>
              renderPlate(plate, index, "right")
            )}
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            color: "var(--text-muted)",
            display: "grid",
            fontSize: "12px",
            gap: "3px",
            gridTemplateColumns: diagramColumns,
            textAlign: "center",
          }}
        >
          <span>
            {shownLeftTotal > 0 ? `${formatPlateNumber(shownLeftTotal)} lb` : ""}
          </span>
          <strong
            style={{
              color: "var(--text)",
              fontSize: "12px",
            }}
          >
            {formatPlateNumber(loading.equipment.weight)}
          </strong>
          <span>
            {shownRightTotal > 0
              ? `${formatPlateNumber(shownRightTotal)} lb`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  function renderPlateLoadCalculator() {
    const calculatedLoading = calculatePlateLoading(
      deferredLoadCalculatorDraft.weight,
      deferredLoadCalculatorDraft.equipmentId,
      plateInventory,
      deferredLoadCalculatorDraft.cablePulleyCount,
      deferredLoadCalculatorDraft.dumbbellCount
    );
    const optionCount = calculatedLoading.loadingOptions?.length || 0;
    const selectedOptionIndex = optionCount
      ? loadCalculatorDraft.optionIndex % optionCount
      : 0;
    const loading =
      calculatedLoading.status === "ready"
        ? (() => {
            const selectedPlates =
              calculatedLoading.loadingOptions[selectedOptionIndex] ||
              calculatedLoading.platesPerSide;

            return {
              ...calculatedLoading,
              leftPlates:
                calculatedLoading.equipment.loadMode === "balanced" ||
                calculatedLoading.equipment.loadMode === "cable"
                  ? selectedPlates
                  : [],
              machinePlates:
                calculatedLoading.equipment.loadMode === "stack"
                  ? selectedPlates
                  : [],
              optionIndex: selectedOptionIndex,
              platesPerSide: selectedPlates,
              rightPlates:
                calculatedLoading.equipment.loadMode === "balanced" ||
                calculatedLoading.equipment.loadMode === "singleEnd" ||
                calculatedLoading.equipment.loadMode === "cable"
                  ? selectedPlates
                  : [],
            };
          })()
        : calculatedLoading;
    return (
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: "6px",
          margin: "18px auto",
          maxWidth: "520px",
          padding: "10px",
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
          }}
        >
          Plate Loading Calculator
        </h3>

        <div
          style={{
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "minmax(0, 1fr) minmax(118px, auto)",
          }}
        >
          <input
            aria-label="Target loaded weight"
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              setLoadCalculatorDraft((draft) => ({
                ...draft,
                optionIndex: 0,
                weight: event.target.value,
              }))
            }
            placeholder="weight"
            style={{
              boxSizing: "border-box",
              font: "inherit",
              minWidth: 0,
            }}
            type="number"
            value={loadCalculatorDraft.weight}
          />
          <select
            aria-label="Equipment"
            onChange={(event) =>
              setLoadCalculatorDraft((draft) => ({
                ...draft,
                equipmentId: event.target.value,
                optionIndex: 0,
              }))
            }
            style={{
              font: "inherit",
              minHeight: "38px",
              minWidth: 0,
            }}
            value={loadCalculatorDraft.equipmentId}
          >
            {LOAD_CALCULATOR_EQUIPMENT.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "grid",
            gap: "8px",
            marginTop: "10px",
            padding: "10px",
            textAlign: "left",
          }}
        >
          {loading.status === "empty" && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
            >
              Enter a target weight to calculate the loading.
            </div>
          )}

          {loading.status === "underBar" && (
            <div
              style={{
                color: "var(--danger-text)",
                fontSize: "12px",
              }}
            >
              {formatPlateNumber(loading.requestedWeight)} lb is below the{" "}
              {formatPlateNumber(loading.equipment.weight)} lb{" "}
              {loading.equipment.label} weight.
            </div>
          )}

          {loading.status === "ready" && (
            <>
              <div
                style={{
                  display: "grid",
                  gap: "4px",
                }}
              >
                <strong>
                  {loading.exact ? "Load" : "Closest load"}{" "}
                  {formatPlateNumber(loading.achievedTotal)} lb
                </strong>
              </div>

              {loading.platesPerSide.length > 0 ? (
                renderPlateLoadingDiagram(loading, optionCount)
              ) : (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  No plates needed.
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  function renderSettings() {
    const exerciseHistoryExportOptions = buildExerciseHistoryExportOptions(
      history,
      exerciseLibrary
    );
    const exerciseHistoryExportQuery = exerciseExportSearch.trim().toLowerCase();
    const filteredExerciseHistoryExportOptions = exerciseHistoryExportOptions.filter(
      (exercise) =>
        !exerciseHistoryExportQuery ||
        `${exercise.name} ${exercise.equipment}`
          .toLowerCase()
          .includes(exerciseHistoryExportQuery)
    );
    const exportSelectionCount =
      exerciseExportMode === "selected"
        ? selectedExerciseExportKeys.length
        : exerciseHistoryExportOptions.length;
    const planExportOptions = buildPlanExportOptions(plans);
    const activePlanExportCount = planExportOptions.filter(
      (plan) => plan.status === "active"
    ).length;
    const planExportSelectionCount =
      planExportMode === "selected"
        ? selectedPlanExportIds.length
        : activePlanExportCount;

    return (
      <div
        style={{
          padding: "20px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <Settings color="var(--accent)" size={26} />
          <h2
            style={{
              margin: 0,
            }}
          >
            Settings
          </h2>
        </div>

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
          {!__IS_NATIVE_BUILD__ && (
            <>
              <button
                onClick={checkForUpdate}
                disabled={
                  updateStatus === "checking" || updateStatus === "found"
                }
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
            </>
          )}
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
          {authSession && (
            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  flexWrap: "wrap",
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
                <button
                  disabled={!isSupabaseConfigured || authLoading}
                  onClick={() => {
                    setChangePasswordDraft({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setChangePasswordStatus("");
                    setChangePasswordDialogOpen(true);
                  }}
                  type="button"
                >
                  Change Password
                </button>
                <button
                  disabled={authLoading}
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign Out
                </button>
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                Approval:{" "}
                {approvalLoading
                  ? "checking..."
                  : approvalStatus?.status || "not verified"}
                {approvalFromCache ? " (cached)" : ""}
              </div>
              {approvalError && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {approvalError}
                </div>
              )}
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
          {changePasswordDialogOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Change password"
              style={{
                alignItems: "center",
                background: "rgba(0,0,0,.5)",
                display: "flex",
                inset: 0,
                justifyContent: "center",
                padding: "20px",
                position: "fixed",
                zIndex: 2300,
              }}
            >
              <form
                onSubmit={submitChangePassword}
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  boxShadow: "0 18px 42px rgba(0,0,0,.28)",
                  display: "grid",
                  gap: "10px",
                  maxWidth: "360px",
                  padding: "18px",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                    }}
                  >
                    Change Password
                  </h3>
                  <button
                    aria-label="Close change password"
                    disabled={changePasswordLoading}
                    onClick={closeChangePasswordDialog}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
                <label
                  style={{
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  Current password
                  <input
                    autoComplete="current-password"
                    disabled={changePasswordLoading}
                    type="password"
                    value={changePasswordDraft.currentPassword}
                    onChange={(event) =>
                      setChangePasswordDraft((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                  />
                </label>
                <label
                  style={{
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  New password
                  <input
                    autoComplete="new-password"
                    disabled={changePasswordLoading}
                    type="password"
                    value={changePasswordDraft.newPassword}
                    onChange={(event) =>
                      setChangePasswordDraft((current) => ({
                        ...current,
                        newPassword: event.target.value,
                      }))
                    }
                  />
                </label>
                <label
                  style={{
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  Re-enter new password
                  <input
                    autoComplete="new-password"
                    disabled={changePasswordLoading}
                    type="password"
                    value={changePasswordDraft.confirmPassword}
                    onChange={(event) =>
                      setChangePasswordDraft((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                  />
                </label>
                {changePasswordStatus && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      color: changePasswordStatus.includes("failed")
                        ? "var(--danger-text)"
                        : "var(--text-muted)",
                      fontSize: "12px",
                    }}
                  >
                    {changePasswordStatus}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <button
                    disabled={changePasswordLoading}
                    onClick={closeChangePasswordDialog}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button disabled={changePasswordLoading} type="submit">
                    {changePasswordLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
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
            {syncStatus}
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: "10px",
              paddingTop: "10px",
            }}
          >
            <h3 style={{ fontSize: "15px", margin: "0 0 8px" }}>
              Workouts, Exercises, and Plans
            </h3>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginBottom: "4px",
              }}
            >
              Last synced: {formatLastNormalizedSyncAt(lastNormalizedSyncAt)}
            </div>
            <div
              style={{
                color:
                  normalizedSyncDirtyDomains.length > 0
                    ? "var(--danger-text)"
                    : "var(--text-muted)",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              {normalizedSyncDirtyDomains.length} data area{
                normalizedSyncDirtyDomains.length === 1 ? "" : "s"
              } with queued changes
              {normalizedSyncDirtyDomains.length > 0
                ? `: ${normalizedSyncDirtyDomains
                    .map(
                      (domain) => NORMALIZED_SYNC_DOMAIN_LABELS[domain] || domain
                    )
                    .join(", ")}`
                : ""}
            </div>
            <button
              disabled={
                !authSession ||
                !appAccessAllowed ||
                approvalFromCache ||
                syncLoading ||
                Boolean(activeSyncAction)
              }
              onClick={() => runAutomaticNormalizedSync("manual")}
            >
              {activeSyncAction === "sync" ? "Syncing..." : "Sync Now"}
            </button>
            <button
              disabled={
                !authSession ||
                !appAccessAllowed ||
                approvalFromCache ||
                syncLoading ||
                Boolean(activeSyncAction)
              }
              onClick={pullLatestNormalizedData}
              style={{ marginLeft: "8px" }}
            >
              {activeSyncAction === "pullLatest" ? "Pulling..." : "Pull Latest"}
            </button>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "6px",
              }}
            >
              Automatic sync runs after startup, resume, workout completion, and
              save checkpoints. Active workouts defer cloud sync until the
              workout is completed or Sync Now is tapped.
            </div>
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: "10px",
              paddingTop: "10px",
            }}
          >
            <h3 style={{ fontSize: "15px", margin: "0 0 8px" }}>
              Nutrition, Body Weight, and Calorie Targets
            </h3>
            <div
              style={{
                color: nutritionSettingsPending > 0
                  ? "var(--danger-text)"
                  : "var(--text-muted)",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              {nutritionSettingsPending} queued nutrition change{
                nutritionSettingsPending === 1 ? "" : "s"
              }
            </div>
            <button
              disabled={
                nutritionSettingsSyncing ||
                !authSession ||
                !appAccessAllowed ||
                approvalFromCache
              }
              onClick={() => runSettingsNutritionSync()}
              type="button"
            >
              {nutritionSettingsSyncing
                ? "Syncing..."
                : "Sync Pending Nutrition Changes"}
            </button>
            <button
              disabled={
                nutritionSettingsSyncing ||
                !authSession ||
                !appAccessAllowed ||
                approvalFromCache
              }
              onClick={() => runSettingsNutritionSync({ pull: true })}
              style={{ marginLeft: "8px" }}
              type="button"
            >
              Pull Nutrition Data
            </button>
            <button
              disabled={
                nutritionSettingsSyncing ||
                !authSession ||
                !appAccessAllowed ||
                approvalFromCache
              }
              onClick={recoverNutritionHistory}
              style={{ marginLeft: "8px" }}
              type="button"
            >
              Recover Nutrition History
            </button>
            <div
              role="status"
              aria-live="polite"
              style={{
                color: nutritionSettingsStatus.includes("failed")
                  ? "var(--danger-text)"
                  : "var(--text-muted)",
                fontSize: "12px",
                marginTop: "6px",
              }}
            >
              {nutritionSettingsStatus ||
                "Edits use the durable queue. Food-log pulls are incremental; body weight and calorie targets are small-domain startup/manual pulls."}
            </div>
          </div>
          {isIraSettingsUser && (
            <>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "10px",
                  paddingTop: "10px",
                }}
              >
                <button
                  aria-expanded={approvalAdminExpanded}
                  onClick={() =>
                    setApprovalAdminExpanded((expanded) => !expanded)
                  }
                  style={{
                    alignItems: "center",
                    background: "transparent",
                    border: "none",
                    color: "var(--text)",
                    display: "flex",
                    font: "inherit",
                    justifyContent: "space-between",
                    padding: 0,
                    width: "100%",
                  }}
                  type="button"
                >
                  <span
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                    }}
                  >
                    {approvalAdminExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: 700,
                      }}
                    >
                      User Approvals
                    </span>
                    {pendingApprovalCount > 0 && (
                      <AlertTriangle
                        aria-label={pendingApprovalMessage}
                        color="#ca8a04"
                        size={16}
                      />
                    )}
                  </span>
                  {pendingApprovalCount > 0 && (
                    <span
                      style={{
                        color: "#7a4f01",
                        fontSize: "12px",
                      }}
                    >
                      {pendingApprovalMessage}
                    </span>
                  )}
                </button>
                {approvalAdminExpanded && (
                  <>
                    <button
                      disabled={approvalAdminLoading}
                      onClick={loadApprovalAdminRows}
                      style={{
                        marginTop: "8px",
                      }}
                      type="button"
                    >
                      {approvalAdminLoading ? "Loading..." : "Refresh Approvals"}
                    </button>
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "12px",
                        marginTop: "6px",
                      }}
                    >
                      {approvalAdminStatus}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        marginTop: "8px",
                        textAlign: "left",
                      }}
                    >
                      {approvalAdminRows.map((row) => (
                        <div
                          key={row.user_id}
                          style={{
                            background: "var(--surface-muted)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            display: "grid",
                            gap: "8px",
                            padding: "8px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px",
                              justifyContent: "space-between",
                            }}
                          >
                            <strong>{row.email || row.user_id}</strong>
                            <span
                              style={{
                                background:
                                  row.status === "approved"
                                    ? "#e8f5e9"
                                    : row.status === "denied"
                                      ? "#ffebee"
                                      : "#fff8e1",
                                border: `1px solid ${
                                  row.status === "approved"
                                    ? "#a5d6a7"
                                    : row.status === "denied"
                                      ? "#ef9a9a"
                                      : "#ffe082"
                                }`,
                                borderRadius: "999px",
                                color:
                                  row.status === "approved"
                                    ? "#1b5e20"
                                    : row.status === "denied"
                                      ? "#b71c1c"
                                      : "#7a4f01",
                                fontSize: "12px",
                                lineHeight: 1.2,
                                padding: "4px 8px",
                                textTransform: "capitalize",
                              }}
                            >
                              {row.status}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "6px",
                            }}
                          >
                            <button
                              disabled={
                                approvalAdminLoading ||
                                row.status === "approved"
                              }
                              onClick={() =>
                                setUserApproval(row.user_id, "approved")
                              }
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              disabled={
                                approvalAdminLoading || row.status === "pending"
                              }
                              onClick={() =>
                                setUserApproval(row.user_id, "pending")
                              }
                              type="button"
                            >
                              Pending
                            </button>
                            <button
                              disabled={
                                approvalAdminLoading || row.status === "denied"
                              }
                              onClick={() =>
                                setUserApproval(row.user_id, "denied")
                              }
                              type="button"
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "10px",
                  paddingTop: "10px",
                }}
              >
                <button
                  aria-expanded={showAdvancedSyncTools}
                  onClick={() => setShowAdvancedSyncTools((visible) => !visible)}
                >
                  {showAdvancedSyncTools ? "Hide" : "Show"} Advanced Migration Tools
                </button>
                {showAdvancedSyncTools && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      justifyContent: "center",
                      marginTop: "10px",
                    }}
                  >
                    <button
                      disabled={
                        !authSession || syncLoading || Boolean(activeSyncAction)
                      }
                      onClick={pullLatestNormalizedData}
                    >
                      {activeSyncAction === "pullLatest"
                        ? "Pulling..."
                        : "Pull Latest"}
                    </button>
                    <button disabled={syncLoading} onClick={repairLocalPlanLinks}>
                      Repair Plan Links
                    </button>
                    <button
                      disabled={!authSession || syncLoading}
                      onClick={checkNormalizedCloudData}
                    >
                      Check Normalized Data
                    </button>
                    <button
                      disabled={!authSession || syncLoading}
                      onClick={resetWorkoutSyncData}
                      style={{
                        background: "var(--danger-bg)",
                        border: "1px solid var(--danger-border)",
                        color: "var(--danger-text)",
                      }}
                    >
                      Reset Workout Sync Data
                    </button>
                  </div>
                )}
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "6px",
                  }}
                >
                  {getCustomExercises(exerciseLibrary).length} custom exercises in
                  your exercise library.
                </div>
              </div>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "10px",
                  paddingTop: "10px",
                }}
              >
                <h3
                  style={{
                    fontSize: "15px",
                    margin: "0 0 6px",
                  }}
                >
                  Persistence Audit
                </h3>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    margin: "0 0 8px",
                  }}
                >
                  Read-only check of local data and normalized Supabase rows.
                </p>
                <button disabled={syncLoading} onClick={runPersistenceAudit}>
                  Check Persistence
                </button>
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "6px",
                  }}
                >
                  {dataAuditStatus}
                </div>
                {dataAuditSummary && (
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      marginTop: "8px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        background: "var(--surface-muted)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                    >
                      <strong>Local IndexedDB / app state</strong>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "4px",
                        }}
                      >
                        {formatAuditLocalSummary(dataAuditSummary.local)}
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "6px",
                        }}
                      >
                        Standalone workout names:{" "}
                        {dataAuditSummary.local.standaloneWorkoutNames.length > 0
                          ? dataAuditSummary.local.standaloneWorkoutNames.join(", ")
                          : "none"}
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "4px",
                        }}
                      >
                        Completed workout names:{" "}
                        {dataAuditSummary.local.historyDetails.length > 0
                          ? dataAuditSummary.local.historyDetails
                            .map(
                              (workout) =>
                                `${workout.templateName} (${formatHistoryTimestamp(
                                  workout
                                )})${
                                  workout.planId ? " [plan]" : ""
                                }`
                            )
                            .join("; ")
                          : "none"}
                      </div>
                      <div
                        style={{
                          color:
                            dataAuditSummary.local.missingPlanWorkouts.length > 0
                              ? "var(--danger-text)"
                              : "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "4px",
                        }}
                      >
                        Broken plan workout links:{" "}
                        {dataAuditSummary.local.missingPlanWorkouts.length > 0
                          ? dataAuditSummary.local.missingPlanWorkouts
                              .map(
                                (workout) =>
                                  `${workout.planName} / ${workout.workoutName} -> ${workout.templateId || "missing template id"}`
                              )
                              .join("; ")
                          : "none"}
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "4px",
                        }}
                      >
                        Template ids:{" "}
                        {dataAuditSummary.local.templateDetails.length > 0
                          ? dataAuditSummary.local.templateDetails
                              .map(
                                (template) =>
                                  `${template.id}: ${template.name}${
                                    template.planId
                                      ? ` [plan ${template.planId}]`
                                      : ""
                                  }${
                                    template.planWorkoutId
                                      ? ` [${template.planWorkoutId}]`
                                      : ""
                                  }`
                              )
                              .join("; ")
                          : "none"}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "var(--surface-muted)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                    >
                      <strong>Normalized Supabase</strong>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "4px",
                        }}
                      >
                        {dataAuditSummary.normalized
                          ? formatAuditNormalizedSummary(dataAuditSummary.normalized)
                          : "Sign in to check normalized cloud rows."}
                      </div>
                      {dataAuditSummary.normalized?.recentSessions && (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                            marginTop: "4px",
                          }}
                        >
                          Recent cloud completed workouts:{" "}
                          {dataAuditSummary.normalized.recentSessions.length > 0
                            ? dataAuditSummary.normalized.recentSessions
                                .map(
                                  (workout) =>
                                    `${workout.workout_name} (${formatHistoryTimestamp(
                                      workout
                                    )})`
                                )
                                .join("; ")
                            : "none"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            margin: "18px auto",
            maxWidth: "520px",
            padding: "10px",
          }}
        >
          <div
            style={{
              alignItems: "start",
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "minmax(0, 1fr) auto",
            }}
          >
            <div>
              <h3
                style={{
                  margin: "0 0 4px",
                }}
              >
                Plate Inventory
              </h3>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                Track available plates by sleeve size. Equipment matching will
                use these categories later.
              </div>
            </div>
            <button onClick={resetPlateInventory} type="button">
              Reset
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            {renderPlateInventoryCategory(
              "oneInch",
              "1 inch plates",
              "For adjustable dumbbells and standard 1 inch equipment."
            )}
            {renderPlateInventoryCategory(
              "twoInch",
              "2 inch plates",
              "For Olympic bars, plate-loaded machines, and 2 inch equipment."
            )}
            {renderEquipmentInventory()}
          </div>
        </section>

        {renderPlateLoadCalculator()}

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            margin: "18px auto",
            maxWidth: "520px",
            padding: "10px",
          }}
        >
          <button
            aria-expanded={exportExpanded}
            onClick={() => setExportExpanded((expanded) => !expanded)}
            style={{
              alignItems: "center",
              background: "transparent",
              border: "none",
              color: "var(--text)",
              display: "flex",
              font: "inherit",
              justifyContent: "space-between",
              padding: 0,
              width: "100%",
            }}
            type="button"
          >
            <span
              style={{
                alignItems: "center",
                display: "inline-flex",
                gap: "6px",
              }}
            >
              {exportExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                }}
              >
                Export
              </span>
            </span>
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
            >
              Exercise history and plans
            </span>
          </button>
          {exportExpanded && (
            <div
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "10px",
                textAlign: "left",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "15px",
                    margin: 0,
                  }}
                >
                  Exercise History
                </h3>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "1fr 1fr",
                }}
              >
                <button
                  aria-pressed={exerciseExportMode === "all"}
                  onClick={() => {
                    setExerciseExportMode("all");
                    setExerciseExportStatus("");
                  }}
                  type="button"
                >
                  All Exercises
                </button>
                <button
                  aria-pressed={exerciseExportMode === "selected"}
                  onClick={() => {
                    setExerciseExportMode("selected");
                    setExerciseExportStatus("");
                  }}
                  type="button"
                >
                  Selected
                </button>
              </div>
              {exerciseExportMode === "selected" && (
                <>
                  <label
                    style={{
                      alignItems: "center",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      display: "flex",
                      gap: "8px",
                      padding: "8px",
                    }}
                  >
                    <Search color="var(--text-muted)" size={16} />
                    <input
                      aria-label="Search exercises to export"
                      onChange={(event) =>
                        setExerciseExportSearch(event.target.value)
                      }
                      placeholder="Search exercises"
                      type="search"
                      value={exerciseExportSearch}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text)",
                        flex: 1,
                        minWidth: 0,
                        outline: "none",
                      }}
                    />
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <button
                      disabled={filteredExerciseHistoryExportOptions.length === 0}
                      onClick={() => {
                        setSelectedExerciseExportKeys((currentKeys) => [
                          ...new Set([
                            ...currentKeys,
                            ...filteredExerciseHistoryExportOptions.map(
                              (exercise) => exercise.key
                            ),
                          ]),
                        ]);
                        setExerciseExportStatus("");
                      }}
                      type="button"
                    >
                      Select Visible
                    </button>
                    <button
                      disabled={selectedExerciseExportKeys.length === 0}
                      onClick={() => {
                        setSelectedExerciseExportKeys([]);
                        setExerciseExportStatus("");
                      }}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      display: "grid",
                      gap: "6px",
                      maxHeight: "260px",
                      overflowY: "auto",
                      padding: "8px",
                    }}
                  >
                    {filteredExerciseHistoryExportOptions.length > 0 ? (
                      filteredExerciseHistoryExportOptions.map((exercise) => (
                        <label
                          key={exercise.key}
                          style={{
                            alignItems: "center",
                            display: "grid",
                            gap: "8px",
                            gridTemplateColumns: "auto minmax(0, 1fr)",
                          }}
                        >
                          <input
                            checked={selectedExerciseExportKeys.includes(
                              exercise.key
                            )}
                            onChange={() =>
                              toggleExerciseExportSelection(exercise.key)
                            }
                            type="checkbox"
                          />
                          <span
                            style={{
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                fontWeight: 700,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {exercise.name}
                            </span>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                display: "block",
                                fontSize: "12px",
                              }}
                            >
                              {exercise.equipment || "No equipment"} ·{" "}
                              {exercise.workoutCount} workouts ·{" "}
                              {exercise.setCount} sets
                            </span>
                          </span>
                        </label>
                      ))
                    ) : (
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          textAlign: "center",
                        }}
                      >
                        No exercises match the search.
                      </div>
                    )}
                  </div>
                </>
              )}
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {exportSelectionCount} exercise
                {exportSelectionCount === 1 ? "" : "s"} selected for export.
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <button onClick={downloadExerciseHistoryExport} type="button">
                  <Download size={14} />
                  Download CSV
                </button>
                <button onClick={copyExerciseHistoryExport} type="button">
                  <Copy size={14} />
                  Copy CSV
                </button>
              </div>
              {exerciseExportStatus && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {exerciseExportStatus}
                </div>
              )}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "4px",
                  paddingTop: "12px",
                }}
              >
                <h3
                  style={{
                    fontSize: "15px",
                    margin: "0 0 8px",
                  }}
                >
                  Plans
                </h3>
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <button
                    aria-pressed={planExportMode === "active"}
                    onClick={() => {
                      setPlanExportMode("active");
                      setPlanExportStatus("");
                    }}
                    type="button"
                  >
                    Active Plan
                  </button>
                  <button
                    aria-pressed={planExportMode === "selected"}
                    onClick={() => {
                      setPlanExportMode("selected");
                      setPlanExportStatus("");
                    }}
                    type="button"
                  >
                    Selected Plans
                  </button>
                </div>
                {planExportMode === "selected" && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginTop: "8px",
                      }}
                    >
                      <button
                        disabled={planExportOptions.length === 0}
                        onClick={() => {
                          setSelectedPlanExportIds(
                            planExportOptions.map((plan) => plan.id)
                          );
                          setPlanExportStatus("");
                        }}
                        type="button"
                      >
                        Select All
                      </button>
                      <button
                        disabled={selectedPlanExportIds.length === 0}
                        onClick={() => {
                          setSelectedPlanExportIds([]);
                          setPlanExportStatus("");
                        }}
                        type="button"
                      >
                        Clear
                      </button>
                    </div>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        display: "grid",
                        gap: "6px",
                        marginTop: "8px",
                        maxHeight: "220px",
                        overflowY: "auto",
                        padding: "8px",
                      }}
                    >
                      {planExportOptions.length > 0 ? (
                        planExportOptions.map((plan) => (
                          <label
                            key={plan.id}
                            style={{
                              alignItems: "center",
                              display: "grid",
                              gap: "8px",
                              gridTemplateColumns: "auto minmax(0, 1fr)",
                            }}
                          >
                            <input
                              checked={selectedPlanExportIds.includes(plan.id)}
                              onChange={() =>
                                togglePlanExportSelection(plan.id)
                              }
                              type="checkbox"
                            />
                            <span
                              style={{
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  fontWeight: 700,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {plan.name}
                              </span>
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  display: "block",
                                  fontSize: "12px",
                                }}
                              >
                                {plan.status || "No status"} · {plan.totalWeeks}{" "}
                                weeks · {plan.workoutsPerWeek} workouts/week
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                            textAlign: "center",
                          }}
                        >
                          No plans available.
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "8px",
                  }}
                >
                  {planExportSelectionCount} plan
                  {planExportSelectionCount === 1 ? "" : "s"} selected for
                  export.
                </div>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  Supported JSON exports one plan at a time and can be loaded
                  through AI Plan Draft.
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "8px",
                  }}
                >
                  <button onClick={downloadPlanExport} type="button">
                    <Download size={14} />
                    Download CSV
                  </button>
                  <button onClick={copyPlanExport} type="button">
                    <Copy size={14} />
                    Copy CSV
                  </button>
                  <button onClick={downloadSupportedPlanJson} type="button">
                    <Download size={14} />
                    Download JSON
                  </button>
                  <button onClick={copySupportedPlanJson} type="button">
                    <Copy size={14} />
                    Copy JSON
                  </button>
                </div>
                {planExportStatus && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "8px",
                    }}
                  >
                    {planExportStatus}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <WeightPickerModal
          isOpen={Boolean(plateCountPicker)}
          onClose={() => setPlateCountPicker(null)}
          title={
            plateCountPicker
              ? `${plateCountPicker.weight} lb plate count`
              : "Plate count"
          }
          value={plateCountPicker?.count}
          values={PLATE_COUNT_PICKER_VALUES}
          onSelect={(value) => {
            if (!plateCountPicker) {
              return;
            }

            setPlateCount(
              plateCountPicker.categoryKey,
              plateCountPicker.plateId,
              value
            );
          }}
          zIndex={2400}
        />
        <WeightPickerModal
          isOpen={Boolean(equipmentWeightPicker)}
          onClose={() => setEquipmentWeightPicker(null)}
          title={
            equipmentWeightPicker
              ? `${equipmentWeightPicker.label} weight`
              : "Equipment weight"
          }
          value={equipmentWeightPicker?.weight}
          values={EQUIPMENT_WEIGHT_PICKER_VALUES}
          onSelect={(value) => {
            if (!equipmentWeightPicker) {
              return;
            }

            setEquipmentWeight(equipmentWeightPicker.equipmentId, value);
          }}
          zIndex={2400}
        />
      </div>
    );
  }

  function renderAccessGate() {
    if (!authInitialized) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "20px",
          }}
        >
          <div
            aria-live="polite"
            role="status"
            style={{
              margin: "0 auto",
              maxWidth: "460px",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: "0 0 8px" }}>Restoring your session…</h2>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                margin: 0,
              }}
            >
              Checking your saved sign-in securely.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "20px",
        }}
      >
        <div
          style={{
            margin: "0 auto",
            maxWidth: "460px",
          }}
        >
          <h2
            style={{
              margin: "0 0 8px",
            }}
          >
            Account Required
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "13px",
              margin: "0 0 12px",
            }}
          >
            Sign in with an approved account to use the app. New accounts remain
            pending until approved.
          </p>
          {authSession && !appAccessAllowed && (
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              <div
                role="status"
                aria-live="polite"
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color:
                    approvalStatus?.status === "denied"
                      ? "var(--danger-text)"
                      : "var(--text-muted)",
                  fontSize: "13px",
                  padding: "10px",
                }}
              >
                Signed in as {authSession.user.email}
                <br />
                Approval status:{" "}
                {approvalLoading
                  ? "checking..."
                  : approvalStatus?.status || "not verified"}
                {approvalError ? ` (${approvalError})` : ""}
              </div>
              <button
                disabled={authLoading}
                onClick={handleSignOut}
                type="button"
              >
                Sign Out
              </button>
            </div>
          )}
          {!authSession && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                signInWithEmailPassword();
              }}
              style={{
                alignItems: "center",
                display: "grid",
                gap: "6px",
                gridTemplateColumns: "1fr auto",
              }}
            >
              <input
                autoCapitalize="none"
                autoComplete="username"
                id="access-auth-email"
                inputMode="email"
                name="username"
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
                autoComplete="current-password"
                id="access-auth-password"
                name="password"
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
                type="submit"
              >
                Sign In
              </button>
              <button
                disabled={!isSupabaseConfigured || authLoading}
                onClick={createAccountWithEmailPassword}
                style={{
                  gridColumn: "1 / -1",
                }}
                type="button"
              >
                Create Account
              </button>
              <img
                alt=""
                src={HOME_WORKOUT_ICON}
                style={{
                  borderRadius: "18px",
                  gridColumn: "1 / -1",
                  justifySelf: "center",
                  marginTop: "18px",
                  maxWidth: "240px",
                  width: "58%",
                }}
              />
              <div
                role="status"
                aria-live="polite"
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  gridColumn: "1 / -1",
                  marginTop: "6px",
                }}
              >
                {authStatus}
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!appAccessAllowed) {
    return renderAccessGate();
  }

  if (showSettings) {
    return renderAppShell(renderSettings(), "settings");
  }

  if (showExercises) {
    return renderAppShell(
      <ExerciseView
        bodyWeightEntries={localBodyWeightEntries}
        exerciseLibrary={exerciseLibrary}
        history={history}
        onUpdateHistoryWorkoutSet={updateHistoryWorkoutSet}
        session={authSession}
        setExerciseLibrary={(nextExerciseLibrary) => {
          setExerciseLibrary(nextExerciseLibrary);
          requestSyncCheckpoint(["exercisePreferences"], "exercise preferences");
        }}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
      />,
      "exercises"
    );
  }

  if (showPlans) {
    if (!planEditorOpen) {
      const activePlans = plans.filter((plan) => plan.status === "active");
      const pastPlans = plans
        .filter((plan) => plan.status === "completed")
        .sort((left, right) =>
          (right.createdAt || "").localeCompare(left.createdAt || "")
        );
      const inactivePlans = plans
        .filter(
          (plan) => plan.status !== "active" && plan.status !== "completed"
        )
        .sort((left, right) =>
          (right.createdAt || "").localeCompare(left.createdAt || "")
        );

      return renderAppShell(
        <div className="plans-library-view" style={{ padding: "20px" }}>
          <AppPageHeader
            icon={
              <PlansBrainIcon
                color="var(--accent)"
                emphasized
                monochrome
                size={36}
              />
            }
            subtitle="Create, manage, and reuse your training programs"
            title="Plans"
          />

          <button
            className="app-primary-action"
            onClick={() => {
              setEditingPlanId(null);
              setPlanEditorOpen(true);
            }}
            style={{
              justifyContent: "center",
              margin: "14px 0 12px",
              whiteSpace: "nowrap",
              width: "100%",
            }}
            type="button"
          >
            <Plus size={17} />
            New Plan
          </button>

          {plans.length >= 2 ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                margin: "-4px 0 12px",
              }}
            >
              <button
                onClick={openPlanComparison}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
                type="button"
              >
                <BarChart3 size={16} />
                Compare plans
              </button>
            </div>
          ) : null}

          {plans.length === 0 ? (
            <AppSectionCard tone="accent">
              <AppSectionHeading
                eyebrow="Plan library"
                subtitle="Build a structured program, then return here to edit or reuse it."
                title="Create your first plan"
              />
              <button
                className="app-primary-action"
                onClick={() => setPlanEditorOpen(true)}
                style={{ whiteSpace: "nowrap" }}
                type="button"
              >
                <Plus size={17} />
                New Plan
              </button>
            </AppSectionCard>
          ) : (
            <>
              <AppSectionCard tone="accent">
                <AppSectionHeading
                  eyebrow="Current program"
                  subtitle="Your next workout remains available from Home."
                  title="Active"
                />
                {activePlans.length > 0 ? (
                  activePlans.map(renderPlanCard)
                ) : (
                  <div className="home-today-card__empty">
                    No plan is active. Activate a saved plan below whenever you
                    are ready.
                  </div>
                )}
              </AppSectionCard>

              <AppSectionCard>
                <AppSectionHeading
                  eyebrow="Build and revise"
                  subtitle="Inactive plans remain available to edit, activate, duplicate, or remove."
                  title="Drafts & inactive"
                />
                {inactivePlans.length > 0 ? (
                  inactivePlans.map(renderPlanCard)
                ) : (
                  <div className="home-today-card__empty">
                    No draft or inactive plans.
                  </div>
                )}
              </AppSectionCard>

              <AppSectionCard>
                <AppSectionHeading
                  eyebrow="Reference and reuse"
                  subtitle="Review completed programs, duplicate them, or compare their structure."
                  title="Past plans"
                />
                {pastPlans.length > 0 ? (
                  pastPlans.map(renderPlanCard)
                ) : (
                  <div className="home-today-card__empty">
                    Completed plans will remain available here.
                  </div>
                )}
              </AppSectionCard>
            </>
          )}

          {renderCompletedPlanActions()}
          {renderExtendPlanPicker()}
          {renderWeekPicker()}
        </div>,
        "plans"
      );
    }

    return renderAppShell(
      <PlansView
        bodyWeightEntries={localBodyWeightEntries}
        editingPlan={editingPlan}
        exerciseLibrary={exerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        history={history}
        onBuildAiPlanDraft={buildAiPlanDraftFromText}
        onCancel={() => {
          setEditingPlanId(null);
          setPlanEditorOpen(false);
        }}
        onCopyAiPlanPrompt={copyAiPlanPrompt}
        onCopyAiPlanContext={copyAiPlanContext}
        onDownloadAiPlanContext={downloadAiPlanContext}
        onDownloadAiPlanPrompt={downloadAiPlanPrompt}
        onOpenChatGptForAiPlan={openChatGptForAiPlan}
        onShareAiPlanContext={shareAiPlanContext}
        onSave={(result) => {
          setEditingPlanId(null);
          setPlanEditorOpen(false);
          if (result?.type === "trainer-plan" || result?.type === "trainer-workout") {
            return;
          }

          requestSyncCheckpoint(
            result?.type === "workout" ? ["workouts"] : ["plans", "workouts"],
            result?.type === "workout"
              ? "workout save"
              : result?.type === "plan-update"
                ? "plan update"
                : "plan save"
          );
        }}
        onShowAiPlanNotes={setAiPlanNotesTarget}
        plans={plans}
        setPlans={setPlans}
        setTemplates={setTemplates}
        templates={templates}
      />,
      "plans"
    );
  }

  if (showNutrition) {
    return renderAppShell(<NutritionView session={authSession} />, "nutrition");
  }

  if (selectedHistoryList) {
    return renderAppShell(
      <div
        style={{
          padding: "20px",
        }}
      >
        <h2>History</h2>

        <div
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          {selectedHistoryList.map((workout) => (
            <div
              key={workout.id}
              style={{
                alignItems: "center",
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-h)",
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              }}
            >
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-h)",
                  display: "block",
                  font: "inherit",
                  fontSize: "13px",
                  minWidth: 0,
                  padding: "8px",
                  textAlign: "left",
                  width: "100%",
                }}
                onClick={() => setSelectedHistory(workout)}
                type="button"
              >
                {workout.templateName || workout.workout_name || "Workout"}
                {` (${formatHistoryTimestamp(workout)})`}
              </button>
              <button
                aria-label={`Delete ${
                  workout.templateName || workout.workout_name || "workout"
                } history entry`}
                onClick={() => setConfirmDeleteHistory(workout)}
                style={{
                  alignItems: "center",
                  color: "var(--danger-text)",
                  display: "inline-flex",
                  justifyContent: "center",
                  marginRight: "6px",
                  minHeight: "34px",
                  minWidth: "34px",
                  padding: "5px",
                }}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        {selectedHistory && (
          <CompletedWorkoutSheet
            bodyWeightEntries={localBodyWeightEntries}
            exerciseLibrary={exerciseLibrary}
            history={history}
            onClose={() => setSelectedHistory(null)}
            onDelete={deleteHistoryWorkout}
            onUpdateSet={updateHistoryWorkoutSet}
            workout={selectedHistory}
          />
        )}
        {confirmDeleteHistory && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete workout history entry"
            style={{
              alignItems: "center",
              background: "rgba(0,0,0,.5)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              padding: "20px",
              position: "fixed",
              zIndex: 2300,
            }}
          >
            <div
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--danger-text)",
                borderRadius: "12px",
                boxShadow: "0 18px 42px rgba(0,0,0,.28)",
                maxWidth: "360px",
                padding: "18px",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-text)",
                  borderRadius: "10px",
                  color: "var(--danger-text)",
                  display: "flex",
                  fontWeight: "bold",
                  gap: "8px",
                  marginBottom: "12px",
                  padding: "10px",
                }}
              >
                <Trash2 size={18} />
                Delete workout history?
              </div>
              <div
                style={{
                  color: "var(--text)",
                  fontSize: "14px",
                  marginBottom: "16px",
                }}
              >
                Delete{" "}
                <strong>
                  {confirmDeleteHistory.templateName ||
                    confirmDeleteHistory.workout_name ||
                    "Workout"}
                </strong>{" "}
                from {formatHistoryTimestamp(confirmDeleteHistory)}?
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "1fr 1fr",
                }}
              >
                <button onClick={() => setConfirmDeleteHistory(null)} type="button">
                  Cancel
                </button>
                <button
                  onClick={() => deleteHistoryWorkout(confirmDeleteHistory)}
                  style={{
                    background: "var(--danger-bg)",
                    border: "1px solid var(--danger-text)",
                    color: "var(--danger-text)",
                    fontWeight: "bold",
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>,
      "home"
    );
  }

  if (selectedSession) {
    return (
      <SessionView
        authSession={authSession}
        canEditBuiltInExercises={isIraSettingsUser}
        session={selectedSession}
        sessions={sessions}
        setSessions={setSessions}
        history={history}
        setHistory={setHistory}
        plans={plans}
        setPlans={setPlans}
        templates={templates}
        setTemplates={setTemplates}
        exerciseLibrary={exerciseLibrary}
        setExerciseLibrary={(nextExerciseLibrary) => {
          setExerciseLibrary(nextExerciseLibrary);
          requestSyncCheckpoint(["exercisePreferences"], "exercise preferences");
        }}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        setSelectedSessionId={setSelectedSessionId}
        setSelectedTemplateId={setSelectedTemplateId}
        plateInventory={plateInventory}
        bodyWeightEntries={localBodyWeightEntries}
        onEditModeChange={setTemplatePreviewEditActive}
        onWorkoutCompleted={(completedWorkout) => {
          setSelectedHistory(completedWorkout);
          setSelectedHistoryList(null);
        }}
        onWorkoutDataCommitted={commitCompletedWorkoutData}
        onPlanCompletionNeeded={setPlanCompletionPrompt}
      />
    );
  }

  if (selectedTemplate) {
    return renderAppShell(
      <TemplateView
        autoStart={String(autoStartTemplateId) === String(selectedTemplate.id)}
        bodyWeightEntries={localBodyWeightEntries}
        canEditBuiltInExercises={isIraSettingsUser}
        template={selectedTemplate}
        templates={templates}
        setTemplates={(nextTemplates) => {
          setTemplates(nextTemplates);
          requestSyncCheckpoint(["workouts"], "workout save");
        }}
        exerciseLibrary={exerciseLibrary}
        setSelectedSessionId={setSelectedSessionId}
        sessions={sessions}
        setSessions={setSessions}
        setExerciseLibrary={(nextExerciseLibrary) => {
          setExerciseLibrary(nextExerciseLibrary);
          requestSyncCheckpoint(["exercisePreferences"], "exercise preferences");
        }}
        session={authSession}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        history={history}
        onAutoStartHandled={() => setAutoStartTemplateId(null)}
        plans={plans}
        setPlans={(nextPlans) => {
          setPlans(nextPlans);
          requestSyncCheckpoint(["plans"], "plan prescription save");
        }}
        planWeekOverride={selectedTemplatePlanWeek}
      />,
      "home"
    );
  }

  const planTemplateIds = getPlanTemplateIdSet(plans);
  const standaloneTemplates = [...templates]
    .filter(
      (template) => !template.planId && !planTemplateIds.has(String(template.id))
    )
    .sort((a, b) => {
      if (templateSort === "alpha") {
        return a.name.localeCompare(b.name);
      }

      return new Date(b.lastCompleted || 0) - new Date(a.lastCompleted || 0);
    });
  const activeHomePlan = plans.find((plan) => plan.status === "active") || null;
  const activeHomeWeekStatus = activeHomePlan
    ? getPlanWeekStatus(
        activeHomePlan,
        activeHomePlan.currentWeek || 1,
        history
      )
    : null;
  const nextPlanWorkout = activeHomePlan
    ? (activeHomePlan.workouts || []).find(
        (planWorkout) =>
          !isPlanWorkoutComplete(
            activeHomePlan,
            planWorkout.planWorkoutId,
            activeHomeWeekStatus.currentWeek,
            history
          ) &&
          templates.some(
            (template) =>
              String(template.id) === String(planWorkout.templateId)
          )
      ) || null
    : null;
  const nextWorkoutTemplate = nextPlanWorkout
    ? templates.find(
        (template) => String(template.id) === String(nextPlanWorkout.templateId)
      ) || null
    : null;
  const latestCompletedWorkout = [...history].sort(
    (left, right) => getHistoryWorkoutTime(right) - getHistoryWorkoutTime(left)
  )[0] || null;

  return renderAppShell(
    <>
      <div
        className="home-view"
        style={{
          padding: "20px",
        }}
      >
      <AppPageHeader
        action={renderAuthSyncIndicator({ inHeader: true })}
        icon={
          <img
            alt=""
            src={HOME_WORKOUT_ICON}
            style={{ height: "100%", width: "100%" }}
          />
        }
        subtitle="Training overview"
        title="Home"
      />

      <AppSectionCard className="home-today-card" tone="accent">
        <AppSectionHeading
          action={
            activeHomePlan ? (
              <AppStatusPill tone="accent">Active plan</AppStatusPill>
            ) : null
          }
          eyebrow="Next up"
          subtitle={
            activeHomePlan && activeHomeWeekStatus
              ? `${activeHomePlan.name} · ${getPlanWeekLabel(
                  activeHomePlan,
                  activeHomeWeekStatus.currentWeek
                )} · ${activeHomeWeekStatus.completedThisWeek} of ${
                  activeHomeWeekStatus.totalThisWeek
                } complete`
              : "Choose a workout whenever you are ready to train."
          }
          title={
            nextWorkoutTemplate?.name ||
            (activeHomePlan ? "This week is complete" : "Ready to train?")
          }
        />

        <div className="home-today-card__details">
          <div className="home-today-card__next">
            {nextPlanWorkout ? (
              <div className="home-today-card__metadata">
                Next in plan · Day {nextPlanWorkout.dayNumber}
              </div>
            ) : activeHomePlan ? (
              <div className="home-today-card__metadata">
                Review the plan in Plans or select another workout below.
              </div>
            ) : (
              <div className="home-today-card__metadata">
                Start a saved workout or create a training plan.
              </div>
            )}

            <div
              className={`home-today-card__actions${
                nextWorkoutTemplate && nextPlanWorkout
                  ? " home-today-card__actions--with-plan-links"
                  : ""
              }`}
            >
              <button
                className="app-primary-action home-today-card__primary"
                onClick={() => {
                  if (nextWorkoutTemplate && nextPlanWorkout) {
                    setSelectedTemplatePlanWeek(activeHomeWeekStatus.currentWeek);
                    setAutoStartTemplateId(nextWorkoutTemplate.id);
                    setSelectedTemplateId(nextWorkoutTemplate.id);
                    return;
                  }

                  if (activeHomePlan) {
                    openActivePlanInPlans(activeHomePlan);
                    return;
                  }

                  setWorkoutsExpanded(true);
                }}
                type="button"
              >
                <Play size={18} />
                {nextWorkoutTemplate
                  ? "Start Workout"
                  : activeHomePlan
                    ? "Review Plan"
                    : "Choose Workout"}
              </button>

              {nextWorkoutTemplate && nextPlanWorkout ? (
                <>
                  <button
                    className="home-today-card__preview"
                    onClick={() => {
                      setSelectedTemplatePlanWeek(activeHomeWeekStatus.currentWeek);
                      setAutoStartTemplateId(null);
                      setSelectedTemplateId(nextWorkoutTemplate.id);
                    }}
                    type="button"
                  >
                    <Eye size={16} />
                    <span>Preview Workout</span>
                  </button>
                  <button
                    className="home-today-card__preview"
                    onClick={() => openActivePlanInPlans(activeHomePlan)}
                    type="button"
                  >
                    <ClipboardList size={16} />
                    <span>View Plan</span>
                  </button>
                </>
              ) : !activeHomePlan ? (
                <button
                  className="home-today-card__preview"
                  onClick={openNewPlanBuilder}
                  type="button"
                >
                  <Plus size={16} />
                  <span>Create Plan</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="home-today-card__recent">
            <div className="home-today-card__recent-label">Most recent</div>
            {latestCompletedWorkout ? (
              <button
                className="home-today-card__recent-button"
                onClick={() => setSelectedHistory(latestCompletedWorkout)}
                type="button"
              >
                <span className="home-today-card__recent-name">
                  {getWorkoutName(latestCompletedWorkout)}
                </span>
                <span className="home-today-card__recent-date">
                  {formatHistoryTimestamp(latestCompletedWorkout)}
                </span>
                <span className="home-today-card__recent-link">
                  Review workout <ChevronRight size={14} />
                </span>
              </button>
            ) : (
              <div className="home-today-card__empty">
                Your latest completed workout will appear here.
              </div>
            )}
          </div>
        </div>
      </AppSectionCard>

      <div className="home-section-label">
        <span>Calendar</span>
        <span>Tap to expand</span>
      </div>

      <WorkoutCalendar
        bodyWeightEntries={localBodyWeightEntries}
        exerciseLibrary={exerciseLibrary}
        history={history}
        nutritionEntries={calendarNutritionEntries}
        onDeleteWorkout={deleteHistoryWorkout}
        onUpdateWorkoutSet={updateHistoryWorkoutSet}
        session={authSession}
      />

      <button
        aria-expanded={workoutsExpanded}
        onClick={() => setWorkoutsExpanded((expanded) => !expanded)}
        style={{
          alignItems: "center",
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          color: "var(--text-h)",
          display: "grid",
          font: "inherit",
          gridTemplateColumns: "44px minmax(0, 1fr) 44px",
          margin: "8px 0 12px",
          minHeight: "60px",
          padding: "7px",
          width: "100%",
        }}
      >
        <span
          style={{
            alignItems: "center",
            display: "inline-flex",
            justifyContent: "center",
          }}
        >
          {workoutsExpanded ? (
            <ChevronDown size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
        </span>
        <span
          style={{
            display: "grid",
            fontSize: "17px",
            fontWeight: "bold",
            lineHeight: 1.2,
            textAlign: "left",
          }}
        >
          Workouts
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "11px",
              fontWeight: "normal",
            }}
          >
            {standaloneTemplates.length} saved standalone{" "}
            {standaloneTemplates.length === 1 ? "workout" : "workouts"}
          </span>
        </span>
        <span />
      </button>

      {workoutsExpanded && (
        <>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "10px",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <button
              className="app-secondary-action"
              onClick={addTemplate}
              style={{
                minHeight: "44px",
              }}
            >
              <Plus size={16} /> New Workout
            </button>

            <select
              value={templateSort}
              onChange={(e) => setTemplateSort(e.target.value)}
              style={{
                minHeight: "44px",
                padding: "8px 10px",
              }}
            >
              <option value="recent">Recent</option>

              <option value="alpha">A → Z</option>
            </select>
          </div>

          {standaloneTemplates.length === 0 && (
            <div
              style={{
                background: "var(--surface-muted)",
                border: "1px dashed var(--border)",
                borderRadius: "12px",
                color: "var(--text-muted)",
                fontSize: "13px",
                lineHeight: 1.45,
                marginBottom: "10px",
                padding: "16px",
                textAlign: "center",
              }}
            >
              No standalone workouts yet. Create one when you want a workout
              outside your active plan.
            </div>
          )}

          {standaloneTemplates.map((template) => (
            <div
              key={template.id}
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: "14px",
                boxShadow: "0 6px 18px rgba(0,0,0,.045)",
                display: "grid",
                gap: "10px",
                marginBottom: "10px",
                padding: "12px",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                }}
              >
                <button
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text)",
                    cursor: "pointer",
                    minHeight: "44px",
                    minWidth: 0,
                    padding: 0,
                    textAlign: "left",
                    width: "100%",
                  }}
                  onClick={() => {
                    setSelectedTemplatePlanWeek(null);
                    setSelectedTemplateId(template.id);
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {template.name}
                  </strong>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      display: "block",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    {template.lastCompleted
                      ? `Last completed ${new Date(
                          template.lastCompleted
                        ).toLocaleDateString([], {
                          month: "numeric",
                          day: "numeric",
                          year: "2-digit",
                        })}`
                      : "Never completed"}
                  </span>
                </button>

              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: "6px",
                  position: "relative",
                }}
              >
                <button
                  aria-expanded={
                    String(workoutMenuTemplateId) === String(template.id)
                  }
                  aria-label={`More actions for ${template.name}`}
                  onClick={() => {
                    setWorkoutMenuTemplateId((current) =>
                      String(current) === String(template.id) ? null : template.id
                    );
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "44px",
                    minWidth: "44px",
                    padding: "5px",
                  }}
                >
                  <MoreHorizontal size={18} />
                </button>{" "}
                <button
                  aria-label={`${template.name} history`}
                  onClick={() => {
                    const matches = history.filter(
                      (h) => String(h.templateId) === String(template.id)
                    );

                    if (matches.length) {
                      setSelectedHistoryList(matches);
                    }
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "44px",
                    minWidth: "44px",
                    padding: "5px",
                  }}
                >
                  <History size={16} />
                </button>
                {String(workoutMenuTemplateId) === String(template.id) && (
                  <>
                    <div
                      aria-hidden="true"
                      onClick={() => setWorkoutMenuTemplateId(null)}
                      style={{
                        background: "transparent",
                        inset: 0,
                        position: "fixed",
                        zIndex: 39,
                      }}
                    />
                    <div
                      style={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        boxShadow: "0 12px 32px rgba(0,0,0,.2)",
                        display: "grid",
                        gap: "4px",
                        minWidth: "150px",
                        padding: "6px",
                        position: "absolute",
                        right: 0,
                        top: "48px",
                        zIndex: 40,
                      }}
                    >
                    <button
                      onClick={() => {
                        const copy = {
                          ...template,
                          id: getCurrentTimeMs(),
                          name: template.name + " copy",
                          lastCompleted: null,
                        };

                        setTemplates([...templates, copy]);
                        setWorkoutMenuTemplateId(null);
                        requestSyncCheckpoint(["workouts"], "workout save");
                      }}
                      style={{
                        alignItems: "center",
                        display: "flex",
                        gap: "8px",
                        minHeight: "44px",
                        padding: "8px 10px",
                        textAlign: "left",
                      }}
                      type="button"
                    >
                      <Copy size={16} /> Duplicate
                    </button>
                    <button
                      onClick={() => {
                        setWorkoutMenuTemplateId(null);
                        setConfirmDeleteTemplate(template);
                      }}
                      style={{
                        alignItems: "center",
                        color: "var(--danger-text)",
                        display: "flex",
                        gap: "8px",
                        minHeight: "44px",
                        padding: "8px 10px",
                        textAlign: "left",
                      }}
                      type="button"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                    </div>
                  </>
                )}
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
                      {getTemplateHistoryCount(confirmDeleteTemplate.id) > 0
                        ? `${getTemplateHistoryCount(
                            confirmDeleteTemplate.id
                          )} completed history ${
                            getTemplateHistoryCount(confirmDeleteTemplate.id) ===
                            1
                              ? "entry is"
                              : "entries are"
                          } tied to this template.`
                        : "No completed history is tied to this template."}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        gridTemplateColumns: "1fr 1fr",
                      }}
                    >
                      <button onClick={() => setConfirmDeleteTemplate(null)}>
                        ✖️
                      </button>

                      <button
                        onClick={() =>
                          deleteStandaloneTemplate(confirmDeleteTemplate)
                        }
                      >
                        Template only
                      </button>
                      <button
                        onClick={() =>
                          deleteStandaloneTemplate(confirmDeleteTemplate, {
                            includeHistory: true,
                          })
                        }
                        style={{
                          gridColumn: "1 / -1",
                        }}
                      >
                        Template + history
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          ))}
        </>
      )}
      </div>
      {selectedHistory && (
        <CompletedWorkoutSheet
          bodyWeightEntries={localBodyWeightEntries}
          exerciseLibrary={exerciseLibrary}
          history={history}
          onClose={() => setSelectedHistory(null)}
          onDelete={deleteHistoryWorkout}
          onUpdateSet={updateHistoryWorkoutSet}
          workout={selectedHistory}
        />
      )}
    </>,
    "home"
  );
}
