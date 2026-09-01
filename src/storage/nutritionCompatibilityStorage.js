export function saveNutritionCompatibilityEntries(
  storageKey,
  entries,
  { logger = console, storage = globalThis.localStorage } = {}
) {
  if (!storage) return false;

  try {
    storage.setItem(storageKey, JSON.stringify(entries));
    return true;
  } catch (error) {
    logger.warn(
      `Failed to update the ${storageKey} compatibility cache; durable nutrition persistence will continue:`,
      error
    );
    return false;
  }
}
