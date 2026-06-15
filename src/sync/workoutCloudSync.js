import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { uploadCustomExercises } from "./exerciseCloudSync";

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

function parseNumber(value) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number.parseFloat(String(value).replace(/^\+/, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseRir(value) {
  if (value === "" || value == null || value === "-") {
    return 0;
  }

  if (String(value).trim() === "5+") {
    return 6;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatCloudValue(label, value) {
  if (label != null && label !== "") {
    return String(label);
  }

  if (value == null || value === "") {
    return "";
  }

  return String(value);
}

function parseLocalSourceKey(sourceKey) {
  const numeric = Number(sourceKey);

  return Number.isFinite(numeric) && String(numeric) === String(sourceKey)
    ? numeric
    : sourceKey;
}

function normalizeLookupValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getLocalExerciseMatchKey(exercise) {
  const equipment = Array.isArray(exercise.equipment)
    ? exercise.equipment.filter(Boolean).join(", ")
    : exercise.equipment || "";

  return `${normalizeLookupValue(exercise.name)}||${normalizeLookupValue(
    equipment
  )}`;
}

function getCloudExerciseMatchKey(exercise) {
  return `${normalizeLookupValue(exercise.exercise_name || exercise.name)}||${normalizeLookupValue(
    exercise.equipment
  )}`;
}

function localWorkoutToCloud(template, userId) {
  return {
    deleted_at: null,
    description: template.description || null,
    last_completed_at: template.lastCompleted
      ? new Date(template.lastCompleted).toISOString()
      : null,
    name: template.name,
    parent_workout_id: null,
    source: LOCAL_APP_SOURCE,
    source_key: String(template.id),
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

function localExerciseToCloud(exercise, userId, workoutId, position, cloudId) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];

  return {
    deleted_at: null,
    equipment: firstArrayValue(exercise.equipment),
    exercise_id: cloudId || null,
    exercise_name: exercise.name,
    notes: exercise.note || null,
    position,
    primary_muscle: muscles[0] || null,
    secondary_muscles: remainingArrayValues(muscles),
    superset_group: exercise.supersetGroup || null,
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_id: workoutId,
  };
}

function localSetToCloud(set, userId, workoutExerciseId, setNumber) {
  const targetRir = set.targetRir || set.rir || "";

  return {
    deleted_at: null,
    is_drop_set: Boolean(set.isDropSet || set.is_drop_set),
    set_number: setNumber,
    target_reps_label: set.targetReps ? String(set.targetReps) : null,
    target_reps_max: parseInteger(set.targetReps),
    target_reps_min: parseInteger(set.targetReps),
    target_rir_label: targetRir ? String(targetRir) : null,
    target_rir_value: parseRir(targetRir),
    target_weight_label: set.targetWeight ? String(set.targetWeight) : null,
    target_weight_value: parseNumber(set.targetWeight),
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_exercise_id: workoutExerciseId,
  };
}

async function softDeleteMissingRows({
  ids,
  idColumn,
  matchColumn,
  matchValue,
  table,
  userId,
}) {
  const { data, error } = await supabase
    .from(table)
    .select(idColumn)
    .eq("user_id", userId)
    .eq(matchColumn, matchValue)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const missingIds = data
    .map((row) => row[idColumn])
    .filter((id) => !ids.includes(id));

  if (missingIds.length === 0) {
    return 0;
  }

  const { error: deleteError } = await supabase
    .from(table)
    .update({
      deleted_at: new Date().toISOString(),
    })
    .in(idColumn, missingIds);

  if (deleteError) {
    throw deleteError;
  }

  return missingIds.length;
}

async function loadCustomExerciseIdMap(userId) {
  const { data, error } = await supabase
    .from("exercises")
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return new Map(data.map((exercise) => [exercise.source_key, exercise.id]));
}

function buildLocalExerciseLookup(exerciseLibrary) {
  return {
    byCloudId: new Map(
      exerciseLibrary
        .filter((exercise) => exercise.exerciseId)
        .map((exercise) => [exercise.exerciseId, exercise])
    ),
    byNameEquipment: new Map(
      exerciseLibrary.map((exercise) => [getLocalExerciseMatchKey(exercise), exercise])
    ),
  };
}

function cloudSetToLocal(set) {
  return {
    id: parseLocalSourceKey(set.id),
    isDropSet: Boolean(set.is_drop_set),
    targetReps: formatCloudValue(
      set.target_reps_label,
      set.target_reps_min ?? set.target_reps_max
    ),
    targetRir: formatCloudValue(set.target_rir_label, set.target_rir_value),
    targetWeight: formatCloudValue(
      set.target_weight_label,
      set.target_weight_value
    ),
  };
}

function cloudWorkoutExerciseToLocal(exercise, sets, exerciseLookup) {
  const matchedExercise =
    exerciseLookup.byCloudId.get(exercise.exercise_id) ||
    exerciseLookup.byNameEquipment.get(getCloudExerciseMatchKey(exercise));
  const muscles = [
    exercise.primary_muscle,
    ...(exercise.secondary_muscles || []),
  ].filter(Boolean);

  return {
    equipment: exercise.equipment ? [exercise.equipment] : [],
    exerciseId: matchedExercise?.id || null,
    id: parseLocalSourceKey(exercise.id),
    imageAlt: matchedExercise?.imageAlt || "",
    imageUrl: matchedExercise?.imageUrl || "",
    muscles,
    name: exercise.exercise_name,
    note: exercise.notes || "",
    sets,
    supersetGroup: exercise.superset_group || null,
  };
}

function cloudWorkoutToLocal(workout, exercises, existingTemplate) {
  return {
    ...(existingTemplate || {}),
    description: workout.description || existingTemplate?.description || "",
    exercises,
    id: parseLocalSourceKey(workout.source_key),
    lastCompleted: workout.last_completed_at
      ? new Date(workout.last_completed_at).toLocaleDateString()
      : existingTemplate?.lastCompleted || null,
    name: workout.name,
  };
}

export async function uploadWorkouts(templates, exerciseLibrary, session) {
  assertCloudReady(session);

  const userId = session.user.id;

  // Keep custom exercise rows current before planned workouts reference them.
  await uploadCustomExercises(exerciseLibrary, session);

  const customExerciseIds = await loadCustomExerciseIdMap(userId);
  const workoutRecords = templates.map((template) =>
    localWorkoutToCloud(template, userId)
  );

  if (workoutRecords.length > 0) {
    const { error } = await supabase.from("workouts").upsert(workoutRecords, {
      onConflict: "user_id,source,source_key",
    });

    if (error) {
      throw error;
    }
  }

  const sourceKeys = templates.map((template) => String(template.id));

  const { data: cloudWorkouts, error: workoutLoadError } = await supabase
    .from("workouts")
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (workoutLoadError) {
    throw workoutLoadError;
  }

  const cloudWorkoutIdsBySourceKey = new Map(
    cloudWorkouts.map((workout) => [workout.source_key, workout.id])
  );

  let syncedExercises = 0;
  let syncedSets = 0;
  let removedExercises = 0;
  let removedSets = 0;

  for (const template of templates) {
    const workoutId = cloudWorkoutIdsBySourceKey.get(String(template.id));

    if (!workoutId) {
      continue;
    }

    const exerciseRecords = template.exercises.map((exercise, index) =>
      localExerciseToCloud(
        exercise,
        userId,
        workoutId,
        index + 1,
        customExerciseIds.get(String(exercise.exerciseId))
      )
    );

    let cloudWorkoutExercises = [];

    if (exerciseRecords.length > 0) {
      const { data, error } = await supabase
        .from("workout_exercises")
        .upsert(exerciseRecords, {
          onConflict: "workout_id,position",
        })
        .select("id,position");

      if (error) {
        throw error;
      }

      cloudWorkoutExercises = data;
      syncedExercises += data.length;
    }

    removedExercises += await softDeleteMissingRows({
      ids: cloudWorkoutExercises.map((exercise) => exercise.id),
      idColumn: "id",
      matchColumn: "workout_id",
      matchValue: workoutId,
      table: "workout_exercises",
      userId,
    });

    const cloudExercisesByPosition = new Map(
      cloudWorkoutExercises.map((exercise) => [exercise.position, exercise.id])
    );

    for (const [exerciseIndex, exercise] of template.exercises.entries()) {
      const workoutExerciseId = cloudExercisesByPosition.get(exerciseIndex + 1);

      if (!workoutExerciseId) {
        continue;
      }

      const setRecords = exercise.sets.map((set, setIndex) =>
        localSetToCloud(set, userId, workoutExerciseId, setIndex + 1)
      );

      let cloudSets = [];

      if (setRecords.length > 0) {
        const { data, error } = await supabase
          .from("workout_exercise_sets")
          .upsert(setRecords, {
            onConflict: "workout_exercise_id,set_number",
          })
          .select("id,set_number");

        if (error) {
          throw error;
        }

        cloudSets = data;
        syncedSets += data.length;
      }

      removedSets += await softDeleteMissingRows({
        ids: cloudSets.map((set) => set.id),
        idColumn: "id",
        matchColumn: "workout_exercise_id",
        matchValue: workoutExerciseId,
        table: "workout_exercise_sets",
        userId,
      });
    }
  }

  const { data: existingWorkouts, error: existingWorkoutError } = await supabase
    .from("workouts")
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (existingWorkoutError) {
    throw existingWorkoutError;
  }

  const removedWorkoutIds = existingWorkouts
    .filter((workout) => !sourceKeys.includes(workout.source_key))
    .map((workout) => workout.id);

  if (removedWorkoutIds.length > 0) {
    const { error } = await supabase
      .from("workouts")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .in("id", removedWorkoutIds);

    if (error) {
      throw error;
    }
  }

  return {
    removedExercises,
    removedSets,
    removedWorkouts: removedWorkoutIds.length,
    syncedExercises,
    syncedSets,
    syncedWorkouts: workoutRecords.length,
  };
}

export async function downloadWorkouts(currentTemplates, exerciseLibrary, session) {
  assertCloudReady(session);

  const userId = session.user.id;
  const { data: workoutRows, error: workoutError } = await supabase
    .from("workouts")
    .select("id,name,description,last_completed_at,source_key,updated_at")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null)
    .order("updated_at", {
      ascending: false,
    });

  if (workoutError) {
    throw workoutError;
  }

  const workoutIds = workoutRows.map((workout) => workout.id);
  const existingTemplatesBySourceKey = new Map(
    currentTemplates.map((template) => [String(template.id), template])
  );

  if (workoutIds.length === 0) {
    return {
      downloaded: 0,
      templates: currentTemplates,
      updated: 0,
    };
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("workout_exercises")
    .select(
      "id,workout_id,exercise_id,position,exercise_name,equipment,primary_muscle,secondary_muscles,superset_group,notes"
    )
    .in("workout_id", workoutIds)
    .is("deleted_at", null)
    .order("position", {
      ascending: true,
    });

  if (exerciseError) {
    throw exerciseError;
  }

  const exerciseIds = exerciseRows.map((exercise) => exercise.id);
  let setRows = [];

  if (exerciseIds.length > 0) {
    const { data, error } = await supabase
      .from("workout_exercise_sets")
      .select(
        "id,workout_exercise_id,set_number,target_weight_value,target_weight_label,target_reps_min,target_reps_max,target_reps_label,target_rir_value,target_rir_label,is_drop_set"
      )
      .in("workout_exercise_id", exerciseIds)
      .is("deleted_at", null)
      .order("set_number", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    setRows = data;
  }

  const setsByExerciseId = new Map();
  for (const set of setRows) {
    const sets = setsByExerciseId.get(set.workout_exercise_id) || [];
    sets.push(cloudSetToLocal(set));
    setsByExerciseId.set(set.workout_exercise_id, sets);
  }

  const exercisesByWorkoutId = new Map();
  const exerciseLookup = buildLocalExerciseLookup(exerciseLibrary);

  for (const exercise of exerciseRows) {
    const exercises = exercisesByWorkoutId.get(exercise.workout_id) || [];
    exercises.push(
      cloudWorkoutExerciseToLocal(
        exercise,
        setsByExerciseId.get(exercise.id) || [],
        exerciseLookup
      )
    );
    exercisesByWorkoutId.set(exercise.workout_id, exercises);
  }

  const downloadedTemplates = workoutRows.map((workout) =>
    cloudWorkoutToLocal(
      workout,
      exercisesByWorkoutId.get(workout.id) || [],
      existingTemplatesBySourceKey.get(String(workout.source_key))
    )
  );
  const downloadedSourceKeys = new Set(
    downloadedTemplates.map((template) => String(template.id))
  );
  const localOnlyTemplates = currentTemplates.filter(
    (template) => !downloadedSourceKeys.has(String(template.id))
  );

  return {
    downloaded: downloadedTemplates.length,
    localOnly: localOnlyTemplates.length,
    templates: [...downloadedTemplates, ...localOnlyTemplates],
    updated: downloadedTemplates.filter((template) =>
      existingTemplatesBySourceKey.has(String(template.id))
    ).length,
  };
}
