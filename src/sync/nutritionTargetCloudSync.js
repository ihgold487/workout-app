import { isSupabaseConfigured, supabase } from "./supabaseClient";

const NUTRITION_DAILY_TARGETS_TABLE = "nutrition_daily_targets";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

function normalizeGoal(value) {
  const parsed = Math.round(Number(value));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function localTargetToCloud(target, userId) {
  return {
    calorie_target: normalizeGoal(target.goal),
    deleted_at: null,
    target_date: target.date,
    updated_at: target.updatedAt || new Date().toISOString(),
    user_id: userId,
  };
}

function cloudTargetToLocal(row) {
  return {
    date: row.target_date,
    goal: normalizeGoal(row.calorie_target),
    updatedAt: row.updated_at || null,
  };
}

export async function downloadNutritionTargets(session) {
  assertCloudReady(session);

  const { data, error } = await supabase
    .from(NUTRITION_DAILY_TARGETS_TABLE)
    .select("target_date,calorie_target,updated_at")
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .not("calorie_target", "is", null)
    .order("target_date", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data || [])
    .map(cloudTargetToLocal)
    .filter((target) => target.date && target.goal);
}

export async function uploadNutritionTargets(targets, session) {
  assertCloudReady(session);

  const validTargets = (targets || []).filter(
    (target) => target?.date && normalizeGoal(target.goal)
  );

  if (validTargets.length === 0) {
    return {
      uploaded: 0,
    };
  }

  const rows = validTargets.map((target) =>
    localTargetToCloud(target, session.user.id)
  );
  const { error } = await supabase
    .from(NUTRITION_DAILY_TARGETS_TABLE)
    .upsert(rows, {
      onConflict: "user_id,target_date",
    });

  if (error) {
    throw error;
  }

  return {
    uploaded: rows.length,
  };
}

export async function upsertNutritionTarget(target, session) {
  const result = await uploadNutritionTargets([target], session);

  return result.uploaded;
}
