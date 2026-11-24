import test from "node:test";
import assert from "node:assert/strict";

import {
  loadWorkoutData,
  mergeExerciseLibraryWithSeed,
  saveActiveWorkoutSessionRecovery,
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

test("completion recovery prevents its source session from reopening", () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    const sourceSession = {
      id: "session-being-completed",
      startedAtIso: "2026-11-24T16:00:00.000Z",
    };
    const completedWorkout = {
      id: "completed-workout",
      sourceSessionId: sourceSession.id,
    };

    saveWorkoutData(
      {
        exerciseLibrary: [],
        exerciseMetadata: {},
        history: [],
        ownerUserId: "user-1",
        plans: [],
        selectedSessionId: null,
        sessions: [],
        templates: [],
      },
      1
    );
    saveCompletedWorkoutRecovery(completedWorkout, "user-1");

    // Simulate a pre-completion active snapshot that iOS preserved while the
    // app was suspended before the normal effect cleanup could run.
    globalThis.localStorage.setItem(
      "activeWorkoutSessionRecovery",
      JSON.stringify({
        ownerUserId: "user-1",
        selectedSessionId: sourceSession.id,
        session: sourceSession,
        updatedAt: "2026-11-24T17:30:00.000Z",
      })
    );

    const restored = loadWorkoutData({ seedExercises: [] });
    assert.equal(restored.selectedSessionId, null);
    assert.deepEqual(restored.sessions, []);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("completion recovery does not block a newer different active session", () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    saveWorkoutData(
      {
        exerciseLibrary: [],
        exerciseMetadata: {},
        history: [],
        ownerUserId: "user-1",
        plans: [],
        selectedSessionId: null,
        sessions: [],
        templates: [],
      },
      1
    );
    saveCompletedWorkoutRecovery(
      { id: "completed-workout", sourceSessionId: "old-session" },
      "user-1"
    );
    saveActiveWorkoutSessionRecovery({
      ownerUserId: "user-1",
      selectedSessionId: "new-session",
      sessions: [{ id: "new-session" }],
    });

    const restored = loadWorkoutData({ seedExercises: [] });
    assert.equal(restored.selectedSessionId, "new-session");
    assert.deepEqual(restored.sessions, [{ id: "new-session" }]);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("target attribute defaults persist independently of workout collections", () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    const targetAttributeDefaults = {
      minRepDeviation: -2,
      maxRepDeviation: 3,
      progressionPercent: 0.015,
      maxProgressionPercent: 0.025,
    };
    saveWorkoutData(
      {
        exerciseLibrary: [],
        exerciseMetadata: {},
        history: [],
        ownerUserId: "user-1",
        plans: [],
        selectedSessionId: null,
        sessions: [],
        targetAttributeDefaults,
        templates: [],
      },
      1
    );

    const restored = loadWorkoutData({ seedExercises: [] });
    assert.deepEqual(restored.targetAttributeDefaults, targetAttributeDefaults);
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
