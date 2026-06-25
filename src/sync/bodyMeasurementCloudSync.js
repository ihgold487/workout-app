import { isSupabaseConfigured, supabase } from "./supabaseClient";

const BODY_MEASUREMENTS_TABLE = "body_measurements";
const LOCAL_APP_SOURCE = "local_app";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

function sourceKeyForDate(date) {
  return `body-weight:${date}`;
}

function localEntryToCloud(entry, userId) {
  return {
    body_weight_unit: entry.unit || "lb",
    body_weight_value: Number(entry.weight),
    deleted_at: null,
    measured_on: entry.date,
    metadata: {
      local_id: entry.id ?? null,
    },
    source: LOCAL_APP_SOURCE,
    source_key: sourceKeyForDate(entry.date),
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

function cloudEntryToLocal(row) {
  return {
    date: row.measured_on,
    id: row.source_key || row.id,
    unit: row.body_weight_unit || "lb",
    weight: Number(row.body_weight_value),
  };
}

export async function downloadBodyWeightEntries(session) {
  assertCloudReady(session);

  const { data, error } = await supabase
    .from(BODY_MEASUREMENTS_TABLE)
    .select("id,measured_on,body_weight_value,body_weight_unit,source_key")
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .not("body_weight_value", "is", null)
    .order("measured_on", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data || []).map(cloudEntryToLocal);
}

export async function uploadBodyWeightEntries(entries, session) {
  assertCloudReady(session);

  const validEntries = (entries || []).filter(
    (entry) => entry?.date && Number.isFinite(Number(entry.weight))
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
    .from(BODY_MEASUREMENTS_TABLE)
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

export async function upsertBodyWeightEntry(entry, session) {
  const result = await uploadBodyWeightEntries([entry], session);

  return result.uploaded;
}

export async function deleteBodyWeightEntry(entryDate, session) {
  assertCloudReady(session);

  const { error } = await supabase
    .from(BODY_MEASUREMENTS_TABLE)
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", session.user.id)
    .eq("source", LOCAL_APP_SOURCE)
    .eq("source_key", sourceKeyForDate(entryDate));

  if (error) {
    throw error;
  }
}
