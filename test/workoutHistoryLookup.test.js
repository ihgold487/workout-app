import test from "node:test";
import assert from "node:assert/strict";

import {
  findLatestExercisePerformance,
  isHistoryWorkoutDeload,
} from "../src/utils/workoutHistoryLookup.js";

const exercise = {
  exerciseId: "press",
  name: "Seated Press",
  equipment: ["Barbell"],
  sets: [{ reps: "9", rir: "3" }],
};
const plans = [
  {
    config: { deload: true },
    durationWeeks: 4,
    id: "previous-plan",
  },
  {
    config: { deload: true },
    durationWeeks: 4,
    id: "new-plan",
  },
];
const history = [
  {
    completedAtIso: "2026-08-29T12:00:00.000Z",
    exercises: [
      {
        ...exercise,
        sets: [{ actualWeight: "100", actualReps: "9", actualRir: "3", reps: "9", rir: "3" }],
      },
    ],
    id: "deload-workout",
    planId: "previous-plan",
    planWeek: 5,
  },
  {
    completedAtIso: "2026-08-22T12:00:00.000Z",
    exercises: [
      {
        ...exercise,
        sets: [{ actualWeight: "125", actualReps: "9", actualRir: "3", reps: "9", rir: "3" }],
      },
    ],
    id: "training-workout",
    planId: "previous-plan",
    planWeek: 4,
  },
];

test("normal training prefers older normal performance over a newer deload", () => {
  const performance = findLatestExercisePerformance({
    currentIsDeload: false,
    exercise,
    history,
    plan: plans[1],
    planWeek: 1,
    planWorkoutId: "new-workout",
    plans,
    templateId: "new-template",
  });

  assert.equal(performance?.workout.id, "training-workout");
});

test("a deload prefers deload history before normal training history", () => {
  const performance = findLatestExercisePerformance({
    currentIsDeload: true,
    exercise,
    history,
    plan: plans[1],
    planWeek: 5,
    planWorkoutId: "new-workout",
    plans,
    templateId: "new-template",
  });

  assert.equal(performance?.workout.id, "deload-workout");
});

test("normal training falls back to deload history when no normal result exists", () => {
  const performance = findLatestExercisePerformance({
    currentIsDeload: false,
    exercise,
    history: [history[0]],
    plan: plans[1],
    planWeek: 1,
    planWorkoutId: "new-workout",
    plans,
    templateId: "new-template",
  });

  assert.equal(performance?.workout.id, "deload-workout");
});

test("RIR 5 prescriptions identify legacy deload history without plan metadata", () => {
  assert.equal(
    isHistoryWorkoutDeload({
      exercises: [
        {
          sets: [
            { prescribedRir: "5" },
            { rir: "5" },
            { isDropSet: true, prescribedRir: "0" },
          ],
        },
      ],
    }),
    true
  );
});

test("exercise-level RIR 5 identifies a deload when another exercise masks the workout-wide signal", () => {
  const mixedMetadataDeload = {
    completedAtIso: "2026-08-29T12:00:00.000Z",
    exercises: [
      {
        ...exercise,
        sets: [
          {
            actualReps: "9",
            actualRir: "5",
            actualWeight: "100",
            prescribedRir: "5",
            reps: "9",
          },
        ],
      },
      {
        exerciseId: "other",
        name: "Other exercise",
        sets: [{ prescribedRir: "3", reps: "10" }],
      },
    ],
    id: "mixed-metadata-deload",
  };
  const performance = findLatestExercisePerformance({
    currentIsDeload: false,
    exercise,
    history: [mixedMetadataDeload, history[1]],
    plan: plans[1],
    planWeek: 1,
    planWorkoutId: "new-workout",
    plans,
    templateId: "new-template",
  });

  assert.equal(performance?.workout.id, "training-workout");
});

test("actual RIR 5 identifies legacy deload sets when prescription metadata is absent", () => {
  const legacyDeload = {
    completedAtIso: "2026-08-29T12:00:00.000Z",
    exercises: [
      {
        exerciseId: "press",
        name: "Seated Press",
        equipment: ["Barbell"],
        sets: [
          { actualReps: "9", actualRir: "5", actualWeight: "100" },
          { actualReps: "9", actualRir: "5", actualWeight: "100" },
        ],
      },
    ],
    id: "legacy-deload",
  };
  const performance = findLatestExercisePerformance({
    currentIsDeload: false,
    exercise,
    history: [legacyDeload, history[1]],
    plan: plans[1],
    planWeek: 1,
    planWorkoutId: "new-workout",
    plans,
    templateId: "new-template",
  });

  assert.equal(performance?.workout.id, "training-workout");
});
