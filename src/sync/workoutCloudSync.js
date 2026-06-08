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
    target_rir_value: parseNumber(targetRir),
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
