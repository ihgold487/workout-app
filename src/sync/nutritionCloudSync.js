import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { skipBlockedRemoteWrite } from "./remoteWritePolicy";

const NUTRITION_ENTRIES_TABLE = "nutrition_entries";
const LOCAL_APP_SOURCE = "local_app";
const PENDING_DELETE_KEY = "nutritionPendingDeletes";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

function sourceKeyForEntry(entryId) {
  return `nutrition-entry:${entryId}`;
}

function getPendingDeleteStorageKey(userId) {
  return userId ? `${PENDING_DELETE_KEY}:${userId}` : PENDING_DELETE_KEY;
}

function normalizePendingDeleteRecord(record) {
  if (record === null || record === undefined) {
    return null;
  }

  if (typeof record === "object") {
    const id = record.id ?? record.entryId;

    return id === null || id === undefined
      ? null
      : {
          deletedAt: record.deletedAt || new Date().toISOString(),
          id: String(id),
        };
  }

  return {
    deletedAt: new Date().toISOString(),
    id: String(record),
  };
}

export function readPendingNutritionDeletes(userId) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getPendingDeleteStorageKey(userId)) || "[]"
    );

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizePendingDeleteRecord).filter(Boolean);
  } catch (error) {
    console.error("Failed to load pending nutrition deletes:", error);

    return [];
  }
}

function writePendingNutritionDeletes(userId, records) {
  const storageKey = getPendingDeleteStorageKey(userId);
  const normalizedRecords = records
    .map(normalizePendingDeleteRecord)
    .filter(Boolean);

  if (normalizedRecords.length === 0) {
    localStorage.removeItem(storageKey);
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(normalizedRecords));
}

export function addPendingNutritionDelete(entryId, userId) {
  if (entryId === null || entryId === undefined || !userId) {
    return;
  }

  const entryKey = String(entryId);
  const records = readPendingNutritionDeletes(userId);

  if (records.some((record) => record.id === entryKey)) {
    return;
  }

  writePendingNutritionDeletes(userId, [
    ...records,
    {
      deletedAt: new Date().toISOString(),
      id: entryKey,
    },
  ]);
}

export function clearPendingNutritionDelete(entryId, userId) {
  if (entryId === null || entryId === undefined || !userId) {
    return;
  }

  const entryKey = String(entryId);
  writePendingNutritionDeletes(
    userId,
    readPendingNutritionDeletes(userId).filter((record) => record.id !== entryKey)
  );
}

export function getPendingNutritionDeleteIds(userId) {
  return new Set(readPendingNutritionDeletes(userId).map((record) => record.id));
}

export function filterPendingDeletedNutritionEntries(entries, userId) {
  const pendingDeleteIds = getPendingNutritionDeleteIds(userId);

  if (pendingDeleteIds.size === 0) {
    return entries || [];
  }

  return (entries || []).filter(
    (entry) => !pendingDeleteIds.has(String(entry?.id))
  );
}

function normalizeNumber(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function localEntryToCloud(entry, userId) {
  const now = new Date().toISOString();
  const servingAmount = normalizeNumber(entry.servingAmount);

  return {
    calories: Math.round(normalizeNumber(entry.calories) || 0),
    carb_grams: normalizeNumber(entry.carbs) || 0,
    deleted_at: null,
    entry_date: entry.date,
    fat_grams: normalizeNumber(entry.fat) || 0,
    food_name: entry.name,
    meal: entry.meal || "breakfast",
    metadata: {
      food_source: entry.source || "manual",
      food_source_key: entry.sourceKey || null,
      local_created_at: entry.createdAt || null,
      local_id: entry.id,
      local_updated_at: entry.updatedAt || now,
      serving_description: entry.servingDescription || null,
    },
    protein_grams: normalizeNumber(entry.protein) || 0,
    quantity: servingAmount,
    quantity_unit: entry.servingDescription || null,
    recipe_id: entry.recipeId || null,
    source: LOCAL_APP_SOURCE,
    source_key: sourceKeyForEntry(entry.id),
    updated_at: entry.updatedAt || now,
    user_id: userId,
  };
}

function cloudEntryToLocal(row) {
  const metadata = row.metadata || {};
  const localId =
    metadata.local_id ??
    (row.source_key?.startsWith("nutrition-entry:")
      ? row.source_key.replace("nutrition-entry:", "")
      : row.id);

  return {
    calories: Number(row.calories) || 0,
    carbs: Number(row.carb_grams) || 0,
    createdAt: metadata.local_created_at || row.created_at || null,
    date: row.entry_date,
    fat: Number(row.fat_grams) || 0,
    id: localId,
    meal: row.meal || "breakfast",
    name: row.food_name,
    protein: Number(row.protein_grams) || 0,
    recipeId: row.recipe_id || null,
    servingAmount:
      row.quantity === null || row.quantity === undefined
        ? null
        : Number(row.quantity),
    servingDescription: metadata.serving_description || row.quantity_unit || null,
    source: metadata.food_source || "manual",
    sourceKey: metadata.food_source_key || null,
    updatedAt: metadata.local_updated_at || row.updated_at || null,
  };
}

export async function downloadNutritionEntries(session) {
  assertCloudReady(session);

  const { data, error } = await supabase
    .from(NUTRITION_ENTRIES_TABLE)
    .select(
      "id,entry_date,food_name,meal,quantity,quantity_unit,calories,protein_grams,carb_grams,fat_grams,recipe_id,source_key,metadata,created_at,updated_at"
    )
    .eq("user_id", session.user.id)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null)
    .order("entry_date", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data || []).map(cloudEntryToLocal);
}

export async function uploadNutritionEntries(entries, session) {
  const blockedResult = skipBlockedRemoteWrite("nutrition push", { uploaded: 0 });
  if (blockedResult) return blockedResult;

  assertCloudReady(session);

  const validEntries = (entries || []).filter(
    (entry) => entry?.id !== undefined && entry?.date && entry?.name
  );

  if (validEntries.length === 0) {
    return {
      uploaded: 0,
    };
  }

  const rows = validEntries.map((entry) =>
    localEntryToCloud(entry, session.user.id)
  );
  const { error } = await supabase
    .from(NUTRITION_ENTRIES_TABLE)
    .upsert(rows, {
      onConflict: "user_id,source,source_key",
    });

  if (error) {
    throw error;
  }

  return {
    uploaded: rows.length,
  };
}

export async function upsertNutritionEntry(entry, session) {
  const result = await uploadNutritionEntries([entry], session);

  return result.uploaded;
}

export async function deleteNutritionEntry(entryId, session) {
  if (skipBlockedRemoteWrite("nutrition delete", true)) return;

  assertCloudReady(session);

  const { error } = await supabase
    .from(NUTRITION_ENTRIES_TABLE)
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", session.user.id)
    .eq("source", LOCAL_APP_SOURCE)
    .eq("source_key", sourceKeyForEntry(entryId));

  if (error) {
    throw error;
  }
}

export async function retryPendingNutritionDeletes(session) {
  const blockedResult = skipBlockedRemoteWrite("pending nutrition deletes", {
    deleted: 0,
    failed: readPendingNutritionDeletes(session?.user?.id).length,
  });
  if (blockedResult) return blockedResult;

  assertCloudReady(session);

  const userId = session.user.id;
  const records = readPendingNutritionDeletes(userId);
  const failedRecords = [];
  let deleted = 0;

  for (const record of records) {
    try {
      await deleteNutritionEntry(record.id, session);
      deleted += 1;
    } catch (error) {
      console.error("Failed to retry pending nutrition delete:", error);
      failedRecords.push(record);
    }
  }

  writePendingNutritionDeletes(userId, failedRecords);

  return {
    deleted,
    failed: failedRecords.length,
  };
}
