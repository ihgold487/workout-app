import { db } from "../db";
import {
  getBenchmarkFamilyKeyForExercise,
  isExerciseBenchmark,
} from "../utils/exerciseBenchmark";
import { withDefaultExerciseStatus } from "../utils/exerciseStatus";

export const WORKOUT_DATA_SCHEMA_VERSION = 1;

const STORAGE_VERSION_KEY = "storageVersion";
const WORKOUT_DATA_RECORD_ID = "current";
const WORKOUT_SESSION_JOURNAL_ID = "active";

const WORKOUT_DATA_KEYS = {
  exerciseLibrary: "exerciseLibrary",
  exerciseMetadata: "exerciseMetadata",
  history: "history",
  ownerUserId: "ownerUserId",
  plans: "plans",
  selectedSessionId: "selectedSessionId",
  sessions: "sessions",
  templates: "templates",
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);

    return value == null ? fallback : JSON.parse(value);
  } catch (error) {
    console.error(`Failed to read ${key} from storage:`, error);

    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write ${key} to storage:`, error);
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function getExerciseSeedKey(exercise) {
  const equipment = Array.isArray(exercise?.equipment)
    ? exercise.equipment.filter(Boolean).join("|")
    : exercise?.equipment || "";

  return `${exercise?.id ?? ""}::${exercise?.name || ""}::${equipment}`;
}

function getBuiltInExerciseIdentityKey(exercise) {
  const equipment = Array.isArray(exercise?.equipment)
    ? exercise.equipment.filter(Boolean).join("|")
    : exercise?.equipment || "";

  return `${String(exercise?.name || "").trim().toLowerCase()}::${String(
    equipment
  )
    .trim()
    .toLowerCase()}`;
}

function mergeSavedBuiltinExercise(seedExercise, savedExercise) {
  if (!savedExercise) {
    return seedExercise;
  }

  const mergedExercise = {
    ...seedExercise,
    active: savedExercise.active,
    benchmark: Object.prototype.hasOwnProperty.call(savedExercise, "benchmark")
      ? Boolean(savedExercise.benchmark)
      : isExerciseBenchmark(seedExercise),
    benchmarkFamilyKey:
      savedExercise.benchmarkFamilyKey ??
      savedExercise.benchmark_family_key ??
      getBenchmarkFamilyKeyForExercise(seedExercise),
  };

  if (
    Object.prototype.hasOwnProperty.call(savedExercise, "bodyweightLoadPercent")
  ) {
    mergedExercise.bodyweightLoadPercent = savedExercise.bodyweightLoadPercent;
  }

  return mergedExercise;
}

function normalizeWorkoutData(data, { seedExercises }) {
  return {
    exerciseLibrary: mergeExerciseLibraryWithSeed(
      data?.exerciseLibrary,
      seedExercises
    ),
    exerciseMetadata: objectOrEmpty(data?.exerciseMetadata),
    history: arrayOrEmpty(data?.history),
    ownerUserId: data?.ownerUserId || null,
    plans: arrayOrEmpty(data?.plans),
    selectedSessionId: data?.selectedSessionId ?? null,
    sessions: arrayOrEmpty(data?.sessions),
    templates: arrayOrEmpty(data?.templates),
  };
}

function withDefaultExerciseBenchmark(exercise) {
  return {
    ...exercise,
    benchmark: isExerciseBenchmark(exercise),
    benchmarkFamilyKey: getBenchmarkFamilyKeyForExercise(exercise),
  };
}

export function mergeExerciseLibraryWithSeed(exerciseLibrary, seedExercises) {
  const savedExercises = arrayOrEmpty(exerciseLibrary);
  const seedKeys = new Set(seedExercises.map(getExerciseSeedKey));
  const seedIdentityKeys = new Set(
    seedExercises.map(getBuiltInExerciseIdentityKey)
  );
  const savedBuiltInBySeedKey = new Map(
    savedExercises
      .filter((exercise) => exercise.builtin)
      .map((exercise) => [getExerciseSeedKey(exercise), exercise])
  );
  const savedBuiltInByIdentityKey = new Map(
    savedExercises
      .filter((exercise) => exercise.builtin)
      .map((exercise) => [getBuiltInExerciseIdentityKey(exercise), exercise])
  );
  const seededExercises = seedExercises.map((exercise) =>
    withDefaultExerciseBenchmark(
      withDefaultExerciseStatus(
        mergeSavedBuiltinExercise(
          exercise,
          savedBuiltInBySeedKey.get(getExerciseSeedKey(exercise)) ||
            savedBuiltInByIdentityKey.get(getBuiltInExerciseIdentityKey(exercise))
        )
      )
    )
  );
  const customExercises = savedExercises.filter(
    (exercise) => !exercise.builtin
  );
  const promotedBuiltInExercises = savedExercises.filter(
    (exercise) =>
      exercise.builtin &&
      !seedKeys.has(getExerciseSeedKey(exercise)) &&
      !seedIdentityKeys.has(getBuiltInExerciseIdentityKey(exercise))
  );

  return [
    ...seededExercises,
    ...promotedBuiltInExercises.map((exercise) =>
      withDefaultExerciseBenchmark(withDefaultExerciseStatus(exercise))
    ),
    ...customExercises.map((exercise) =>
      withDefaultExerciseBenchmark(withDefaultExerciseStatus(exercise))
    ),
  ];
}

export function loadWorkoutData({ seedExercises }) {
  return normalizeWorkoutData(
    {
      exerciseLibrary: readJson(WORKOUT_DATA_KEYS.exerciseLibrary, []),
      exerciseMetadata: readJson(WORKOUT_DATA_KEYS.exerciseMetadata, {}),
      history: readJson(WORKOUT_DATA_KEYS.history, []),
      ownerUserId: readJson(WORKOUT_DATA_KEYS.ownerUserId, null),
      plans: readJson(WORKOUT_DATA_KEYS.plans, []),
      selectedSessionId: readJson(WORKOUT_DATA_KEYS.selectedSessionId, null),
      sessions: readJson(WORKOUT_DATA_KEYS.sessions, []),
      templates: readJson(WORKOUT_DATA_KEYS.templates, []),
    },
    {
      seedExercises,
    }
  );
}

export function saveWorkoutData(data, storageVersion) {
  localStorage.removeItem(WORKOUT_DATA_KEYS.exerciseLibrary);
  localStorage.removeItem(WORKOUT_DATA_KEYS.exerciseMetadata);
  localStorage.removeItem(WORKOUT_DATA_KEYS.history);
  localStorage.removeItem(WORKOUT_DATA_KEYS.plans);
  localStorage.removeItem(WORKOUT_DATA_KEYS.sessions);
  localStorage.removeItem(WORKOUT_DATA_KEYS.templates);
  writeJson(WORKOUT_DATA_KEYS.ownerUserId, data.ownerUserId || null);
  writeJson(WORKOUT_DATA_KEYS.selectedSessionId, data.selectedSessionId);
  writeJson(STORAGE_VERSION_KEY, storageVersion);
}

export async function loadWorkoutDataFromIndexedDb({ seedExercises }) {
  const record = await db.appData.get(WORKOUT_DATA_RECORD_ID);

  if (!record?.data) {
    return null;
  }

  const journal = await db.workoutSessionJournal.get(
    WORKOUT_SESSION_JOURNAL_ID
  );
  const journalIsCurrent =
    journal &&
    new Date(journal.updatedAt).getTime() >= new Date(record.updatedAt).getTime() &&
    (!journal.ownerUserId ||
      !record.data.ownerUserId ||
      String(journal.ownerUserId) === String(record.data.ownerUserId));
  const recoveredData = journalIsCurrent
    ? {
        ...record.data,
        selectedSessionId: journal.selectedSessionId,
        sessions: journal.sessions,
      }
    : record.data;

  return normalizeWorkoutData(recoveredData, {
    seedExercises,
  });
}

export async function saveWorkoutDataToIndexedDb(data, storageVersion) {
  const updatedAt = new Date().toISOString();

  await db.transaction("rw", db.appData, db.workoutSessionJournal, async () => {
    await db.appData.put({
      data: createWorkoutBackup(data).data,
      id: WORKOUT_DATA_RECORD_ID,
      schemaVersion: WORKOUT_DATA_SCHEMA_VERSION,
      storageVersion,
      updatedAt,
    });

    const journal = await db.workoutSessionJournal.get(
      WORKOUT_SESSION_JOURNAL_ID
    );

    if (
      journal &&
      new Date(journal.updatedAt).getTime() <= new Date(updatedAt).getTime()
    ) {
      await db.workoutSessionJournal.delete(WORKOUT_SESSION_JOURNAL_ID);
    }
  });
}

export async function saveWorkoutSessionJournal({
  ownerUserId,
  selectedSessionId,
  sessions,
}) {
  await db.workoutSessionJournal.put({
    id: WORKOUT_SESSION_JOURNAL_ID,
    ownerUserId: ownerUserId || null,
    selectedSessionId: selectedSessionId ?? null,
    sessions: arrayOrEmpty(sessions),
    updatedAt: new Date().toISOString(),
  });
}

export function getSavedStorageVersion() {
  return readJson(STORAGE_VERSION_KEY, 0) || 0;
}

export function markStorageVersion(storageVersion) {
  writeJson(STORAGE_VERSION_KEY, storageVersion);
}

export function clearLegacyEquipmentStorage() {
  localStorage.removeItem("equipmentOptions");
}

export function createWorkoutBackup(data) {
  return {
    data: {
      exerciseLibrary: arrayOrEmpty(data.exerciseLibrary),
      exerciseMetadata: objectOrEmpty(data.exerciseMetadata),
      history: arrayOrEmpty(data.history),
      ownerUserId: data.ownerUserId || null,
      plans: arrayOrEmpty(data.plans),
      selectedSessionId: data.selectedSessionId ?? null,
      sessions: arrayOrEmpty(data.sessions),
      templates: arrayOrEmpty(data.templates),
    },
    exportedAt: new Date().toISOString(),
    schemaVersion: WORKOUT_DATA_SCHEMA_VERSION,
  };
}

export function getWorkoutDataSummary(data) {
  return {
    customExercises: arrayOrEmpty(data.exerciseLibrary).filter(
      (exercise) => !exercise.builtin
    ).length,
    history: arrayOrEmpty(data.history).length,
    plans: arrayOrEmpty(data.plans).length,
    sessions: arrayOrEmpty(data.sessions).length,
    templates: arrayOrEmpty(data.templates).length,
  };
}

export function parseWorkoutBackup(rawData, { seedExercises }) {
  const data = rawData?.data && rawData.schemaVersion ? rawData.data : rawData;

  if (!data || typeof data !== "object") {
    throw new Error("This file is not a valid workout backup.");
  }

  const hasWorkoutData =
    Array.isArray(data.templates) ||
    Array.isArray(data.plans) ||
    Array.isArray(data.history) ||
    Array.isArray(data.sessions) ||
    Array.isArray(data.exerciseLibrary) ||
    (data.exerciseMetadata &&
      typeof data.exerciseMetadata === "object" &&
      !Array.isArray(data.exerciseMetadata));

  if (!hasWorkoutData) {
    throw new Error("This file does not contain workout backup data.");
  }

  return normalizeWorkoutData(data, {
    seedExercises,
  });
}
