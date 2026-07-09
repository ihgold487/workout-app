import { isSupabaseConfigured, supabase } from "./supabaseClient";

const NUTRITION_ENTRIES_TABLE = "nutrition_entries";
const LOCAL_APP_SOURCE = "local_app";

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
