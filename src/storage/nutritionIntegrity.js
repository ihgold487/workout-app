export function nutritionEntryTimestamp(entry) {
  return Date.parse(entry?.updatedAt || entry?.createdAt || "") || 0;
}

export function mergeNutritionEntryCollections(...collections) {
  const entriesById = new Map();

  collections.forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry?.id === undefined || entry?.id === null) return;

      const id = String(entry.id);
      const existing = entriesById.get(id);

      if (
        !existing ||
        nutritionEntryTimestamp(entry) >= nutritionEntryTimestamp(existing)
      ) {
        entriesById.set(id, entry);
      }
    });
  });

  return [...entriesById.values()].sort(
    (a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );
}

export function buildProtectedNutritionSnapshot(
  existingEntries,
  incomingEntries,
  { removedEntryIds = [] } = {}
) {
  const incoming = Array.isArray(incomingEntries) ? incomingEntries : [];
  const removedIds = new Set(removedEntryIds.map(String));

  return mergeNutritionEntryCollections(existingEntries, incoming).filter(
    (entry) => !removedIds.has(String(entry.id))
  );
}

export function findNutritionEntriesMissingFrom(
  referenceEntries,
  candidateEntries
) {
  const referenceIds = new Set(
    (referenceEntries || []).map((entry) => String(entry?.id))
  );

  return (candidateEntries || []).filter(
    (entry) =>
      entry?.id !== undefined &&
      entry?.id !== null &&
      !referenceIds.has(String(entry.id))
  );
}
