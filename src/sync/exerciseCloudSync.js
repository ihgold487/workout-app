import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { EXERCISE_STATUS, withDefaultExerciseStatus } from "../utils/exerciseStatus";

const EXERCISES_TABLE = "exercises";
const EXERCISE_PREFERENCES_TABLE = "user_exercise_preferences";
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function firstEquipmentValue(value) {
  return firstArrayValue(value) || "";
}

function getExerciseMatchKey(exercise) {
  return `${normalizeText(exercise.name)}::${normalizeText(
    firstEquipmentValue(exercise.equipment)
  )}`;
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

async function loadCloudExercisePreferenceTargets(userId) {
  const { data: builtinRows, error: builtinError } = await supabase
    .from(EXERCISES_TABLE)
    .select("id,name,equipment")
    .is("user_id", null)
    .eq("is_builtin", true)
    .is("deleted_at", null);

  if (builtinError) {
    throw builtinError;
  }

  const { data: customRows, error: customError } = await supabase
    .from(EXERCISES_TABLE)
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (customError) {
    throw customError;
  }

  return {
    builtinByNameEquipment: new Map(
      builtinRows.map((exercise) => [getExerciseMatchKey(exercise), exercise.id])
    ),
    customBySourceKey: new Map(
      customRows.map((exercise) => [exercise.source_key, exercise.id])
    ),
  };
}

function localExercisePreferenceToCloud(exercise, userId, exerciseId) {
  const isInactive = exercise.active === "inactive";

  return {
    exclude_from_plans: isInactive,
    exercise_id: exerciseId,
    include_in_plans: !isInactive,
    is_favorite: false,
    metadata: {
      localActiveStatus: isInactive ? "inactive" : "active",
      localExerciseId: exercise.id,
      localExerciseType: exercise.builtin ? "builtin" : "custom",
      syncedAt: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

function cloudExerciseToLocal(exercise) {
  return withDefaultExerciseStatus({
    builtin: !!exercise.is_builtin,
    description: exercise.description || "",
    equipment: [exercise.equipment].filter(Boolean),
    exerciseId: exercise.id,
    id:
      exercise.source === LOCAL_APP_SOURCE && exercise.source_key
        ? Number(exercise.source_key) || exercise.source_key
        : exercise.source_key || exercise.id,
    imageAlt: exercise.image_alt || "",
    imageStoragePath: exercise.image_storage_path || "",
    imageUrl: exercise.image_url || "",
    muscles: [
      exercise.primary_muscle,
      ...(exercise.secondary_muscles || []),
    ].filter(Boolean),
    name: exercise.name,
    source: exercise.source,
    sourceKey: exercise.source_key,
  });
}

function getPreferenceStatus(preference) {
  return preference?.exclude_from_plans
    ? EXERCISE_STATUS.inactive
    : EXERCISE_STATUS.active;
}

function applyCloudExerciseMetadata(localExercise, cloudExercise) {
  return withDefaultExerciseStatus({
    ...localExercise,
    description: cloudExercise.description || localExercise.description || "",
    exerciseId: cloudExercise.id,
    imageAlt: cloudExercise.image_alt || localExercise.imageAlt || "",
    imageStoragePath:
      cloudExercise.image_storage_path || localExercise.imageStoragePath || "",
    imageUrl: cloudExercise.image_url || localExercise.imageUrl || "",
    muscles: [
      cloudExercise.primary_muscle,
      ...(cloudExercise.secondary_muscles || []),
    ].filter(Boolean),
    source: cloudExercise.source || localExercise.source,
    sourceKey: cloudExercise.source_key || localExercise.sourceKey,
  });
}

export async function uploadExercisePreferences(exerciseLibrary, session) {
  assertCloudReady(session);

  const userId = session.user.id;

  await uploadCustomExercises(exerciseLibrary, session);

  const targets = await loadCloudExercisePreferenceTargets(userId);
  const records = [];
  const unmatched = [];

  for (const exercise of exerciseLibrary) {
    const exerciseId = exercise.builtin
      ? targets.builtinByNameEquipment.get(getExerciseMatchKey(exercise))
      : targets.customBySourceKey.get(String(exercise.id));

    if (!exerciseId) {
      unmatched.push({
        equipment: firstEquipmentValue(exercise.equipment),
        id: exercise.id,
        name: exercise.name,
        type: exercise.builtin ? "builtin" : "custom",
      });
      continue;
    }

    records.push(localExercisePreferenceToCloud(exercise, userId, exerciseId));
  }

  if (records.length > 0) {
    const { error } = await supabase
      .from(EXERCISE_PREFERENCES_TABLE)
      .upsert(records, {
        onConflict: "user_id,exercise_id",
      });

    if (error) {
      throw error;
    }
  }

  return {
    active: records.filter((record) => record.include_in_plans).length,
    inactive: records.filter((record) => record.exclude_from_plans).length,
    unmatched,
    uploaded: records.length,
  };
}

export async function downloadExerciseLibraryWithPreferences(
  currentExerciseLibrary,
  session
) {
  assertCloudReady(session);

  const userId = session.user.id;

  const { data: cloudExercises, error: exerciseError } = await supabase
    .from(EXERCISES_TABLE)
    .select(
      "id,user_id,name,description,image_url,image_storage_path,image_alt,equipment,primary_muscle,secondary_muscles,is_builtin,source,source_key"
    )
    .or(`user_id.eq.${userId},user_id.is.null`)
    .is("deleted_at", null);

  if (exerciseError) {
    throw exerciseError;
  }

  const { data: preferences, error: preferenceError } = await supabase
    .from(EXERCISE_PREFERENCES_TABLE)
    .select("exercise_id,include_in_plans,exclude_from_plans")
    .eq("user_id", userId);

  if (preferenceError) {
    throw preferenceError;
  }

  const preferencesByExerciseId = new Map(
    preferences.map((preference) => [preference.exercise_id, preference])
  );
  const cloudBuiltinsByKey = new Map(
    cloudExercises
      .filter((exercise) => exercise.is_builtin)
      .map((exercise) => [getExerciseMatchKey(exercise), exercise])
  );
  const cloudCustomBySourceKey = new Map(
    cloudExercises
      .filter(
        (exercise) =>
          exercise.user_id === userId && exercise.source === LOCAL_APP_SOURCE
      )
      .map((exercise) => [exercise.source_key, exercise])
  );
  const matchedCloudExerciseIds = new Set();
  let updated = 0;
  let inactive = 0;

  const mergedExercises = currentExerciseLibrary.map((exercise) => {
    const cloudExercise = exercise.builtin
      ? cloudBuiltinsByKey.get(getExerciseMatchKey(exercise))
      : cloudCustomBySourceKey.get(String(exercise.id));

    if (!cloudExercise) {
      return withDefaultExerciseStatus(exercise);
    }

    matchedCloudExerciseIds.add(cloudExercise.id);

    const preference = preferencesByExerciseId.get(cloudExercise.id);
    const nextExercise = {
      ...applyCloudExerciseMetadata(exercise, cloudExercise),
      active: getPreferenceStatus(preference),
    };

    if (nextExercise.active === EXERCISE_STATUS.inactive) {
      inactive += 1;
    }

    updated += 1;

    return nextExercise;
  });

  const existingLocalIds = new Set(
    mergedExercises.map((exercise) => String(exercise.id))
  );
  const addedCustomExercises = cloudExercises
    .filter(
      (exercise) =>
        exercise.user_id === userId &&
        exercise.source === LOCAL_APP_SOURCE &&
        !matchedCloudExerciseIds.has(exercise.id)
    )
    .map((exercise) => {
      const localExercise = cloudExerciseToLocal(exercise);
      const preference = preferencesByExerciseId.get(exercise.id);

      return {
        ...localExercise,
        active: getPreferenceStatus(preference),
      };
    })
    .filter((exercise) => !existingLocalIds.has(String(exercise.id)));

  inactive += addedCustomExercises.filter(
    (exercise) => exercise.active === EXERCISE_STATUS.inactive
  ).length;

  return {
    addedCustomExercises: addedCustomExercises.length,
    exerciseLibrary: [...mergedExercises, ...addedCustomExercises],
    inactive,
    preferences: preferences.length,
    total: mergedExercises.length + addedCustomExercises.length,
    updated,
  };
}
