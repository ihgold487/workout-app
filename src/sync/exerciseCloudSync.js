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

function parseOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function cloudExerciseFromLocal(exercise, userId) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];

  return {
    bodyweight_load_percent: parseOptionalNumber(exercise.bodyweightLoadPercent),
    deleted_at: null,
    description: exercise.description || exercise.note || null,
    equipment: firstArrayValue(exercise.equipment),
    image_alt: exercise.imageAlt || exercise.image_alt || null,
    image_storage_path:
      exercise.imageStoragePath || exercise.image_storage_path || null,
    image_url: exercise.imageUrl || exercise.image_url || null,
    instruction_source:
      exercise.instructionSource || exercise.instruction_source || null,
    instruction_source_url:
      exercise.instructionSourceUrl || exercise.instruction_source_url || null,
    instruction_steps: Array.isArray(exercise.instructionSteps)
      ? exercise.instructionSteps
      : exercise.instruction_steps || [],
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

function cloudBuiltinExerciseFromLocal(exercise, userId) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];
  const sourceKey = [
    "trainer-promoted",
    userId,
    String(exercise.sourceKey || exercise.id),
  ].join(":");

  return {
    bodyweight_load_percent: parseOptionalNumber(exercise.bodyweightLoadPercent),
    description: exercise.description || exercise.note || null,
    equipment: firstArrayValue(exercise.equipment),
    image_alt: exercise.imageAlt || exercise.image_alt || null,
    image_storage_path:
      exercise.imageStoragePath || exercise.image_storage_path || null,
    image_url: exercise.imageUrl || exercise.image_url || null,
    instruction_source:
      exercise.instructionSource || exercise.instruction_source || null,
    instruction_source_url:
      exercise.instructionSourceUrl || exercise.instruction_source_url || null,
    instruction_steps: Array.isArray(exercise.instructionSteps)
      ? exercise.instructionSteps
      : exercise.instruction_steps || [],
    name: exercise.name,
    primary_muscle: muscles[0] || null,
    secondary_muscles: remainingArrayValues(muscles),
    source: "trainer_promoted",
    source_key: sourceKey,
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getExerciseMatchKey(exercise) {
  return `${normalizeText(exercise.name)}::${normalizeText(
    firstEquipmentValue(exercise.equipment)
  )}`;
}

async function findBuiltInExerciseId(exercise) {
  const equipment = firstEquipmentValue(exercise.equipment);
  let query = supabase
    .from(EXERCISES_TABLE)
    .select("id")
    .eq("is_builtin", true)
    .is("user_id", null)
    .is("deleted_at", null)
    .eq("name", exercise.name)
    .limit(1);

  query = equipment
    ? query.eq("equipment", equipment)
    : query.is("equipment", null);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data?.[0]?.id || null;
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

export async function promoteCustomExerciseToBuiltIn(exercise, session) {
  assertCloudReady(session);

  if (!exercise || exercise.builtin) {
    throw new Error("Choose a custom exercise to add as built-in.");
  }

  const { data, error } = await supabase.rpc(
    "promote_custom_exercise_to_builtin",
    {
      exercise_payload: cloudBuiltinExerciseFromLocal(exercise, session.user.id),
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function updateBuiltInExercise(
  exercise,
  session,
  lookupExercise = exercise
) {
  assertCloudReady(session);

  if (!exercise?.builtin) {
    throw new Error("Choose a built-in exercise to update.");
  }

  const exerciseId =
    lookupExercise.exerciseId ||
    (isUuid(lookupExercise.id) ? lookupExercise.id : null) ||
    (await findBuiltInExerciseId(lookupExercise));

  if (!exerciseId) {
    throw new Error(
      "Unable to find this built-in exercise in the database. Sync first, then try again."
    );
  }

  const { data, error } = await supabase.rpc("update_builtin_exercise", {
    exercise_id: exerciseId,
    exercise_payload: cloudBuiltinExerciseFromLocal(exercise, session.user.id),
  });

  if (error) {
    throw error;
  }

  return data;
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

function normalizeE1RMMetadata(value) {
  const numericValue = Number(value?.value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return {
    date: value?.date || null,
    value: numericValue,
  };
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== null && entry !== undefined
    )
  );
}

function localExercisePreferenceToCloud(
  exercise,
  userId,
  exerciseId,
  exerciseMetadata = {}
) {
  const isInactive = exercise.active === "inactive";
  const localMetadata = exerciseMetadata?.[exercise.id] || {};
  const latestE1RM = normalizeE1RMMetadata(localMetadata.latestE1RM);
  const maxE1RM = normalizeE1RMMetadata(localMetadata.maxE1RM);

  return {
    exclude_from_plans: isInactive,
    exercise_id: exerciseId,
    include_in_plans: !isInactive,
    is_favorite: false,
    metadata: compactObject({
      latestE1RM,
      localActiveStatus: isInactive ? "inactive" : "active",
      localExerciseId: exercise.id,
      localExerciseType: exercise.builtin ? "builtin" : "custom",
      maxE1RM,
      syncedAt: new Date().toISOString(),
    }),
    notes: String(localMetadata.note || "").trim() || null,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

function cloudPreferenceMetadataToLocal(preference) {
  const metadata = preference?.metadata || {};
  const latestE1RM = normalizeE1RMMetadata(metadata.latestE1RM);
  const maxE1RM = normalizeE1RMMetadata(metadata.maxE1RM);

  return compactObject({
    latestE1RM,
    maxE1RM,
    note: String(preference?.notes || "").trim() || null,
  });
}

function mergePreferenceMetadata(
  currentExerciseMetadata,
  localExercise,
  preference
) {
  const preferenceMetadata = cloudPreferenceMetadataToLocal(preference);

  if (Object.keys(preferenceMetadata).length === 0) {
    return currentExerciseMetadata;
  }

  return {
    ...currentExerciseMetadata,
    [localExercise.id]: {
      ...(currentExerciseMetadata?.[localExercise.id] || {}),
      ...preferenceMetadata,
    },
  };
}

function cloudExerciseToLocal(exercise) {
  return withDefaultExerciseStatus({
    bodyweightLoadPercent: exercise.bodyweight_load_percent ?? null,
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
    instructionSource: exercise.instruction_source || "",
    instructionSourceUrl: exercise.instruction_source_url || "",
    instructionSteps: exercise.instruction_steps || [],
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
    instructionSource:
      cloudExercise.instruction_source || localExercise.instructionSource || "",
    instructionSourceUrl:
      cloudExercise.instruction_source_url ||
      localExercise.instructionSourceUrl ||
      "",
    instructionSteps:
      cloudExercise.instruction_steps || localExercise.instructionSteps || [],
    muscles: [
      cloudExercise.primary_muscle,
      ...(cloudExercise.secondary_muscles || []),
    ].filter(Boolean),
    source: cloudExercise.source || localExercise.source,
    sourceKey: cloudExercise.source_key || localExercise.sourceKey,
  });
}

export async function uploadExercisePreferences(
  exerciseLibrary,
  exerciseMetadata,
  session
) {
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

    records.push(
      localExercisePreferenceToCloud(
        exercise,
        userId,
        exerciseId,
        exerciseMetadata
      )
    );
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
  currentExerciseMetadata,
  session
) {
  assertCloudReady(session);

  const userId = session.user.id;

  const { data: cloudExercises, error: exerciseError } = await supabase
    .from(EXERCISES_TABLE)
    .select(
      "id,user_id,name,description,instruction_steps,instruction_source,instruction_source_url,image_url,image_storage_path,image_alt,equipment,primary_muscle,secondary_muscles,bodyweight_load_percent,is_builtin,source,source_key"
    )
    .or(`user_id.eq.${userId},user_id.is.null`)
    .is("deleted_at", null);

  if (exerciseError) {
    throw exerciseError;
  }

  const { data: preferences, error: preferenceError } = await supabase
    .from(EXERCISE_PREFERENCES_TABLE)
    .select("exercise_id,include_in_plans,exclude_from_plans,notes,metadata")
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
  let nextExerciseMetadata = { ...(currentExerciseMetadata || {}) };
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
    nextExerciseMetadata = mergePreferenceMetadata(
      nextExerciseMetadata,
      nextExercise,
      preference
    );

    if (nextExercise.active === EXERCISE_STATUS.inactive) {
      inactive += 1;
    }

    updated += 1;

    return nextExercise;
  });

  const existingLocalIds = new Set(
    mergedExercises.map((exercise) => String(exercise.id))
  );
  const addedBuiltInExercises = cloudExercises
    .filter(
      (exercise) =>
        exercise.is_builtin &&
        exercise.user_id === null &&
        !matchedCloudExerciseIds.has(exercise.id)
    )
    .map((exercise) => {
      const localExercise = cloudExerciseToLocal(exercise);
      const preference = preferencesByExerciseId.get(exercise.id);

      const nextExercise = {
        ...localExercise,
        active: getPreferenceStatus(preference),
      };
      nextExerciseMetadata = mergePreferenceMetadata(
        nextExerciseMetadata,
        nextExercise,
        preference
      );

      return nextExercise;
    })
    .filter((exercise) => !existingLocalIds.has(String(exercise.id)));
  addedBuiltInExercises.forEach((exercise) => {
    existingLocalIds.add(String(exercise.id));
  });
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

      const nextExercise = {
        ...localExercise,
        active: getPreferenceStatus(preference),
      };
      nextExerciseMetadata = mergePreferenceMetadata(
        nextExerciseMetadata,
        nextExercise,
        preference
      );

      return nextExercise;
    })
    .filter((exercise) => !existingLocalIds.has(String(exercise.id)));

  inactive += [...addedBuiltInExercises, ...addedCustomExercises].filter(
    (exercise) => exercise.active === EXERCISE_STATUS.inactive
  ).length;

  return {
    addedBuiltInExercises: addedBuiltInExercises.length,
    addedCustomExercises: addedCustomExercises.length,
    exerciseLibrary: [
      ...mergedExercises,
      ...addedBuiltInExercises,
      ...addedCustomExercises,
    ],
    exerciseMetadata: nextExerciseMetadata,
    inactive,
    preferences: preferences.length,
    total:
      mergedExercises.length +
      addedBuiltInExercises.length +
      addedCustomExercises.length,
    updated,
  };
}
