import { db } from "../db";
import {
  deleteNutritionEntry,
  downloadNutritionEntryChanges,
  readPendingNutritionDeletes,
  uploadNutritionEntries,
} from "../sync/nutritionCloudSync";
import {
  deleteBodyWeightEntry,
  upsertBodyWeightEntry,
} from "../sync/bodyMeasurementCloudSync";
import { upsertNutritionTarget } from "../sync/nutritionTargetCloudSync";
import { upsertCreatineReminderSettings } from "../sync/creatineReminderCloudSync";
import {
  buildProtectedNutritionSnapshot,
  mergeNutritionEntryCollections,
  nutritionEntryTimestamp,
} from "./nutritionIntegrity";

export { mergeNutritionEntryCollections } from "./nutritionIntegrity";

const SNAPSHOT_PREFIX = "nutrition:";
const MAX_NUTRITION_BACKUPS = 20;
export const NUTRITION_OUTBOX_QUEUED_EVENT = "workout:nutrition-outbox-queued";
const syncPromises = new Map();
const reconcilePromises = new Map();
const mutationPromises = new Map();

function normalizeUserId(userId) {
  return userId || "local";
}

function snapshotId(userId) {
  return `${SNAPSHOT_PREFIX}${normalizeUserId(userId)}`;
}

function outboxId(userId, entryId) {
  return `${normalizeUserId(userId)}:entry:${String(entryId)}`;
}

function normalizeNutritionEntry(entry) {
  if (
    !entry ||
    entry.id === undefined ||
    entry.id === null ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || "")) ||
    !String(entry.name || "").trim()
  ) {
    return null;
  }

  const nutrients = ["calories", "carbs", "fat", "protein"];
  const normalized = { ...entry, name: String(entry.name).trim() };

  for (const nutrient of nutrients) {
    const value = Number(entry[nutrient] ?? 0);

    if (!Number.isFinite(value) || value < 0) return null;
    normalized[nutrient] = value;
  }

  return normalized;
}

export function inspectNutritionEntries(entries) {
  const valid = [];
  const invalid = [];
  const duplicateIds = [];
  const seenIds = new Set();

  (entries || []).forEach((entry) => {
    const normalized = normalizeNutritionEntry(entry);

    if (!normalized) {
      invalid.push(entry);
      return;
    }

    const id = String(normalized.id);
    if (seenIds.has(id)) duplicateIds.push(id);
    seenIds.add(id);
    valid.push(normalized);
  });

  return { duplicateIds, invalid, valid };
}

async function backupNutritionEntriesUnlocked(userId, entries, reason) {
  if (!Array.isArray(entries) || entries.length === 0) return;

  const normalizedUserId = normalizeUserId(userId);
  const createdAt = new Date().toISOString();

  await db.nutritionBackups.put({
    createdAt,
    entries,
    id: `${snapshotId(userId)}:${createdAt}:${Math.random().toString(36).slice(2)}`,
    reason,
    userId: normalizedUserId,
  });

  const backups = await db.nutritionBackups
    .where("userId")
    .equals(normalizedUserId)
    .sortBy("createdAt");
  const excess = backups.slice(
    0,
    Math.max(0, backups.length - MAX_NUTRITION_BACKUPS)
  );

  if (excess.length > 0) {
    await db.nutritionBackups.bulkDelete(excess.map((backup) => backup.id));
  }
}

function enqueueNutritionMutation(userId, operation) {
  const key = normalizeUserId(userId);
  const previous = mutationPromises.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);

  mutationPromises.set(key, next);
  return next.finally(() => {
    if (mutationPromises.get(key) === next) {
      mutationPromises.delete(key);
    }
  });
}

async function waitForNutritionMutations(userId) {
  await mutationPromises.get(normalizeUserId(userId));
}

function notifyNutritionOutboxQueued() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NUTRITION_OUTBOX_QUEUED_EVENT));
  }
}

export async function loadNutritionSnapshot(userId) {
  const snapshot = await db.nutritionSnapshots.get(snapshotId(userId));

  return Array.isArray(snapshot?.entries) ? snapshot.entries : null;
}

export async function initializeNutritionPersistence(userId, legacyEntries) {
  const id = snapshotId(userId);
  const legacyDeletes = userId ? readPendingNutritionDeletes(userId) : [];

  return db.transaction(
    "rw",
    db.nutritionSnapshots,
    db.nutritionOutbox,
    async () => {
      const existing = await db.nutritionSnapshots.get(id);

      if (existing) {
        return Array.isArray(existing.entries) ? existing.entries : [];
      }

      const entries = Array.isArray(legacyEntries) ? legacyEntries : [];
      const now = new Date().toISOString();

      await db.nutritionSnapshots.put({
        entries,
        id,
        migratedAt: now,
        updatedAt: now,
        userId: normalizeUserId(userId),
      });

      if (legacyDeletes.length > 0) {
        await db.nutritionOutbox.bulkPut(
          legacyDeletes.map((record) => ({
            entryId: record.id,
            id: outboxId(userId, record.id),
            operation: "delete",
            updatedAt: record.deletedAt || now,
            userId,
          }))
        );
      }

      return entries;
    }
  );
}

async function persistNutritionEntriesUnlocked(
  userId,
  entries,
  { removedEntryIds = [] } = {}
) {
  const id = snapshotId(userId);
  const existing = await db.nutritionSnapshots.get(id);
  const nextEntries = buildProtectedNutritionSnapshot(
    existing?.entries,
    entries,
    { removedEntryIds }
  );

  if (
    Array.isArray(existing?.entries) &&
    JSON.stringify(existing.entries) !== JSON.stringify(nextEntries)
  ) {
    await backupNutritionEntriesUnlocked(
      userId,
      existing.entries,
      "before-snapshot-write"
    );
  }

  await db.nutritionSnapshots.put({
    ...(existing || {}),
    entries: nextEntries,
    id,
    updatedAt: new Date().toISOString(),
    userId: normalizeUserId(userId),
  });

  return nextEntries;
}

export async function persistNutritionEntries(userId, entries, options) {
  return enqueueNutritionMutation(userId, () =>
    persistNutritionEntriesUnlocked(userId, entries, options)
  );
}

export async function queueNutritionUpserts(userId, entries, snapshotEntries) {
  const integrity = inspectNutritionEntries(entries || []);
  const validEntries = integrity.valid;

  if (integrity.invalid.length > 0) {
    throw new Error(
      `${integrity.invalid.length} nutrition entr${
        integrity.invalid.length === 1 ? "y has" : "ies have"
      } invalid identity, date, or nutrient values.`
    );
  }

  if (!userId || validEntries.length === 0) {
    await persistNutritionEntries(userId, snapshotEntries);
    return;
  }

  const now = new Date().toISOString();

  await enqueueNutritionMutation(userId, () =>
    db.transaction(
      "rw",
      db.nutritionSnapshots,
      db.nutritionOutbox,
      db.nutritionBackups,
      async () => {
        await persistNutritionEntriesUnlocked(userId, snapshotEntries);
        await db.nutritionOutbox.bulkPut(
          validEntries.map((entry) => ({
            entry,
            id: outboxId(userId, entry.id),
            operation: "upsert",
            updatedAt: now,
            userId,
          }))
        );
      }
    )
  );
  notifyNutritionOutboxQueued();
}

export async function queueNutritionDelete(
  userId,
  entryId,
  snapshotEntries,
  deletedEntry = null
) {
  if (!userId) {
    await persistNutritionEntries(userId, snapshotEntries, {
      removedEntryIds: [entryId],
    });
    return;
  }

  const now = new Date().toISOString();

  await enqueueNutritionMutation(userId, () =>
    db.transaction(
      "rw",
      db.nutritionSnapshots,
      db.nutritionOutbox,
      db.nutritionBackups,
      async () => {
        await persistNutritionEntriesUnlocked(userId, snapshotEntries, {
          removedEntryIds: [entryId],
        });
        await db.nutritionOutbox.put({
          entry: deletedEntry,
          entryId,
          id: outboxId(userId, entryId),
          operation: "delete",
          updatedAt: now,
          userId,
        });
      }
    )
  );
  notifyNutritionOutboxQueued();
}

export async function queueBodyWeightUpsert(userId, entry) {
  if (!userId || !entry?.date) return;

  await db.nutritionOutbox.put({
    entry,
    id: `${userId}:body-weight:${entry.date}`,
    operation: "body-weight-upsert",
    updatedAt: new Date().toISOString(),
    userId,
  });
  notifyNutritionOutboxQueued();
}

export async function queueBodyWeightDelete(userId, entryDate) {
  if (!userId || !entryDate) return;

  await db.nutritionOutbox.put({
    entryDate,
    id: `${userId}:body-weight:${entryDate}`,
    operation: "body-weight-delete",
    updatedAt: new Date().toISOString(),
    userId,
  });
  notifyNutritionOutboxQueued();
}

export async function queueNutritionTargetUpsert(userId, target) {
  if (!userId || !target?.date) return;

  await db.nutritionOutbox.put({
    id: `${userId}:nutrition-target:${target.date}`,
    operation: "nutrition-target-upsert",
    target,
    updatedAt: new Date().toISOString(),
    userId,
  });
  notifyNutritionOutboxQueued();
}

export async function queueCreatineReminderSettingsUpsert(userId, settings) {
  if (!userId || !settings) return;

  await db.nutritionOutbox.put({
    id: `${userId}:creatine-reminder-settings`,
    operation: "creatine-reminder-settings-upsert",
    settings: {
      enabled: Boolean(settings.enabled),
      time: settings.time,
      updatedAt: settings.updatedAt || new Date().toISOString(),
    },
    updatedAt: settings.updatedAt || new Date().toISOString(),
    userId,
  });
  notifyNutritionOutboxQueued();
}

export async function getNutritionOutbox(userId) {
  if (!userId) return [];

  return db.nutritionOutbox.where("userId").equals(userId).sortBy("updatedAt");
}

export async function getNutritionOutboxCount(userId) {
  if (!userId) return 0;

  return db.nutritionOutbox.where("userId").equals(userId).count();
}

export async function acknowledgeNutritionOutboxItem(id, expectedUpdatedAt = null) {
  await db.transaction("rw", db.nutritionOutbox, async () => {
    const currentItem = await db.nutritionOutbox.get(id);

    if (
      currentItem &&
      (expectedUpdatedAt == null || currentItem.updatedAt === expectedUpdatedAt)
    ) {
      await db.nutritionOutbox.delete(id);
    }
  });
}

export async function flushNutritionOutbox(userId, session) {
  const existingPromise = syncPromises.get(userId);

  if (existingPromise) return existingPromise;

  const promise = flushNutritionOutboxUnlocked(userId, session).finally(() => {
    syncPromises.delete(userId);
  });

  syncPromises.set(userId, promise);
  return promise;
}

async function flushNutritionOutboxUnlocked(userId, session) {
  await waitForNutritionMutations(userId);

  const failed = [];
  const remoteDeletedIds = [];
  const queuedItems = await getNutritionOutbox(userId);
  const nutritionUpserts = queuedItems.filter(
    (item) => item.operation === "upsert"
  );

  if (nutritionUpserts.length > 0) {
    try {
      const result = await uploadNutritionEntries(
        nutritionUpserts.map((item) => item.entry),
        session
      );

      if (result.uploaded !== nutritionUpserts.length) {
        throw new Error("Supabase did not confirm every nutrition entry upload.");
      }

      await Promise.all(
        nutritionUpserts.map((item) =>
          acknowledgeNutritionOutboxItem(item.id, item.updatedAt)
        )
      );
    } catch (error) {
      nutritionUpserts.forEach((item) => {
        failed.push({
          error: error.message,
          id: item.entry?.id,
          operation: item.operation,
        });
      });
    }
  }

  for (const item of queuedItems.filter((item) => item.operation !== "upsert")) {
    try {
      let result = null;

      if (item.operation === "body-weight-delete") {
        result = await deleteBodyWeightEntry(item.entryDate, session);
      } else if (item.operation === "body-weight-upsert") {
        result = await upsertBodyWeightEntry(item.entry, session);
      } else if (item.operation === "nutrition-target-upsert") {
        result = await upsertNutritionTarget(item.target, session);
      } else if (item.operation === "creatine-reminder-settings-upsert") {
        result = await upsertCreatineReminderSettings(item.settings, session);
      } else if (item.operation === "delete") {
        result = await deleteNutritionEntry(
          item.entryId,
          session,
          item.entry,
          item.updatedAt
        );
      }

      if (result?.applied !== true) {
        throw new Error("Supabase did not confirm that the change was applied.");
      }

      await acknowledgeNutritionOutboxItem(item.id, item.updatedAt);
    } catch (error) {
      failed.push({
        error: error.message,
        id: item.entryId ?? item.entry?.id,
        operation: item.operation,
      });
    }
  }

  return {
    failed,
    remoteDeletedIds,
    remaining: await getNutritionOutbox(userId),
  };
}

export async function recoverNutritionEntries(
  userId,
  candidateEntries = [],
  excludedEntryIds = []
) {
  await waitForNutritionMutations(userId);

  const result = await enqueueNutritionMutation(userId, async () => {
    const snapshot = await db.nutritionSnapshots.get(snapshotId(userId));
    const backups = await db.nutritionBackups
      .where("userId")
      .equals(normalizeUserId(userId))
      .toArray();
    const currentEntries = Array.isArray(snapshot?.entries)
      ? snapshot.entries
      : [];
    const excludedIds = new Set(excludedEntryIds.map(String));
    const recovered = mergeNutritionEntryCollections(
      ...backups.map((backup) => backup.entries),
      candidateEntries,
      currentEntries
    ).filter((entry) => !excludedIds.has(String(entry.id)));
    const integrity = inspectNutritionEntries(recovered);
    const currentIds = new Set(currentEntries.map((entry) => String(entry.id)));
    const added = integrity.valid.filter(
      (entry) => !currentIds.has(String(entry.id))
    );
    const nextEntries = mergeNutritionEntryCollections(currentEntries, added);

    if (added.length > 0) {
      await backupNutritionEntriesUnlocked(userId, currentEntries, "before-recovery");
      await persistNutritionEntriesUnlocked(userId, nextEntries);
    }

    return {
      added: added.length,
      addedEntries: added,
      backupCount: backups.length,
      entries: nextEntries,
      invalid: integrity.invalid.length,
    };
  });

  if (userId && result.addedEntries.length > 0) {
    await queueNutritionUpserts(userId, result.addedEntries, result.entries);
  }

  return result;
}

export async function reconcileNutritionEntries(userId, session, options = {}) {
  const existingPromise = reconcilePromises.get(userId);

  if (existingPromise) return existingPromise;

  const promise = reconcileNutritionEntriesUnlocked(
    userId,
    session,
    options
  ).finally(() => {
    reconcilePromises.delete(userId);
  });

  reconcilePromises.set(userId, promise);
  return promise;
}

async function reconcileNutritionEntriesUnlocked(userId, session, options = {}) {
  await waitForNutritionMutations(userId);

  const snapshot = await db.nutritionSnapshots.get(snapshotId(userId));
  const localEntries = Array.isArray(options.entries)
    ? options.entries
    : snapshot?.entries || [];
  const since = options.full ? null : snapshot?.lastPulledAt || null;
  const pullStartedAt = new Date().toISOString();
  const flushResult = await flushNutritionOutbox(userId, session);
  const remaining = flushResult.remaining;
  const pendingDeleteIds = new Set(
    remaining
      .filter((item) => item.operation === "delete")
      .map((item) => String(item.entryId))
  );
  const pendingUpsertIds = new Set(
    remaining
      .filter((item) => item.operation === "upsert")
      .map((item) => String(item.entry?.id))
  );
  const remoteDeletedIds = new Set(flushResult.remoteDeletedIds);
  const entriesById = new Map(
    localEntries.map((entry) => [String(entry.id), entry])
  );
  const changes = await downloadNutritionEntryChanges(session, since);

  changes.forEach(({ deletedAt, entry }) => {
    const id = String(entry.id);

    if (pendingDeleteIds.has(id)) return;

    if (deletedAt) {
      if (!pendingUpsertIds.has(id)) entriesById.delete(id);
      return;
    }

    const local = entriesById.get(id);
    if (
      !local ||
      nutritionEntryTimestamp(entry) >= nutritionEntryTimestamp(local)
    ) {
      entriesById.set(id, entry);
    }
  });
  remoteDeletedIds.forEach((id) => entriesById.delete(String(id)));

  let entries = [...entriesById.values()];

  // A first/full pull can prove which legacy local IDs never reached cloud.
  if (!since) {
    const cloudIds = new Set(
      changes.filter((change) => !change.deletedAt).map((change) => String(change.entry.id))
    );
    const tombstoneIds = new Set(
      changes.filter((change) => change.deletedAt).map((change) => String(change.entry.id))
    );
    const missingEntries = entries.filter(
      (entry) =>
        !cloudIds.has(String(entry.id)) &&
        !tombstoneIds.has(String(entry.id)) &&
        !pendingDeleteIds.has(String(entry.id)) &&
        !pendingUpsertIds.has(String(entry.id))
    );

    if (missingEntries.length > 0) {
      await queueNutritionUpserts(userId, missingEntries, entries);
      const discoveryFlush = await flushNutritionOutbox(userId, session);

      flushResult.failed.push(...discoveryFlush.failed);
    }
  }

  entries = await enqueueNutritionMutation(userId, async () => {
    const latestSnapshot = await db.nutritionSnapshots.get(snapshotId(userId));
    const latestOutbox = await getNutritionOutbox(userId);
    const latestPendingDeletes = new Set(
      latestOutbox
        .filter((item) => item.operation === "delete")
        .map((item) => String(item.entryId))
    );
    const latestPendingUpserts = latestOutbox
      .filter((item) => item.operation === "upsert" && item.entry)
      .map((item) => item.entry);
    const downloadedDeleteIds = new Set(
      changes
        .filter((change) => change.deletedAt)
        .map((change) => String(change.entry.id))
    );
    const latestPendingUpsertIds = new Set(
      latestPendingUpserts.map((entry) => String(entry.id))
    );
    const latestLocalEntries = Array.isArray(latestSnapshot?.entries)
      ? latestSnapshot.entries
      : localEntries;
    const downloadedEntries = changes
      .filter((change) => !change.deletedAt)
      .map((change) => change.entry);
    const mergedEntries = mergeNutritionEntryCollections(
      latestLocalEntries,
      downloadedEntries,
      latestPendingUpserts
    ).filter((entry) => {
      const id = String(entry.id);

      if (latestPendingDeletes.has(id)) return false;
      return !downloadedDeleteIds.has(id) || latestPendingUpsertIds.has(id);
    });

    if (
      Array.isArray(latestSnapshot?.entries) &&
      JSON.stringify(latestSnapshot.entries) !== JSON.stringify(mergedEntries)
    ) {
      await backupNutritionEntriesUnlocked(
        userId,
        latestSnapshot.entries,
        "before-cloud-reconcile"
      );
    }

    await db.nutritionSnapshots.put({
      ...(latestSnapshot || snapshot || {}),
      entries: mergedEntries,
      id: snapshotId(userId),
      lastPulledAt: pullStartedAt,
      lastReconciledAt: pullStartedAt,
      updatedAt: new Date().toISOString(),
      userId,
    });

    return mergedEntries;
  });

  return {
    changes: changes.length,
    deletedIds: changes
      .filter((change) => change.deletedAt)
      .map((change) => String(change.entry.id)),
    entries,
    failed: flushResult.failed,
    full: !since,
    pending: await getNutritionOutboxCount(userId),
    reconciledAt: pullStartedAt,
  };
}

export async function getNutritionPersistenceStatus(userId) {
  const snapshot = await db.nutritionSnapshots.get(snapshotId(userId));
  const integrity = inspectNutritionEntries(snapshot?.entries || []);

  return {
    backups: await db.nutritionBackups
      .where("userId")
      .equals(normalizeUserId(userId))
      .count(),
    invalid: integrity.invalid.length,
    lastPulledAt: snapshot?.lastPulledAt || null,
    lastReconciledAt: snapshot?.lastReconciledAt || null,
    local: Array.isArray(snapshot?.entries) ? snapshot.entries.length : 0,
    pending: await getNutritionOutboxCount(userId),
    oldestPendingAt: (await getNutritionOutbox(userId))[0]?.updatedAt || null,
  };
}
