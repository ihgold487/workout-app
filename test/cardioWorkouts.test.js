import assert from "node:assert/strict";
import test from "node:test";
import {
  CARDIO_WORKOUT_FORMATS,
  calculateCardioWorkoutDuration,
  createCardioWorkoutLog,
  getCardioExercises,
  getCardioWorkoutPhases,
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

test("stores a steady-state phase in canonical units", () => {
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
      rounds: 1,
      work: {
        durationSeconds: 1800,
        speedMetersPerSecond: 2.90576,
      },
    }
  );
});

test("calculates HIIT duration using complete work and recovery pairs", () => {
  const prescription = normalizeCardioPrescription({
    format: CARDIO_WORKOUT_FORMATS.hiit,
    values: {
      cooldownDurationSeconds: "300",
      recoveryDurationSeconds: "180",
      recoveryLabel: "Walk",
      rounds: "4",
      warmupDurationSeconds: "300",
      workDurationSeconds: "240",
      workGradePercent: "12",
      workLabel: "Hard climb",
    },
  });

  assert.equal(calculateCardioWorkoutDuration(prescription), 2280);
  assert.equal(prescription.plannedDurationSeconds, 2280);
  assert.deepEqual(
    getCardioWorkoutPhases(prescription).map((phase) => phase.label),
    [
      "Warm-up",
      "Hard climb",
      "Walk",
      "Hard climb",
      "Walk",
      "Hard climb",
      "Walk",
      "Hard climb",
      "Walk",
      "Cool-down",
    ]
  );
});

test("persists the selected color for each cardio phase", () => {
  const prescription = normalizeCardioPrescription({
    format: CARDIO_WORKOUT_FORMATS.hiit,
    values: {
      cooldownColor: "#3f5f9b",
      recoveryColor: "#ea7a17",
      rounds: "1",
      warmupColor: "#ca8a04",
      workColor: "#2f8a6a",
    },
  });

  assert.equal(prescription.warmup.color, "#ca8a04");
  assert.equal(prescription.work.color, "#2f8a6a");
  assert.equal(prescription.recovery.color, "#ea7a17");
  assert.equal(prescription.cooldown.color, "#3f5f9b");
});

test("uses the default phase palette in workout previews", () => {
  const phases = getCardioWorkoutPhases(
    normalizeCardioPrescription({
      format: CARDIO_WORKOUT_FORMATS.hiit,
      values: {
        cooldownDurationSeconds: "60",
        recoveryDurationSeconds: "60",
        rounds: "1",
        warmupDurationSeconds: "60",
        workDurationSeconds: "60",
      },
    })
  );

  assert.deepEqual(
    phases.map((phase) => phase.color),
    ["#ca8a04", "#2f8a6a", "#ea7a17", "#3f5f9b"]
  );
});

test("continues to read the original flat HIIT prescription shape", () => {
  const legacyPrescription = {
    recoveryDurationSeconds: 90,
    rounds: 3,
    workDurationSeconds: 60,
  };

  assert.equal(calculateCardioWorkoutDuration(legacyPrescription), 450);
  assert.deepEqual(
    getCardioWorkoutPhases(legacyPrescription).map((phase) => phase.kind),
    ["work", "recovery", "work", "recovery", "work", "recovery"]
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

test("uses the recorded timer duration over a manual duration override", () => {
  const log = createCardioWorkoutLog(
    {
      exercise: { name: "Treadmill" },
      format: "steady",
      id: "template-1",
      name: "Treadmill easy",
      prescription: {},
    },
    { durationMinutes: "28" },
    "",
    "2026-11-25T10:00:00.000Z",
    1687
  );

  assert.equal(log.results.durationSeconds, 1687);
});

test("omits empty optional completion values", () => {
  assert.deepEqual(normalizeCardioResults({ durationMinutes: "" }), {});
});
