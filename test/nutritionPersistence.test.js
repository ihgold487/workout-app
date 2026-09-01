import test from "node:test";
import assert from "node:assert/strict";

import { saveNutritionCompatibilityEntries } from "../src/storage/nutritionCompatibilityStorage.js";
import {
  buildProtectedNutritionSnapshot,
  findNutritionEntriesMissingFrom,
  mergeNutritionEntryCollections,
} from "../src/storage/nutritionIntegrity.js";

const olderEntry = {
  calories: 100,
  carbs: 10,
  date: "2026-08-22",
  fat: 2,
  id: 1,
  name: "Older entry",
  protein: 5,
  updatedAt: "2026-08-22T12:00:00.000Z",
};

const recentEntry = {
  calories: 200,
  carbs: 20,
  date: "2026-08-31",
  fat: 4,
  id: 2,
  name: "Recent entry",
  protein: 10,
  updatedAt: "2026-08-31T12:00:00.000Z",
};

test("a failed compatibility-cache write does not throw", () => {
  const warnings = [];
  const saved = saveNutritionCompatibilityEntries("nutrition:test", [recentEntry], {
    logger: { warn: (...args) => warnings.push(args) },
    storage: {
      setItem() {
        throw new Error("Quota exceeded");
      },
    },
  });

  assert.equal(saved, false);
  assert.equal(warnings.length, 1);
});

test("ordinary nutrition persistence cannot remove existing entries", () => {
  const protectedSnapshot = buildProtectedNutritionSnapshot(
    [olderEntry, recentEntry],
    [olderEntry]
  );

  assert.deepEqual(protectedSnapshot, [olderEntry, recentEntry]);
});

test("an explicit delete removes only its requested row from the latest snapshot", () => {
  const unrelatedEntry = {
    ...recentEntry,
    date: "2026-08-30",
    id: 3,
    name: "Unrelated durable entry",
  };
  const snapshot = buildProtectedNutritionSnapshot(
    [olderEntry, recentEntry, unrelatedEntry],
    [olderEntry],
    { removedEntryIds: [recentEntry.id] }
  );

  assert.deepEqual(snapshot, [olderEntry, unrelatedEntry]);
});

test("durable and compatibility collections recover unique rows from either copy", () => {
  const merged = mergeNutritionEntryCollections([olderEntry], [recentEntry]);

  assert.deepEqual(merged, [olderEntry, recentEntry]);
});

test("compatibility-only rows are identified for durable recovery", () => {
  const missing = findNutritionEntriesMissingFrom(
    [olderEntry],
    [olderEntry, recentEntry]
  );

  assert.deepEqual(missing, [recentEntry]);
});
