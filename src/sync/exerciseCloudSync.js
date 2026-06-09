import { isSupabaseConfigured, supabase } from "./supabaseClient";

const EXERCISES_TABLE = "exercises";
const LOCAL_APP_SOURCE = "local_app";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

function firstArrayValue(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function remainingArrayValues(value) {
  return Array.isArray(value) ? value.slice(1).filter(Boolean) : [];
}

function cloudExerciseFromLocal(exercise, userId) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];

  return {
    deleted_at: null,
    description: exercise.description || exercise.note || null,
    equipment: firstArrayValue(exercise.equipment),
    image_alt: exercise.imageAlt || exercise.image_alt || null,
    image_storage_path:
      exercise.imageStoragePath || exercise.image_storage_path || null,
    image_url: exercise.imageUrl || exercise.image_url || null,
    is_builtin: false,
    name: exercise.name,
    primary_muscle: muscles[0] || null,
    secondary_muscles: remainingArrayValues(muscles),
    source: LOCAL_APP_SOURCE,
    source_key: String(exercise.id),
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

export function getCustomExercises(exerciseLibrary) {
  return exerciseLibrary.filter((exercise) => !exercise.builtin);
}

export async function uploadCustomExercises(exerciseLibrary, session) {
  assertCloudReady(session);

  const customExercises = getCustomExercises(exerciseLibrary);

  const userId = session.user.id;
  const sourceKeys = customExercises.map((exercise) => String(exercise.id));
  const records = customExercises.map((exercise) =>
    cloudExerciseFromLocal(exercise, userId)
  );

  if (records.length > 0) {
    const { error: upsertError } = await supabase.from(EXERCISES_TABLE).upsert(
      records,
      {
        onConflict: "user_id,source,source_key",
      }
    );

    if (upsertError) {
      throw upsertError;
    }
  }

  // For this first normalized table, local custom exercises remain the source
  // of truth. Missing local source keys are soft-deleted in the cloud so old
  // completed sessions can still retain their denormalized exercise snapshots.
  const { data: existingRows, error: existingError } = await supabase
    .from(EXERCISES_TABLE)
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (existingError) {
    throw existingError;
  }

  const deletedIds = existingRows
    .filter((row) => !sourceKeys.includes(row.source_key))
    .map((row) => row.id);

  if (deletedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from(EXERCISES_TABLE)
      .update({
        deleted_at: new Date().toISOString(),
      })
      .in("id", deletedIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  return {
    deleted: deletedIds.length,
    uploaded: records.length,
  };
}
