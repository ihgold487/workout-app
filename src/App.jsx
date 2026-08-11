/* global __BUILD_TIME__ */
import { useState, useEffect, useRef, useDeferredValue } from "react";
import {
  AlertTriangle,
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
  History,
  Home,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Share2,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { seedExercises } from "./data/seedExercises";
import { getRirForPlanWeek } from "./utils/rirPeriodization";
import TemplateView from "./components/TemplateView";
import SessionView from "./components/SessionView";
import ExerciseView from "./components/ExerciseView";
import PlansView from "./components/PlansView";
import NutritionView from "./components/NutritionView";
import WeightPickerModal from "./components/WeightPickerModal";
import WorkoutCalendar, { CompletedWorkoutSheet } from "./components/WorkoutCalendar";
import {
  clearLegacyEquipmentStorage,
  getSavedStorageVersion,
  loadWorkoutData,
  loadWorkoutDataFromIndexedDb,
  markStorageVersion,
  saveWorkoutData,
  saveWorkoutDataToIndexedDb,
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
import { buildCoachBrief } from "./utils/coachBrief";
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
  downloadNutritionEntries,
  filterPendingDeletedNutritionEntries,
  retryPendingNutritionDeletes,
  uploadNutritionEntries,
} from "./sync/nutritionCloudSync";
import { getNormalizedCloudSummary } from "./sync/normalizedCloudSummary";

// STORAGE VERSION
const STORAGE_VERSION = 12;

const APP_VERSION = "0.16";

const BUILD_TIME = __BUILD_TIME__;

const PENDING_UPDATE_KEY = "pendingPwaUpdate";
const LAST_SEEN_BUILD_KEY = "lastSeenBuildTime";
const UPDATE_CONFIRMATION_KEY = "pwaUpdateConfirmation";
const UPDATE_CONFIRMATION_DURATION = 10 * 60 * 1000;
const LAST_AUTO_UPDATE_CHECK_KEY = "lastAutoPwaUpdateCheck";
const AUTO_UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;

const STARTUP_SPLASH_MINIMUM_MS = 1000;
const ACTIVE_WORKOUT_STARTUP_SPLASH_MINIMUM_MS = 150;
const AUTO_SYNC_RESUME_INTERVAL = 60 * 60 * 1000;
const AUTO_SYNC_CHECKPOINT_DELAY_MS = 350;
const AUTO_SYNC_SUPPRESS_MS = 4000;
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
const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";

function getNutritionLogStorageKey(userId) {
  return userId ? `${NUTRITION_LOG_KEY}:${userId}` : NUTRITION_LOG_KEY;
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
  localStorage.setItem(key, JSON.stringify(entries));
}

function getNutritionEntryTimestamp(entry) {
  const updatedTime = Date.parse(entry?.updatedAt || "");
  const createdTime = Date.parse(entry?.createdAt || "");

  if (Number.isFinite(updatedTime)) {
    return updatedTime;
  }

  if (Number.isFinite(createdTime)) {
    return createdTime;
  }

  return 0;
}

function mergeNutritionEntries(localEntries, cloudEntries) {
  const entriesById = new Map();

  [...(localEntries || []), ...(cloudEntries || [])].forEach((entry) => {
    if (!entry?.id) {
      return;
    }

    const entryKey = String(entry.id);
    const existingEntry = entriesById.get(entryKey);

    if (
      !existingEntry ||
      getNutritionEntryTimestamp(entry) >= getNutritionEntryTimestamp(existingEntry)
    ) {
      entriesById.set(entryKey, entry);
    }
  });

  return [...entriesById.values()].sort((a, b) => {
    const dateComparison = String(a.date || "").localeCompare(String(b.date || ""));

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return String(a.id).localeCompare(String(b.id), undefined, {
      numeric: true,
    });
  });
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

        if (selectedKeySet && !selectedKeySet.has(exerciseKey)) {
          return;
        }

        (historyExercise.sets || []).forEach((set, setIndex) => {
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
  const trainingWeeks = Math.max(durationWeeks, maxPrescriptionWeek, 1);

  return plan?.config?.deload ? trainingWeeks + 1 : trainingWeeks;
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

            if (exercises.length === 0) {
              rows.push({
                plan_id: plan.id,
                plan_name: plan.name || "",
                plan_status: plan.status || "",
                plan_type: plan.planType || plan.config?.planType || "",
                plan_goal: plan.goal || plan.config?.goal || "",
                total_weeks: totalWeeks,
                workouts_per_week: workouts.length || plan.daysPerWeek || "",
                current_week: plan.currentWeek || "",
                week_number: weekNumber,
                is_deload_week: weekNumber > Number(plan.durationWeeks || totalWeeks),
                workout_day: planWorkout.dayNumber || workoutIndex + 1,
                plan_workout_id: planWorkout.planWorkoutId || "",
                workout_name: workoutName,
                workout_type: planWorkout.workoutType || template?.workoutType || "",
                exercise_position: "",
                exercise_name: "",
                exercise_id: "",
                equipment: "",
                set_number: "",
                prescribed_sets: "",
                prescribed_reps: "",
                prescribed_rir: "",
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

              Array.from({ length: prescribedSets }, (_, setIndex) => {
                const set = exercise.sets?.[setIndex] || exercise.sets?.at(-1) || {};

                return {
                  plan_id: plan.id,
                  plan_name: plan.name || "",
                  plan_status: plan.status || "",
                  plan_type: plan.planType || plan.config?.planType || "",
                  plan_goal: plan.goal || plan.config?.goal || "",
                  total_weeks: totalWeeks,
                  workouts_per_week: workouts.length || plan.daysPerWeek || "",
                  current_week: plan.currentWeek || "",
                  week_number: weekNumber,
                  is_deload_week:
                    weekPrescription?.isDeload ||
                    weekNumber > Number(plan.durationWeeks || totalWeeks),
                  workout_day: planWorkout.dayNumber || workoutIndex + 1,
                  plan_workout_id: planWorkout.planWorkoutId || "",
                  workout_name: workoutName,
                  workout_type:
                    planWorkout.workoutType ||
                    template?.workoutType ||
                    planWorkout.workoutTypeLabel ||
                    template?.workoutTypeLabel ||
                    "",
                  exercise_position: exerciseIndex + 1,
                  exercise_name: exercise.name || "",
                  exercise_id: exercise.exerciseId || exercise.id || "",
                  equipment: getExerciseEquipmentLabel(exercise),
                  set_number: setIndex + 1,
                  prescribed_sets: prescribedSets,
                  prescribed_reps: getPlanSetReps(set, weekPrescription, plan),
                  prescribed_rir: getPlanSetRir(
                    set,
                    weekPrescription,
                    plan,
                    weekNumber
                  ),
                };
              }).forEach((row) => rows.push(row));
            });
          });
        }
      );
    });

  return rows;
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

          if (!Array.isArray(weeklyPrescriptions)) {
            return exercise;
          }

          return {
            ...exercise,
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
  const response = await fetch(`${baseUrl}index.html?update-check=${Date.now()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Live build check failed with ${response.status}.`);
  }

  const html = await response.text();
  const match = html.match(
    /<meta\s+name=["']app-build-time["']\s+content=["']([^"']+)["']/i
  );

  return match ? match[1] : "";
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
  const [templatePreviewEditActive, setTemplatePreviewEditActive] =
    useState(false);

  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(null);

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
  const [plansExpanded, setPlansExpanded] = useState(true);
  const [workoutsExpanded, setWorkoutsExpanded] = useState(true);
  const [completedPlanActions, setCompletedPlanActions] = useState(null);
  const [extendPlanTarget, setExtendPlanTarget] = useState(null);

  const [updateStatus, setUpdateStatus] = useState("");

  const [buildNotice, setBuildNotice] = useState(getInitialBuildNotice);

  const [lastUpdateCheck, setLastUpdateCheck] = useState(null);

  const [indexedDbReady, setIndexedDbReady] = useState(false);

  const [authSession, setAuthSession] = useState(null);
  const [calendarNutritionEntries, setCalendarNutritionEntries] = useState(() =>
    readLocalArray(NUTRITION_LOG_KEY)
  );

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

  const [showAdvancedSyncTools, setShowAdvancedSyncTools] = useState(false);

  const [dataAuditStatus, setDataAuditStatus] = useState("");

  const [dataAuditSummary, setDataAuditSummary] = useState(null);

  const [coachBriefPrompt, setCoachBriefPrompt] = useState("");

  const [coachBriefStatus, setCoachBriefStatus] = useState("");
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
    const seededLocalEntries =
      scopedLocalEntries.length > 0 ? scopedLocalEntries : legacyLocalEntries;

    queueMicrotask(() => {
      setCalendarNutritionEntries(seededLocalEntries);
    });

    if (!authSession?.user?.id || !isSupabaseConfigured || !appAccessAllowed) {
      return undefined;
    }

    let cancelled = false;

    async function syncCalendarNutritionEntries() {
      try {
        await retryPendingNutritionDeletes(authSession);

        const uploadableSeededEntries = filterPendingDeletedNutritionEntries(
          seededLocalEntries,
          userId
        );

        if (uploadableSeededEntries.length > 0) {
          await uploadNutritionEntries(uploadableSeededEntries, authSession);
        }

        const cloudEntries = await downloadNutritionEntries(authSession);
        const mergedEntries = filterPendingDeletedNutritionEntries(
          mergeNutritionEntries(uploadableSeededEntries, cloudEntries),
          userId
        );

        if (mergedEntries.length > 0) {
          await uploadNutritionEntries(mergedEntries, authSession);
        }

        if (cancelled) {
          return;
        }

        setCalendarNutritionEntries(mergedEntries);
        saveLocalArray(storageKey, mergedEntries);
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
      return;
    }

    const userId = authSession?.user?.id || null;
    const storageKey = getNutritionLogStorageKey(userId);

    queueMicrotask(() => {
      setCalendarNutritionEntries(readLocalArray(storageKey));
    });
  }, [authSession?.user?.id, showNutrition]);

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
      await signOut();
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

    return {
      exerciseLibrary,
      exerciseMetadata,
      history,
      ownerUserId: localOwnerUserId,
      plans: reconciledPlans,
      selectedSessionId,
      sessions,
      templates,
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
    const nextPlans = reconcilePlanCompletionsWithHistory(
      data.plans,
      data.history
    );

    setTemplates(data.templates);
    setPlans(nextPlans);
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
    markNormalizedSyncDirty(["history", "plans", "workouts"]);
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
      reps: sourceWeek.reps || "",
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
    return Boolean(
      isSupabaseConfigured &&
        session?.user?.id &&
        appAccessAllowed &&
        !approvalFromCache &&
        indexedDbReady &&
        (typeof navigator === "undefined" || navigator.onLine)
    );
  }

  function markNormalizedSyncDirty(domains = NORMALIZED_SYNC_DOMAINS) {
    const nextDomains = new Set(normalizedSyncDirtyDomainsRef.current);

    domains.forEach((domain) => {
      if (NORMALIZED_SYNC_DOMAINS.includes(domain)) {
        nextDomains.add(domain);
      }
    });

    normalizedSyncDirtyDomainsRef.current = nextDomains;
    writeNormalizedSyncDirtyDomains([...nextDomains]);
  }

  function markNormalizedSyncClean() {
    const syncedAt = new Date().toISOString();

    normalizedSyncDirtyDomainsRef.current = new Set();
    writeNormalizedSyncDirtyDomains([]);
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

  async function uploadNormalizedWorkoutData(data, session, domains) {
    const domainSet = new Set(domains);
    const shouldSyncWorkouts =
      domainSet.has("workouts") ||
      domainSet.has("history") ||
      domainSet.has("plans");
    let workoutsUploaded = false;

    if (domainSet.has("exercisePreferences")) {
      await uploadCustomExercises(data.exerciseLibrary, session);
      await uploadExercisePreferences(
        data.exerciseLibrary,
        data.exerciseMetadata,
        session
      );
    }

    if (shouldSyncWorkouts) {
      await uploadWorkouts(data.templates, data.exerciseLibrary, session);
      workoutsUploaded = true;
    }

    if (domainSet.has("history")) {
      await uploadWorkoutHistory(
        data.history,
        data.templates,
        data.exerciseLibrary,
        session,
        {
          skipWorkoutRefresh: workoutsUploaded,
        }
      );
    }

    if (domainSet.has("plans")) {
      const reconciledPlans = reconcilePlanCompletionsWithHistory(
        data.plans,
        data.history
      );

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
      plans: resolvedPlans,
      sessions,
      templates: linkedTemplates,
    }).missingPlanWorkouts.length;

    setPlans(resolvedPlans);
    setTemplates(linkedTemplates);

    if (afterBrokenLinks < beforeBrokenLinks) {
      markNormalizedSyncDirty(["plans", "workouts"]);
    }

    setSyncStatus(
      `Plan link repair complete: ${beforeBrokenLinks} broken links before, ${afterBrokenLinks} after.`
    );
  }

  async function runAutomaticNormalizedSync(reason = "auto") {
    const session = authSessionRef.current;

    if (!isAutomaticSyncAvailable(session)) {
      return;
    }

    const visibleSyncAction = reason === "manual" ? "sync" : null;

    if (automaticSyncInFlightRef.current) {
      automaticSyncQueuedRef.current = true;
      setSyncStatus(
        reason === "manual"
          ? "Sync already in progress. Wait for it to finish, then tap Sync Now again if needed."
          : "Sync already in progress. New local changes will sync at the next checkpoint."
      );
      return;
    }

    automaticSyncInFlightRef.current = true;
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
      const cloudSummary = await getNormalizedCloudSummary(session);
      const shouldSeedPlateInventory =
        cloudSummary.plateInventory === 0 &&
        hasConfiguredPlateInventory(plateInventoryRef.current);
      const uploadDomains = forceUpload
        ? [...NORMALIZED_SYNC_DOMAINS]
        : shouldSeedPlateInventory
          ? [...new Set([...dirtyDomains, "plateInventory"])]
          : dirtyDomains;
      const shouldHydrateFirst =
        !hasLocalNormalizedUserData(data) &&
        hasNormalizedCloudData(cloudSummary) &&
        !shouldSeedPlateInventory;
      const shouldUpload =
        !shouldHydrateFirst && uploadDomains.length > 0;
      const mode = shouldHydrateFirst
        ? "hydrate"
        : shouldUpload
          ? "sync"
          : "check";

      if (shouldUpload) {
        if (reason === "manual") {
          setSyncStatus(`Syncing now... uploading ${uploadDomains.join(", ")}.`);
        }

        await uploadNormalizedWorkoutData(data, session, uploadDomains);
      }

      const shouldDownload =
        shouldHydrateFirst || reason === "manual" || reason === "resume";

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

        markNormalizedSyncClean();
        automaticSyncHydratedUserRef.current = session.user.id;
        setSyncStatus(
          `${shouldUpload ? "Uploaded" : "Checked"} cloud sync state. ${
            shouldUpload ? `Pushed: ${uploadDomains.join(", ")}. ` : ""
          }Full cloud pull skipped to reduce Supabase egress. Last auto sync: ${new Date().toLocaleTimeString()}.`
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
      markNormalizedSyncClean();
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
    } catch (error) {
      console.error("Automatic normalized sync failed:", error);
      setSyncStatus(
        reason === "manual"
          ? `Sync Now failed: ${error.message}`
          : `Auto sync failed: ${error.message}`
      );
    } finally {
      automaticSyncInFlightRef.current = false;
      automaticSyncQueuedRef.current = false;
      if (visibleSyncAction) {
        setActiveSyncAction(null);
        setSyncLoading(false);
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

    if (getCurrentTimeMs() < automaticSyncSuppressUntilRef.current) {
      return;
    }

    if (history.length > previousHistoryLength) {
      markNormalizedSyncDirty(["history"]);
      runAutomaticNormalizedSync("workout completion");
    }
    // Latest sync state is read from refs inside runAutomaticNormalizedSync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, authSession, indexedDbReady]);

  useEffect(() => {
    if (!authSession?.user?.id || !indexedDbReady) {
      return undefined;
    }

    function syncAfterResume() {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (
        getCurrentTimeMs() - lastAutomaticSyncAttemptRef.current <
        AUTO_SYNC_RESUME_INTERVAL
      ) {
        return;
      }

      runAutomaticNormalizedSync("resume");
    }

    window.addEventListener("focus", syncAfterResume);
    window.addEventListener("online", syncAfterResume);
    document.addEventListener("visibilitychange", syncAfterResume);

    return () => {
      window.removeEventListener("focus", syncAfterResume);
      window.removeEventListener("online", syncAfterResume);
      document.removeEventListener("visibilitychange", syncAfterResume);
    };
    // Latest sync state is read from refs inside runAutomaticNormalizedSync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession, indexedDbReady]);

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

  function generateCoachBrief() {
    const brief = buildCoachBrief({
      bodyWeightEntries: localBodyWeightEntries,
      exerciseLibrary,
      history,
      plans,
    });

    setCoachBriefPrompt(brief.prompt);
    setCoachBriefStatus(
      `Coach brief generated from ${brief.workoutCount} recent workouts and ${brief.trackedExercises.length} tracked exercises.`
    );
  }

  async function copyCoachBrief() {
    if (!coachBriefPrompt) {
      generateCoachBrief();
      return;
    }

    try {
      await navigator.clipboard.writeText(coachBriefPrompt);
      setCoachBriefStatus("Coach brief copied. Paste it into ChatGPT.");
    } catch (error) {
      console.error("Coach brief copy failed:", error);
      setCoachBriefStatus("Copy failed. Select the text and copy it manually.");
    }
  }

  async function shareCoachBrief() {
    const text = coachBriefPrompt || buildCoachBrief({
      bodyWeightEntries: localBodyWeightEntries,
      exerciseLibrary,
      history,
      plans,
    }).prompt;

    setCoachBriefPrompt(text);

    if (navigator.share) {
      try {
        await navigator.share({
          text,
          title: "Workout Coach Brief",
        });
        setCoachBriefStatus("Coach brief shared.");
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          setCoachBriefStatus("Share canceled.");
          return;
        }

        console.error("Coach brief share failed:", error);
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCoachBriefStatus("Sharing is unavailable. Coach brief copied instead.");
    } catch (error) {
      console.error("Coach brief fallback copy failed:", error);
      setCoachBriefStatus("Sharing is unavailable. Select the text and copy it manually.");
    }
  }

  function openChatGptForCoachBrief() {
    const text = coachBriefPrompt || buildCoachBrief({
      bodyWeightEntries: localBodyWeightEntries,
      exerciseLibrary,
      history,
      plans,
    }).prompt;

    setCoachBriefPrompt(text);
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    setCoachBriefStatus("ChatGPT opened. Copy or share the coach brief there.");
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
      await navigator.clipboard.writeText(csv);
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
        "workouts_per_week",
        "current_week",
        "week_number",
        "is_deload_week",
        "workout_day",
        "plan_workout_id",
        "workout_name",
        "workout_type",
        "exercise_position",
        "exercise_name",
        "exercise_id",
        "equipment",
        "set_number",
        "prescribed_sets",
        "prescribed_reps",
        "prescribed_rir",
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
      await navigator.clipboard.writeText(csv);
      setPlanExportStatus("Plan CSV copied.");
    } catch (error) {
      console.error("Plan export copy failed:", error);
      setPlanExportStatus("Copy failed. Download the CSV instead.");
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
          setTemplates(indexedDbData.templates);
          setPlans(indexedDbData.plans);
          setHistory(indexedDbData.history);
          setSessions(indexedDbData.sessions);
          setExerciseLibrary(indexedDbData.exerciseLibrary);
          setExerciseMetadata(indexedDbData.exerciseMetadata);
          setLocalOwnerUserId(indexedDbData.ownerUserId || null);
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
        result = await window.checkForAppUpdate();
      } else if ("serviceWorker" in navigator) {
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

  useEffect(() => {
    const data = {
      exerciseLibrary,
      exerciseMetadata,
      history,
      ownerUserId: localOwnerUserId,
      plans,
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
    plans,
    history,
    sessions,
    exerciseLibrary,
    exerciseMetadata,
    localOwnerUserId,
    selectedSessionId,
    indexedDbReady,
  ]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const localBodyWeightEntries = readLocalArray(BODY_WEIGHT_LOG_KEY);
  const editingPlan = plans.find(
    (plan) => String(plan.id) === String(editingPlanId)
  );
  const isHomeView =
    !showExercises &&
    !showPlans &&
    !showNutrition &&
    !showSettings &&
    !selectedTemplateId &&
    !selectedSessionId &&
    !selectedHistory &&
    !selectedHistoryList;

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
    const name = prompt("Template name");

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

  function updateHistoryWorkoutSet({ workoutId, exerciseId, setId, field, value }) {
    const editedExerciseIds = new Set();
    const nextHistory = history.map((workout) => {
      if (String(workout.id) !== String(workoutId)) {
        return workout;
      }

      return {
        ...workout,
        exercises: (workout.exercises || []).map((exercise) => {
          if (String(exercise.id) !== String(exerciseId)) {
            return exercise;
          }

          if (exercise.exerciseId) {
            editedExerciseIds.add(exercise.exerciseId);
          }

          return {
            ...exercise,
            sets: (exercise.sets || []).map((set) =>
              String(set.id) === String(setId)
                ? {
                    ...set,
                    [field]: value,
                  }
                : set
            ),
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

  function renderPlanCard(plan) {
    const displayWeek = planDisplayWeeks[plan.id] || plan.currentWeek || 1;
    const weekStatus = getPlanWeekStatus(plan, displayWeek, history);
    const active = plan.status === "active";
    const completed = plan.status === "completed";
    const expanded = expandedPlanIds[plan.id] ?? (isHomeView && active);
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
          border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
          borderRadius: "8px",
          marginBottom: "12px",
          padding: "12px",
          textAlign: "left",
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
                minHeight: "32px",
                minWidth: "32px",
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
                minWidth: 0,
                padding: 0,
                textAlign: "left",
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
                {plan.name}
              </strong>
            </button>
            <button
              aria-label={`Edit ${plan.name}`}
              onClick={() => openPlanEditor(plan)}
              title="Edit plan"
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "32px",
                minWidth: "32px",
                padding: "4px",
              }}
            >
              <Pencil size={15} />
            </button>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "6px",
            }}
          >
            <button
              disabled={active}
              onClick={() => {
                if (completed) {
                  setCompletedPlanActions(plan);
                  return;
                }

                if (!active) {
                  activatePlan(plan.id);
                }
              }}
              style={{
                background: active
                  ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                  : "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: "999px",
                color: active ? "var(--accent)" : "var(--text-muted)",
                cursor: active ? "default" : "pointer",
                fontSize: "11px",
                fontWeight: "bold",
                minHeight: "30px",
                padding: "3px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {completed ? "Complete" : active ? "Active" : "Inactive"}
            </button>
            <button
              aria-label={`Delete ${plan.name}`}
              onClick={() => deletePlan(plan)}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "30px",
                minWidth: "32px",
                padding: "4px",
              }}
            >
              <Trash2 size={15} />
            </button>
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
                {plan.goal === "progress" ? "Progress" : "Maintain"} · Week{" "}
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
                          <Play size={15} /> Review
                        </>
                      ) : (
                        "Missing"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {active && !completed && (
              <div
                style={{
                  color: "var(--accent)",
                  fontSize: "12px",
                  fontWeight: "bold",
                  marginTop: "10px",
                }}
              >
                This is your active plan
              </div>
            )}
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
    setShowPlans(true);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
    setSelectedTemplatePlanWeek(null);
  }

  function goNutrition() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(false);
    setShowPlans(false);
    setEditingPlanId(null);
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
        {renderPlanCompletionPrompt()}
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
            <button onClick={completePlanCompletionPrompt} type="button">
              Complete plan
            </button>
            <button onClick={extendPromptPlanOneWeek} type="button">
              Extend plan one week
            </button>
            <button onClick={repeatPromptPlan} type="button">
              Repeat plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderAuthSyncIndicator() {
    const signedIn = Boolean(authSession?.user?.id);
    const hasPendingApprovals = signedIn && pendingApprovalCount > 0;

    return (
      <div
        style={{
          alignItems: "center",
          display: "inline-flex",
          gap: "6px",
          justifySelf: "center",
          margin: "-6px 0 14px",
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
            fontSize: "12px",
            gap: "6px",
            lineHeight: 1.2,
            padding: "5px 10px",
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
              fontSize: "12px",
              gap: "6px",
              lineHeight: 1.2,
              padding: "5px 10px",
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
          <Settings size={26} />
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
                <button disabled={authLoading} onClick={handleSignOut}>
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
          ) : (
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
              {/* Keep access control server-side; frontend allowlists are not security. */}
              <input
                autoCapitalize="none"
                autoComplete="username"
                id="auth-email"
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
                id="auth-password"
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
                src={`${import.meta.env.BASE_URL}workout-icon.png`}
                style={{
                  borderRadius: "18px",
                  gridColumn: "1 / -1",
                  justifySelf: "center",
                  marginTop: "18px",
                  maxWidth: "240px",
                  width: "58%",
                }}
              />
            </form>
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
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              Last synced: {formatLastNormalizedSyncAt(lastNormalizedSyncAt)}
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
          {isIraSettingsUser && (
            <>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "10px",
                  paddingTop: "10px",
                }}
              >
                <h3
                  style={{
                    alignItems: "center",
                    display: "flex",
                    fontSize: "15px",
                    gap: "6px",
                    justifyContent: "center",
                    margin: "0 0 6px",
                  }}
                >
                  <Brain size={16} />
                  AI Coach Brief
                </h3>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    margin: "0 0 8px",
                  }}
                >
                  Builds a local workout-history prompt for ChatGPT. No API key
                  and no cloud request are used.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <button onClick={generateCoachBrief} type="button">
                    Generate Brief
                  </button>
                  <button
                    disabled={!coachBriefPrompt}
                    onClick={copyCoachBrief}
                    type="button"
                  >
                    <Copy size={14} />
                    Copy
                  </button>
                  <button onClick={shareCoachBrief} type="button">
                    <Share2 size={14} />
                    Share
                  </button>
                  <button onClick={openChatGptForCoachBrief} type="button">
                    Open ChatGPT
                  </button>
                </div>
                {coachBriefStatus && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "6px",
                    }}
                  >
                    {coachBriefStatus}
                  </div>
                )}
                {coachBriefPrompt && (
                  <textarea
                    readOnly
                    value={coachBriefPrompt}
                    style={{
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      boxSizing: "border-box",
                      color: "var(--text)",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: "11px",
                      lineHeight: 1.45,
                      marginTop: "8px",
                      minHeight: "180px",
                      padding: "8px",
                      resize: "vertical",
                      width: "100%",
                    }}
                  />
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
                  {getCustomExercises(exerciseLibrary).length} custom exercises
                  ready for the normalized exercise table.
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
                marginBottom: "12px",
                padding: "10px",
              }}
            >
              Approval status:{" "}
              {approvalLoading
                ? "checking..."
                : approvalStatus?.status || "not verified"}
              {approvalError ? ` (${approvalError})` : ""}
            </div>
          )}
        </div>
        {renderSettings()}
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
    return renderAppShell(
      <PlansView
        bodyWeightEntries={localBodyWeightEntries}
        editingPlan={editingPlan}
        exerciseLibrary={exerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        history={history}
        onCancel={() => {
          setEditingPlanId(null);
          goHome();
        }}
        onSave={(result) => {
          setEditingPlanId(null);
          goHome();
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
        setExerciseLibrary={setExerciseLibrary}
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
        bodyWeightEntries={localBodyWeightEntries}
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
        setExerciseLibrary={setExerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        setExerciseMetadata={setExerciseMetadata}
        history={history}
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

  return renderAppShell(
    <>
      <div
        style={{
          padding: "20px",
        }}
      >
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: "10px",
          gridTemplateColumns: "34px minmax(0, 1fr) 34px",
          marginBottom: "16px",
        }}
      >
        <img
          alt=""
          src={`${import.meta.env.BASE_URL}workout-icon.png`}
          style={{
            borderRadius: "8px",
            height: "34px",
            width: "34px",
          }}
        />
        <h1
          style={{
            fontSize: "1.85rem",
            margin: 0,
            textAlign: "center",
          }}
        >
          Workout Log
        </h1>
        <span />
      </div>

      {renderAuthSyncIndicator()}

      <WorkoutCalendar
        bodyWeightEntries={localBodyWeightEntries}
        exerciseLibrary={exerciseLibrary}
        history={history}
        nutritionEntries={calendarNutritionEntries}
        onUpdateWorkoutSet={updateHistoryWorkoutSet}
        session={authSession}
      />

      <hr />

      {plans.length > 0 && (
        <>
          <button
            aria-expanded={plansExpanded}
            onClick={() => setPlansExpanded((expanded) => !expanded)}
            style={{
              alignItems: "center",
              background: "transparent",
              border: "none",
              color: "var(--text-h)",
              display: "grid",
              font: "inherit",
              gridTemplateColumns: "32px minmax(0, 1fr) 32px",
              margin: "0 0 10px",
              padding: "4px 0",
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
              {plansExpanded ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </span>
            <span
              style={{
                fontSize: "18px",
                fontWeight: "bold",
              }}
            >
              Plans{" "}
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "normal",
                }}
              >
                ({plans.length} {plans.length === 1 ? "plan" : "plans"})
              </span>
            </span>
            <span />
          </button>

          {plansExpanded && (
            <>
              {[...plans]
                .sort((a, b) => {
                  if (a.status === "active" && b.status !== "active") return -1;
                  if (b.status === "active" && a.status !== "active") return 1;
                  return (b.createdAt || "").localeCompare(a.createdAt || "");
                })
                .map(renderPlanCard)}
            </>
          )}
          {renderCompletedPlanActions()}
          {renderExtendPlanPicker()}
          {renderWeekPicker()}
          <hr />
        </>
      )}

      <button
        aria-expanded={workoutsExpanded}
        onClick={() => setWorkoutsExpanded((expanded) => !expanded)}
        style={{
          alignItems: "center",
          background: "transparent",
          border: "none",
          color: "var(--text-h)",
          display: "grid",
          font: "inherit",
          gridTemplateColumns: "32px minmax(0, 1fr) 32px",
          margin: "12px 0 8px",
          padding: "4px 0",
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
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          Workouts{" "}
          <span
            style={{
              fontSize: "14px",
              fontWeight: "normal",
            }}
          >
            ({standaloneTemplates.length}{" "}
            {standaloneTemplates.length === 1 ? "workout" : "workouts"})
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
              onClick={addTemplate}
              style={{
                minHeight: "40px",
                padding: "8px 12px",
              }}
            >
              + New Template
            </button>

            <select
              value={templateSort}
              onChange={(e) => setTemplateSort(e.target.value)}
              style={{
                minHeight: "40px",
                padding: "8px 10px",
              }}
            >
              <option value="recent">Recent</option>

              <option value="alpha">A → Z</option>
            </select>
          </div>

          {standaloneTemplates.map((template) => (
            <div
              key={template.id}
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                display: "grid",
                gap: "10px",
                marginBottom: "8px",
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
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text)",
                    cursor: "pointer",
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
                }}
              >
                <button
                  aria-label={`Duplicate ${template.name}`}
                  onClick={() => {
                    const copy = {
                      ...template,

                      id: getCurrentTimeMs(),

                      name: template.name + " copy",

                      lastCompleted: null,
                    };

                    setTemplates([...templates, copy]);
                    requestSyncCheckpoint(["workouts"], "workout save");
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "34px",
                    minWidth: "34px",
                    padding: "5px",
                  }}
                >
                  <Copy size={16} />
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
                    minHeight: "34px",
                    minWidth: "34px",
                    padding: "5px",
                  }}
                >
                  <History size={16} />
                </button>
                <button
                  aria-label={`Delete ${template.name}`}
                  onClick={() => setConfirmDeleteTemplate(template)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "34px",
                    minWidth: "34px",
                    padding: "5px",
                  }}
                >
                  <Trash2 size={16} />
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
          onUpdateSet={updateHistoryWorkoutSet}
          workout={selectedHistory}
        />
      )}
    </>,
    "home"
  );
}
