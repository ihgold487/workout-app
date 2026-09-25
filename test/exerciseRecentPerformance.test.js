import test from "node:test";
import assert from "node:assert/strict";

import { buildRecentPerformanceByExerciseId } from "../src/utils/exerciseRecentPerformance.js";

test("indexes the latest matching exercise performance in one history pass", () => {
  const recentPerformance = buildRecentPerformanceByExerciseId({
    exerciseLibrary: [
      { equipment: ["Dumbbell"], id: "press", name: "Dumbbell Press" },
      { equipment: ["Cable"], id: "row", name: "Cable Row" },
    ],
    history: [
      {
        completedAtIso: "2026-08-01T12:00:00.000Z",
        exercises: [
          { equipment: ["Dumbbells"], name: "Dumbbell Press", sets: [{}, {}] },
          { equipment: ["Cable"], name: "Cable Row", sets: [{}] },
        ],
      },
      {
        completedAtIso: "2026-08-08T12:00:00.000Z",
        exercises: [
          { equipment: ["Dumbbell"], name: "Dumbbell Press", sets: [{}] },
        ],
      },
    ],
  });

  assert.deepEqual(recentPerformance.get("press"), {
    completedAt: "2026-08-08T12:00:00.000Z",
    setCount: 1,
    time: Date.parse("2026-08-08T12:00:00.000Z"),
  });
  assert.equal(recentPerformance.get("row")?.setCount, 1);
});
