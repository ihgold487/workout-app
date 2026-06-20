/* global __BUILD_TIME__ */
import { useState, useEffect, useRef } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Copy,
  Dumbbell,
  Home,
  Play,
  RotateCcw,
  Settings,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
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
  getSavedStorageVersion,
  loadWorkoutData,
  loadWorkoutDataFromIndexedDb,
  markStorageVersion,
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
import { isSupabaseConfigured, supabase } from "./sync/supabaseClient";
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
const AUTO_SYNC_RESUME_INTERVAL = 5 * 60 * 1000;
const AUTO_SYNC_CHECKPOINT_DELAY_MS = 350;
const AUTO_SYNC_SUPPRESS_MS = 4000;
const NORMALIZED_SYNC_DIRTY_KEY = "normalizedSyncDirty";
const NORMALIZED_SYNC_DIRTY_DOMAINS_KEY = "normalizedSyncDirtyDomains";
const LAST_NORMALIZED_SYNC_KEY = "lastNormalizedSyncAt";
const NORMALIZED_SYNC_DOMAINS = [
  "exercisePreferences",
  "workouts",
  "history",
  "plans",
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

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");

    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Failed to read ${key}:`, error);

    return [];
  }
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
        summary.exercisePreferences > 0)
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
          template.planWorkoutId === workout.planWorkoutId
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
  plans,
  workouts,
}) {
  const verb =
    mode === "hydrate" ? "Hydrated" : mode === "check" ? "Checked" : "Synced";
  const domainSummary =
    domains.length > 0 ? ` Pushed: ${domains.join(", ")}.` : "";

  return `${verb}: ${workouts.downloaded} workouts, ${plans.downloaded} plans, ${history.downloaded} completed workouts, ${exercisePreferences.updated} exercise preferences.${domainSummary}`;
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

  localStorage.setItem(
    NORMALIZED_SYNC_DIRTY_DOMAINS_KEY,
    JSON.stringify(uniqueDomains)
  );
  localStorage.setItem(
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

function getPlanCompletionsForWeek(plan, weekNumber) {
  return (plan.completions || []).filter(
    (completion) => Number(completion.weekNumber) === Number(weekNumber)
  );
}

function isPlanWorkoutComplete(plan, planWorkoutId, weekNumber) {
  return getPlanCompletionsForWeek(plan, weekNumber).some(
    (completion) => completion.planWorkoutId === planWorkoutId
  );
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

function getPlanWeekStatus(plan) {
  const currentWeek = plan.currentWeek || 1;
  const completedThisWeek = getPlanCompletionsForWeek(plan, currentWeek).length;
  const totalThisWeek = plan.workouts?.length || 0;

  return {
    completedThisWeek,
    currentWeek,
    totalThisWeek,
  };
}

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

  const [templates, setTemplates] = useState(initialWorkoutData.templates);

  const [plans, setPlans] = useState(initialWorkoutData.plans);

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
  const [templatePreviewEditActive, setTemplatePreviewEditActive] =
    useState(false);

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
  const [expandedPlanIds, setExpandedPlanIds] = useState({});
  const [plansExpanded, setPlansExpanded] = useState(true);
  const [workoutsExpanded, setWorkoutsExpanded] = useState(true);
  const [completedPlanActions, setCompletedPlanActions] = useState(null);
  const [extendPlanTarget, setExtendPlanTarget] = useState(null);

  const [updateStatus, setUpdateStatus] = useState("");

  const [buildNotice, setBuildNotice] = useState(getInitialBuildNotice);

  const [lastUpdateCheck, setLastUpdateCheck] = useState(null);

  const [indexedDbReady, setIndexedDbReady] = useState(false);

  const [authSession, setAuthSession] = useState(null);

  const [authEmail, setAuthEmail] = useState("");

  const [authPassword, setAuthPassword] = useState("");

  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured
      ? "Sign in to enable automatic sync."
      : "Sync is not configured."
  );

  const [authLoading, setAuthLoading] = useState(false);

  const [syncStatus, setSyncStatus] = useState(
    "Automatic sync runs after sign-in. Manual controls remain available."
  );

  const [syncLoading, setSyncLoading] = useState(false);

  const [lastNormalizedSyncAt, setLastNormalizedSyncAt] = useState(
    readLastNormalizedSyncAt
  );

  const [showAdvancedSyncTools, setShowAdvancedSyncTools] = useState(false);

  const [dataAuditStatus, setDataAuditStatus] = useState("");

  const [dataAuditSummary, setDataAuditSummary] = useState(null);

  const currentWorkoutDataRef = useRef(null);

  const authSessionRef = useRef(null);

  const automaticSyncInFlightRef = useRef(false);

  const automaticSyncQueuedRef = useRef(false);

  const automaticSyncHydratedUserRef = useRef(null);

  const automaticSyncSuppressUntilRef = useRef(0);

  const lastAutomaticSyncAttemptRef = useRef(0);

  const checkpointSyncTimeoutRef = useRef(null);

  const localDataRevisionRef = useRef(0);

  const normalizedSyncDirtyDomainsRef = useRef(
    new Set(readNormalizedSyncDirtyDomains())
  );

  const exercisePreferencesDirtyReadyRef = useRef(false);

  const workoutDirtyReadyRef = useRef(false);

  const historyDirtyReadyRef = useRef(false);

  const planDirtyReadyRef = useRef(false);

  const previousHistoryLengthRef = useRef(history.length);

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

  function getCurrentWorkoutData() {
    return {
      exerciseLibrary,
      exerciseMetadata,
      history,
      plans,
      selectedSessionId,
      sessions,
      templates,
    };
  }

  function replaceWorkoutData(data) {
    setTemplates(data.templates);
    setPlans(data.plans);
    setHistory(data.history);
    setSessions(data.sessions);
    setExerciseLibrary(data.exerciseLibrary);
    setExerciseMetadata(data.exerciseMetadata);
    setSelectedSessionId(data.selectedSessionId);
  }

  useEffect(() => {
    localDataRevisionRef.current += 1;
    currentWorkoutDataRef.current = {
      exerciseLibrary,
      exerciseMetadata,
      history,
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
    selectedSessionId,
  ]);

  useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

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
    localStorage.setItem(LAST_NORMALIZED_SYNC_KEY, syncedAt);
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
      await uploadExercisePreferences(data.exerciseLibrary, session);
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
      await uploadPlans(
        data.plans,
        data.templates,
        data.exerciseLibrary,
        session,
        {
          skipWorkoutRefresh: workoutsUploaded,
        }
      );
    }
  }

  async function downloadNormalizedWorkoutData(data, session, dirtyDomains = []) {
    const dirtyDomainSet = new Set(dirtyDomains);
    const exercisePreferences = await downloadExerciseLibraryWithPreferences(
      data.exerciseLibrary,
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
      history: historyData.history,
      plans: resolvedPlans,
      templates: linkedTemplates,
    };

    return {
      exercisePreferences,
      history: historyData,
      nextData,
      plans: planData,
      workouts: workoutData,
    };
  }

  async function pullLatestNormalizedData() {
    setSyncLoading(true);

    try {
      const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
      const downloaded = await downloadNormalizedWorkoutData(data, authSession, []);

      automaticSyncSuppressUntilRef.current =
        getCurrentTimeMs() + AUTO_SYNC_SUPPRESS_MS;
      replaceWorkoutData(downloaded.nextData);
      markNormalizedSyncClean();
      setSyncStatus(
        `${getAutoSyncSummary({
          exercisePreferences: downloaded.exercisePreferences,
          history: downloaded.history,
          mode: "check",
          plans: downloaded.plans,
          workouts: downloaded.workouts,
        })} Pulled latest cloud data.`
      );
    } catch (error) {
      console.error("Pull latest failed:", error);
      setSyncStatus(`Pull latest failed: ${error.message}`);
    } finally {
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

    if (automaticSyncInFlightRef.current) {
      automaticSyncQueuedRef.current = true;
      setSyncStatus(
        "Sync already in progress. New local changes will sync at the next checkpoint."
      );
      return;
    }

    automaticSyncInFlightRef.current = true;
    lastAutomaticSyncAttemptRef.current = getCurrentTimeMs();
    setSyncStatus(`Auto sync ${reason}...`);

    try {
      const data = currentWorkoutDataRef.current || getCurrentWorkoutData();
      const syncStartRevision = localDataRevisionRef.current;
      const forceUpload = reason === "workout completion";
      const dirtyDomains = [...normalizedSyncDirtyDomainsRef.current];
      const uploadDomains = forceUpload ? [...NORMALIZED_SYNC_DOMAINS] : dirtyDomains;
      const cloudSummary = await getNormalizedCloudSummary(session);
      const shouldHydrateFirst =
        !hasLocalNormalizedUserData(data) &&
        hasNormalizedCloudData(cloudSummary);
      const shouldUpload =
        !shouldHydrateFirst && uploadDomains.length > 0;
      const mode = shouldHydrateFirst
        ? "hydrate"
        : shouldUpload
          ? "sync"
          : "check";

      if (shouldUpload) {
        await uploadNormalizedWorkoutData(data, session, uploadDomains);
      }

      const downloaded = await downloadNormalizedWorkoutData(
        data,
        session,
        uploadDomains
      );

      if (localDataRevisionRef.current !== syncStartRevision) {
        automaticSyncQueuedRef.current = true;
        setSyncStatus(
          "Sync finished, but newer local changes were detected. They will sync at the next checkpoint."
        );
        return;
      }

      automaticSyncSuppressUntilRef.current =
        getCurrentTimeMs() + AUTO_SYNC_SUPPRESS_MS;
      replaceWorkoutData(downloaded.nextData);
      automaticSyncHydratedUserRef.current = session.user.id;
      markNormalizedSyncClean();
      setSyncStatus(
        `${getAutoSyncSummary({
          exercisePreferences: downloaded.exercisePreferences,
          domains: shouldUpload ? uploadDomains : [],
          history: downloaded.history,
          mode,
          plans: downloaded.plans,
          workouts: downloaded.workouts,
        })} Last auto sync: ${new Date().toLocaleTimeString()}.`
      );
    } catch (error) {
      console.error("Automatic normalized sync failed:", error);
      setSyncStatus(`Auto sync failed: ${error.message}`);
    } finally {
      automaticSyncInFlightRef.current = false;
      automaticSyncQueuedRef.current = false;
    }
  }

  useEffect(() => {
    if (!authSession?.user?.id || !indexedDbReady) {
      return;
    }

    if (automaticSyncHydratedUserRef.current === authSession.user.id) {
      return;
    }

    runAutomaticNormalizedSync("startup");
    // Latest sync state is read from refs inside runAutomaticNormalizedSync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession, indexedDbReady]);

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
  }, [exerciseLibrary, indexedDbReady]);

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

    const timeoutId = window.setTimeout(() => {
      document.documentElement.classList.add("app-ready");
    }, STARTUP_SPLASH_MINIMUM_MS);

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
    selectedSessionId,
    indexedDbReady,
  ]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
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

      localStorage.setItem(
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
          plan.id === planId
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
        completions: plan.id === planId ? [] : plan.completions || [],
        currentWeek: plan.id === planId ? 1 : plan.currentWeek || 1,
        status:
          plan.id === planId
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
        if (plan.id !== planId) {
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
    const weekStatus = getPlanWeekStatus(plan);
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
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "8px",
              }}
            >
              {plan.goal === "progress" ? "Progress" : "Maintain"} · Week{" "}
              {weekStatus.currentWeek} of {plan.durationWeeks} ·{" "}
              {weekStatus.completedThisWeek}/{weekStatus.totalThisWeek} this week
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
                  weekStatus.currentWeek
                );

                return (
                  <button
                    key={planWorkout.planWorkoutId}
                    disabled={!template}
                    onClick={() => template && setSelectedTemplateId(template.id)}
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
            Week {weekStatus.currentWeek} · {weekStatus.completedThisWeek}/
            {weekStatus.totalThisWeek} done
          </div>
        )}
      </section>
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
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goExercises() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(true);
    setShowPlans(false);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goPlans() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(false);
    setShowPlans(true);
    setShowNutrition(false);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goNutrition() {
    if (templatePreviewEditActive) {
      return;
    }

    setShowExercises(false);
    setShowPlans(false);
    setShowNutrition(true);
    setShowSettings(false);
    setSelectedHistory(null);
    setSelectedHistoryList(null);
    setSelectedTemplateId(null);
  }

  function goSettings() {
    if (templatePreviewEditActive) {
      return;
    }

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
        {renderBottomNav(activeView)}
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
              disabled={!authSession || syncLoading}
              onClick={() => runAutomaticNormalizedSync("manual")}
            >
              Sync Now
            </button>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "6px",
              }}
            >
              Automatic sync runs after startup, resume, workout completion, and
              save checkpoints.
            </div>
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
                  disabled={!authSession || syncLoading}
                  onClick={pullLatestNormalizedData}
                >
                  Pull Latest
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
        </section>
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
        history={history}
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
        exerciseLibrary={exerciseLibrary}
        exerciseMetadata={exerciseMetadata}
        history={history}
        onSave={(result) => {
          goHome();
          requestSyncCheckpoint(
            result?.type === "workout" ? ["workouts"] : ["plans", "workouts"],
            result?.type === "workout" ? "workout save" : "plan save"
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
            {formatHistoryTimestamp(workout)}
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
        onEditModeChange={setTemplatePreviewEditActive}
      />
    );
  }

  if (selectedTemplate) {
    return renderAppShell(
      <TemplateView
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
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1>Workout Log</h1>

      <WorkoutCalendar history={history} />

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
            <button onClick={addTemplate}>+ New Template</button>

            <select
              value={templateSort}
              onChange={(e) => setTemplateSort(e.target.value)}
            >
              <option value="recent">Recent</option>

              <option value="alpha">A → Z</option>
            </select>
          </div>

          {standaloneTemplates.map((template) => (
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

                      id: getCurrentTimeMs(),

                      name: template.name + " copy",

                      lastCompleted: null,
                    };

                    setTemplates([...templates, copy]);
                    requestSyncCheckpoint(["workouts"], "workout save");
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
                <button
                  onClick={() => {
                    const matches = history.filter(
                      (h) => String(h.templateId) === String(template.id)
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
        </>
      )}
    </div>,
    "home"
  );
}
