import { calculateE1RM } from "../utils/e1rm";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { uploadWorkouts } from "./workoutCloudSync";

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

function parseCompletedAt(value) {
  const parsed = value ? new Date(value) : null;

  if (parsed && Number.isFinite(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function localSessionToCloud(workout, userId, cloudWorkoutId) {
  return {
    completed_at: parseCompletedAt(workout.completedAt),
    deleted_at: null,
    duration_seconds: workout.durationSeconds || null,
    import_batch_id: null,
    source: LOCAL_APP_SOURCE,
    source_key: String(workout.id),
    started_at: workout.startedAt ? parseCompletedAt(workout.startedAt) : null,
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_id: cloudWorkoutId || null,
    workout_name: workout.templateName || workout.name || "Workout",
  };
}

function localExerciseToCloud(exercise, userId, sessionId, position, cloudIds) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];

  return {
    deleted_at: null,
    equipment: firstArrayValue(exercise.equipment),
    exercise_id: cloudIds.exerciseId || null,
    exercise_name: exercise.name,
    notes: exercise.note || null,
    position,
    primary_muscle: muscles[0] || null,
    secondary_muscles: remainingArrayValues(muscles),
    session_id: sessionId,
    superset_group: exercise.supersetGroup || null,
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_exercise_id: cloudIds.workoutExerciseId || null,
  };
}

function localSetToCloud(set, userId, sessionExerciseId, setNumber) {
  const targetRir = set.targetRir || set.rir || "";
  const actualRir = set.actualRir ?? "";
  const e1RM = calculateE1RM(
    set.actualWeight || set.targetWeight,
    set.actualReps || set.targetReps,
    actualRir || targetRir
  );

  return {
    actual_reps: parseInteger(set.actualReps || set.targetReps),
    actual_rir_label: actualRir !== "" ? String(actualRir) : null,
    actual_rir_value: parseNumber(actualRir),
    actual_weight_label: set.actualWeight
      ? String(set.actualWeight)
      : set.targetWeight
        ? String(set.targetWeight)
        : null,
    actual_weight_value: parseNumber(set.actualWeight || set.targetWeight),
    completed_at: set.completed ? new Date().toISOString() : null,
    deleted_at: null,
    estimated_1rm: e1RM,
    is_drop_set: Boolean(set.isDropSet || set.is_drop_set),
    session_exercise_id: sessionExerciseId,
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

async function loadWorkoutIdMap(userId) {
  const { data, error } = await supabase
    .from("workouts")
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return new Map(data.map((workout) => [workout.source_key, workout.id]));
}

async function loadWorkoutExerciseIdMap(userId) {
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("id,workout_id,position")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return new Map(
    data.map((exercise) => [
      `${exercise.workout_id}:${exercise.position}`,
      exercise.id,
    ])
  );
}

export async function uploadWorkoutHistory(
  history,
  templates,
  exerciseLibrary,
  session
) {
  assertCloudReady(session);

  const userId = session.user.id;

  // Completed sessions link back to planned workouts/exercises where possible,
  // so refresh planned workout rows before writing history rows.
  await uploadWorkouts(templates, exerciseLibrary, session);

  const customExerciseIds = await loadCustomExerciseIdMap(userId);
  const workoutIds = await loadWorkoutIdMap(userId);
  const workoutExerciseIds = await loadWorkoutExerciseIdMap(userId);

  const sessionRecords = history.map((workout) =>
    localSessionToCloud(
      workout,
      userId,
      workoutIds.get(String(workout.templateId))
    )
  );

  if (sessionRecords.length > 0) {
    const { error } = await supabase
      .from("workout_sessions")
      .upsert(sessionRecords, {
        onConflict: "user_id,source,source_key",
      });

    if (error) {
      throw error;
    }
  }

  const sourceKeys = history.map((workout) => String(workout.id));

  const { data: cloudSessions, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("id,source_key,workout_id")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (sessionsError) {
    throw sessionsError;
  }

  const cloudSessionsBySourceKey = new Map(
    cloudSessions.map((workout) => [workout.source_key, workout])
  );

  let syncedExercises = 0;
  let syncedSets = 0;
  let removedExercises = 0;
  let removedSets = 0;

  for (const workout of history) {
    const cloudSession = cloudSessionsBySourceKey.get(String(workout.id));

    if (!cloudSession) {
      continue;
    }

    const exerciseRecords = workout.exercises.map((exercise, index) =>
      localExerciseToCloud(exercise, userId, cloudSession.id, index + 1, {
        exerciseId: customExerciseIds.get(String(exercise.exerciseId)),
        workoutExerciseId: cloudSession.workout_id
          ? workoutExerciseIds.get(`${cloudSession.workout_id}:${index + 1}`)
          : null,
      })
    );

    let cloudExercises = [];

    if (exerciseRecords.length > 0) {
      const { data, error } = await supabase
        .from("session_exercises")
        .upsert(exerciseRecords, {
          onConflict: "session_id,position",
        })
        .select("id,position");

      if (error) {
        throw error;
      }

      cloudExercises = data;
      syncedExercises += data.length;
    }

    removedExercises += await softDeleteMissingRows({
      ids: cloudExercises.map((exercise) => exercise.id),
      idColumn: "id",
      matchColumn: "session_id",
      matchValue: cloudSession.id,
      table: "session_exercises",
      userId,
    });

    const cloudExercisesByPosition = new Map(
      cloudExercises.map((exercise) => [exercise.position, exercise.id])
    );

    for (const [exerciseIndex, exercise] of workout.exercises.entries()) {
      const sessionExerciseId = cloudExercisesByPosition.get(exerciseIndex + 1);

      if (!sessionExerciseId) {
        continue;
      }

      const setRecords = exercise.sets.map((set, setIndex) =>
        localSetToCloud(set, userId, sessionExerciseId, setIndex + 1)
      );

      let cloudSets = [];

      if (setRecords.length > 0) {
        const { data, error } = await supabase
          .from("session_sets")
          .upsert(setRecords, {
            onConflict: "session_exercise_id,set_number",
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
        matchColumn: "session_exercise_id",
        matchValue: sessionExerciseId,
        table: "session_sets",
        userId,
      });
    }
  }

  const { data: existingSessions, error: existingSessionsError } =
    await supabase
      .from("workout_sessions")
      .select("id,source_key")
      .eq("user_id", userId)
      .eq("source", LOCAL_APP_SOURCE)
      .is("deleted_at", null);

  if (existingSessionsError) {
    throw existingSessionsError;
  }

  const removedSessionIds = existingSessions
    .filter((workout) => !sourceKeys.includes(workout.source_key))
    .map((workout) => workout.id);

  if (removedSessionIds.length > 0) {
    const { error } = await supabase
      .from("workout_sessions")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .in("id", removedSessionIds);

    if (error) {
      throw error;
    }
  }

  return {
    removedExercises,
    removedSessions: removedSessionIds.length,
    removedSets,
    syncedExercises,
    syncedSessions: sessionRecords.length,
    syncedSets,
  };
}
