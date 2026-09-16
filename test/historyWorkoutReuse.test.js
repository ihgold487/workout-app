import test from "node:test";
import assert from "node:assert/strict";
import { buildStandaloneTemplateFromHistory } from "../src/utils/historyWorkoutReuse.js";

test("completed workout reuse preserves prescriptions without actuals or plan linkage", () => {
  const result = buildStandaloneTemplateFromHistory(
    {
      templateId: 12,
      planId: 4,
      planWeek: 3,
      planWorkoutId: 8,
      exercises: [
        {
          id: 90,
          exerciseId: 22,
          name: "Bench Press",
          supersetGroup: "A",
          sets: [
            {
              actualReps: "8",
              actualRir: "2",
              actualWeight: "185",
              completed: true,
              minimumReps: "6",
              prescribedReps: "8",
              prescribedRestSeconds: 150,
              prescribedRir: "3",
            },
            {
              actualReps: "AMRAP",
              actualWeight: "135",
              completed: true,
              isDropSet: true,
              prescribedReps: "AMRAP",
              prescribedRir: "0",
            },
          ],
        },
      ],
    },
    { id: 1000, name: "Bench repeat" }
  );

  assert.equal(result.name, "Bench repeat");
  assert.equal(result.planId, null);
  assert.equal(result.planWeek, null);
  assert.equal(result.planWorkoutId, null);
  assert.equal(result.parentWorkoutId, 12);
  assert.equal(result.exercises[0].supersetGroup, "A");
  assert.deepEqual(result.exercises[0].sets[0], {
    id: 2000,
    minimumReps: "6",
    reps: "8",
    restSeconds: 150,
    rir: "3",
  });
  assert.deepEqual(result.exercises[0].sets[1], {
    id: 2001,
    isDropSet: true,
    reps: "AMRAP",
    rir: "0",
  });
});

test("legacy history falls back to actual reps and RIR but never actual weight", () => {
  const result = buildStandaloneTemplateFromHistory(
    {
      exercises: [
        {
          id: 3,
          name: "Legacy Exercise",
          sets: [
            {
              actualReps: "10",
              actualRir: "2.5",
              actualWeight: "127.5",
              completed: true,
            },
          ],
        },
      ],
    },
    { id: 2000, name: "Legacy repeat" }
  );

  assert.deepEqual(result.exercises[0].sets[0], {
    id: 3000,
    reps: "10",
    rir: "2.5",
  });
  assert.equal("actualWeight" in result.exercises[0].sets[0], false);
  assert.equal("completed" in result.exercises[0].sets[0], false);
});
