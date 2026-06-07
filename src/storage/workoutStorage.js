export const WORKOUT_DATA_SCHEMA_VERSION = 1;

const STORAGE_VERSION_KEY = "storageVersion";

const WORKOUT_DATA_KEYS = {
  exerciseLibrary: "exerciseLibrary",
  exerciseMetadata: "exerciseMetadata",
  history: "history",
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
  localStorage.setItem(key, JSON.stringify(value));
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function mergeExerciseLibraryWithSeed(exerciseLibrary, seedExercises) {
  const customExercises = arrayOrEmpty(exerciseLibrary).filter(
    (exercise) => !exercise.builtin
  );

  return [...seedExercises, ...customExercises];
}

export function loadWorkoutData({ seedExercises }) {
  return {
    exerciseLibrary: mergeExerciseLibraryWithSeed(
      readJson(WORKOUT_DATA_KEYS.exerciseLibrary, []),
      seedExercises
    ),
    exerciseMetadata: objectOrEmpty(
      readJson(WORKOUT_DATA_KEYS.exerciseMetadata, {})
    ),
    history: arrayOrEmpty(readJson(WORKOUT_DATA_KEYS.history, [])),
    selectedSessionId: readJson(WORKOUT_DATA_KEYS.selectedSessionId, null),
    sessions: arrayOrEmpty(readJson(WORKOUT_DATA_KEYS.sessions, [])),
    templates: arrayOrEmpty(readJson(WORKOUT_DATA_KEYS.templates, [])),
  };
}

export function saveWorkoutData(data, storageVersion) {
  writeJson(WORKOUT_DATA_KEYS.exerciseLibrary, data.exerciseLibrary);
  writeJson(WORKOUT_DATA_KEYS.exerciseMetadata, data.exerciseMetadata);
  writeJson(WORKOUT_DATA_KEYS.history, data.history);
  writeJson(WORKOUT_DATA_KEYS.selectedSessionId, data.selectedSessionId);
  writeJson(WORKOUT_DATA_KEYS.sessions, data.sessions);
  writeJson(WORKOUT_DATA_KEYS.templates, data.templates);
  writeJson(STORAGE_VERSION_KEY, storageVersion);
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
      selectedSessionId: data.selectedSessionId ?? null,
      sessions: arrayOrEmpty(data.sessions),
      templates: arrayOrEmpty(data.templates),
    },
    exportedAt: new Date().toISOString(),
    schemaVersion: WORKOUT_DATA_SCHEMA_VERSION,
  };
}

export function parseWorkoutBackup(rawData, { seedExercises }) {
  const data = rawData?.data && rawData.schemaVersion ? rawData.data : rawData;

  return {
    exerciseLibrary: mergeExerciseLibraryWithSeed(
      data?.exerciseLibrary,
      seedExercises
    ),
    exerciseMetadata: objectOrEmpty(data?.exerciseMetadata),
    history: arrayOrEmpty(data?.history),
    selectedSessionId: data?.selectedSessionId ?? null,
    sessions: arrayOrEmpty(data?.sessions),
    templates: arrayOrEmpty(data?.templates),
  };
}
