import test from "node:test";
import assert from "node:assert/strict";

import {
  loadWorkoutData,
  mergeExerciseLibraryWithSeed,
  saveCompletedWorkoutRecovery,
  saveWorkoutData,
} from "../src/storage/workoutStorage.js";

function createStorage() {
  const values = new Map();

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("completed workouts retain a compact synchronous recovery journal", () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    const completedWorkout = {
      completedAtIso: "2026-09-13T19:00:00.000Z",
      id: "completed-today",
      templateName: "Upper body",
    };
    saveWorkoutData(
      {
        exerciseLibrary: [],
        exerciseMetadata: {},
        history: [completedWorkout],
        ownerUserId: "user-1",
        plans: [],
        selectedSessionId: null,
        sessions: [],
        templates: [],
      },
      1
    );
    saveCompletedWorkoutRecovery(completedWorkout, "user-1");

    const restored = loadWorkoutData({ seedExercises: [] });
    assert.deepEqual(restored.history, []);
    assert.equal(restored.ownerUserId, "user-1");
    assert.deepEqual(
      JSON.parse(globalThis.localStorage.getItem("completedWorkoutRecovery")),
      { ownerUserId: "user-1", workout: completedWorkout }
    );
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("saved built-in exercise notes survive seed-library merging", () => {
  const seedExercise = {
    active: "active",
    builtin: true,
    description: "Seed description",
    id: "builtin-row",
    name: "Incline Press",
    note: "Seed note",
  };
  const savedExercise = {
    ...seedExercise,
    description: "Keep wrists stacked over elbows.",
    note: "Keep wrists stacked over elbows.",
  };

  const [restoredExercise] = mergeExerciseLibraryWithSeed(
    [savedExercise],
    [seedExercise]
  );

  assert.equal(restoredExercise.description, savedExercise.description);
  assert.equal(restoredExercise.note, savedExercise.note);

  const [clearedExercise] = mergeExerciseLibraryWithSeed(
    [{ ...savedExercise, description: "", note: "" }],
    [seedExercise]
  );

  assert.equal(clearedExercise.description, "");
  assert.equal(clearedExercise.note, "");
});
