import assert from "node:assert/strict";
import test from "node:test";
import {
  CARDIO_WORKOUT_FORMATS,
  createCardioWorkoutLog,
  getCardioExercises,
  normalizeCardioPrescription,
  normalizeCardioResults,
} from "../src/utils/cardioWorkouts.js";

test("only offers active cardio exercises", () => {
  assert.deepEqual(
    getCardioExercises([
      { id: 1, name: "Bench", trainingModalities: ["strength"] },
      { id: 2, name: "Bike", trainingModalities: ["cardio"] },
      {
        active: "inactive",
        id: 3,
        name: "Treadmill",
        trainingModalities: ["cardio"],
      },
    ]).map((exercise) => exercise.name),
    ["Bike"]
  );
});

test("stores displayed distance, duration, and speed in canonical units", () => {
  assert.deepEqual(
    normalizeCardioPrescription({
      format: CARDIO_WORKOUT_FORMATS.steady,
      values: {
        plannedDistanceMiles: "3.1",
        plannedDurationMinutes: "30",
        speedMph: "6.5",
      },
    }),
    {
      plannedDistanceMeters: 4988.9664,
      plannedDurationSeconds: 1800,
      speedMetersPerSecond: 2.90576,
    }
  );
});

test("snapshots a template when recording a completed cardio workout", () => {
  const log = createCardioWorkoutLog(
    {
      exercise: { name: "Treadmill" },
      format: "steady",
      id: "template-1",
      name: "Treadmill easy",
      prescription: { plannedDurationSeconds: 1800 },
    },
    { durationMinutes: "28", distanceMiles: "3" },
    "Felt good",
    "2026-11-25T10:00:00.000Z"
  );

  assert.deepEqual(log.exercise, { name: "Treadmill" });
  assert.equal(log.notes, "Felt good");
  assert.deepEqual(log.results, {
    distanceMeters: 4828.032,
    durationSeconds: 1680,
  });
  assert.equal(log.startedAt, "2026-11-25T10:00:00.000Z");
  assert.equal(log.templateId, "template-1");
  assert.notEqual(log.prescription, undefined);
});

test("omits empty optional completion values", () => {
  assert.deepEqual(normalizeCardioResults({ durationMinutes: "" }), {});
});
