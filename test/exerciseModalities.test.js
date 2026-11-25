import test from "node:test";
import assert from "node:assert/strict";

import {
  getExerciseModalities,
  hasExerciseModality,
  isStrengthExercise,
} from "../src/utils/exerciseModalities.js";

test("legacy exercises remain strength exercises by default", () => {
  const exercise = { name: "Bench Press" };

  assert.deepEqual(getExerciseModalities(exercise), ["strength"]);
  assert.equal(isStrengthExercise(exercise), true);
});

test("an exercise can participate in more than one training modality", () => {
  const exercise = {
    name: "Forward Lunges",
    trainingModalities: ["strength", "conditioning", "strength"],
  };

  assert.deepEqual(getExerciseModalities(exercise), [
    "strength",
    "conditioning",
  ]);
  assert.equal(hasExerciseModality(exercise, "strength"), true);
  assert.equal(hasExerciseModality(exercise, "conditioning"), true);
});

test("cardio-only exercises are excluded from strength selection", () => {
  const exercise = {
    name: "Cycling on Stationary Bike",
    trainingModalities: ["cardio", "conditioning"],
  };

  assert.equal(hasExerciseModality(exercise, "cardio"), true);
  assert.equal(isStrengthExercise(exercise), false);
});
