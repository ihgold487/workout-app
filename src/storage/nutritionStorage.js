import { db } from "../db";
import {
  deleteNutritionEntry,
  downloadNutritionEntryChanges,
  readPendingNutritionDeletes,
  upsertNutritionEntry,
} from "../sync/nutritionCloudSync";
import {
  deleteBodyWeightEntry,
  upsertBodyWeightEntry,
} from "../sync/bodyMeasurementCloudSync";
import { upsertNutritionTarget } from "../sync/nutritionTargetCloudSync";

const SNAPSHOT_PREFIX = "nutrition:";
const syncPromises = new Map();
const reconcilePromises = new Map();

function normalizeUserId(userId) {
  return userId || "local";
}

function snapshotId(userId) {
  return `${SNAPSHOT_PREFIX}${normalizeUserId(userId)}`;
}

function outboxId(userId, entryId) {
  return `${normalizeUserId(userId)}:entry:${String(entryId)}`;
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

export async function persistNutritionEntries(userId, entries) {
  const id = snapshotId(userId);
  const existing = await db.nutritionSnapshots.get(id);

  await db.nutritionSnapshots.put({
    ...(existing || {}),
    entries: Array.isArray(entries) ? entries : [],
    id,
    updatedAt: new Date().toISOString(),
    userId: normalizeUserId(userId),
  });
}

export async function queueNutritionUpserts(userId, entries, snapshotEntries) {
  const validEntries = (entries || []).filter(
    (entry) => entry?.id !== undefined && entry?.date && entry?.name
  );

  if (!userId || validEntries.length === 0) {
    await persistNutritionEntries(userId, snapshotEntries);
    return;
  }

  const now = new Date().toISOString();

  await db.transaction(
    "rw",
    db.nutritionSnapshots,
    db.nutritionOutbox,
    async () => {
      await persistNutritionEntries(userId, snapshotEntries);
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
  );
}

export async function queueNutritionDelete(
  userId,
  entryId,
  snapshotEntries,
  deletedEntry = null
) {
  if (!userId) {
    await persistNutritionEntries(userId, snapshotEntries);
    return;
  }

  const now = new Date().toISOString();

  await db.transaction(
    "rw",
    db.nutritionSnapshots,
    db.nutritionOutbox,
    async () => {
      await persistNutritionEntries(userId, snapshotEntries);
      await db.nutritionOutbox.put({
        entry: deletedEntry,
        entryId,
        id: outboxId(userId, entryId),
        operation: "delete",
        updatedAt: now,
        userId,
      });
    }
  );
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
}

export async function getNutritionOutbox(userId) {
  if (!userId) return [];

  return db.nutritionOutbox.where("userId").equals(userId).sortBy("updatedAt");
}

export async function getNutritionOutboxCount(userId) {
  if (!userId) return 0;

  return db.nutritionOutbox.where("userId").equals(userId).count();
}

export async function acknowledgeNutritionOutboxItem(id) {
  await db.nutritionOutbox.delete(id);
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
  const failed = [];
  const remoteDeletedIds = [];
  const queuedItems = await getNutritionOutbox(userId);

  for (const item of queuedItems) {
    try {
      if (item.operation === "body-weight-delete") {
        await deleteBodyWeightEntry(item.entryDate, session);
      } else if (item.operation === "body-weight-upsert") {
        await upsertBodyWeightEntry(item.entry, session);
      } else if (item.operation === "nutrition-target-upsert") {
        await upsertNutritionTarget(item.target, session);
      } else if (item.operation === "delete") {
        await deleteNutritionEntry(
          item.entryId,
          session,
          item.entry,
          item.updatedAt
        );
      } else {
        const result = await upsertNutritionEntry(item.entry, session);

        if (result.remoteDeleted) {
          remoteDeletedIds.push(String(item.entry.id));
        }
      }

      await acknowledgeNutritionOutboxItem(item.id);
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

function entryTimestamp(entry) {
  return Date.parse(entry?.updatedAt || entry?.createdAt || "") || 0;
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
    if (!local || entryTimestamp(entry) >= entryTimestamp(local)) {
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

  entries = entries
    .filter((entry) => !pendingDeleteIds.has(String(entry.id)))
    .sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
    );

  await db.nutritionSnapshots.put({
    ...(snapshot || {}),
    entries,
    id: snapshotId(userId),
    lastPulledAt: pullStartedAt,
    lastReconciledAt: pullStartedAt,
    updatedAt: new Date().toISOString(),
    userId,
  });

  return {
    changes: changes.length,
    entries,
    failed: flushResult.failed,
    full: !since,
    pending: await getNutritionOutboxCount(userId),
    reconciledAt: pullStartedAt,
  };
}

export async function getNutritionPersistenceStatus(userId) {
  const snapshot = await db.nutritionSnapshots.get(snapshotId(userId));

  return {
    lastPulledAt: snapshot?.lastPulledAt || null,
    lastReconciledAt: snapshot?.lastReconciledAt || null,
    local: Array.isArray(snapshot?.entries) ? snapshot.entries.length : 0,
    pending: await getNutritionOutboxCount(userId),
    oldestPendingAt: (await getNutritionOutbox(userId))[0]?.updatedAt || null,
  };
}
