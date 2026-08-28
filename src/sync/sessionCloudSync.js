import { calculateE1RM } from "../utils/e1rm";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { skipBlockedRemoteWrite } from "./remoteWritePolicy";
import { uploadWorkouts } from "./workoutCloudSync";

const LOCAL_APP_SOURCE = "local_app";
const IN_FILTER_BATCH_SIZE = 75;

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

function parseCompletedAt(value) {
  const parsed = value ? new Date(value) : null;

  if (parsed && Number.isFinite(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function parseLocalSourceKey(sourceKey) {
  const numeric = Number(sourceKey);

  return Number.isFinite(numeric) && String(numeric) === String(sourceKey)
    ? numeric
    : sourceKey;
}

async function selectRowsByBatchedIn({
  column,
  ids,
  orderColumn,
  select,
  table,
}) {
  const rows = [];

  for (let index = 0; index < ids.length; index += IN_FILTER_BATCH_SIZE) {
    const batchIds = ids.slice(index, index + IN_FILTER_BATCH_SIZE);
    let query = supabase
      .from(table)
      .select(select)
      .in(column, batchIds)
      .is("deleted_at", null);

    if (orderColumn) {
      query = query.order(orderColumn, {
        ascending: true,
      });
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    rows.push(...(data || []));
  }

  return rows;
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
  return `${normalizeLookupValue(exercise.exercise_name)}||${normalizeLookupValue(
    exercise.equipment
  )}`;
}

function localSessionToCloud(workout, userId, cloudWorkoutId) {
  return {
    completed_at: parseCompletedAt(workout.completedAtIso || workout.completedAt),
    deleted_at: null,
    duration_seconds: workout.durationSeconds || null,
    import_batch_id: null,
    source: LOCAL_APP_SOURCE,
    source_key: String(workout.id),
    started_at:
      workout.startedAtIso || workout.startedAt
        ? parseCompletedAt(workout.startedAtIso || workout.startedAt)
        : null,
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_id: cloudWorkoutId || null,
    workout_name: workout.templateName || workout.name || "Workout",
  };
}

function buildLocalExerciseLookup(exerciseLibrary) {
  return {
    byCloudId: new Map(
      exerciseLibrary
        .filter((exercise) => exercise.exerciseId)
        .map((exercise) => [exercise.exerciseId, exercise])
    ),
    byNameEquipment: new Map(
      exerciseLibrary.map((exercise) => [
        getLocalExerciseMatchKey(exercise),
        exercise,
      ])
    ),
  };
}

function cloudSetToLocal(set) {
  const prescribedReps =
    set.target_reps_label === "AMRAP"
      ? "AMRAP"
      : formatCloudValue(null, set.target_reps_max ?? set.target_reps_min);
  const minimumReps = set.target_reps_min;

  return {
    actualReps: formatCloudValue(null, set.actual_reps),
    actualRir: formatCloudValue(set.actual_rir_label, set.actual_rir_value),
    actualWeight: formatCloudValue(
      set.actual_weight_label,
      set.actual_weight_value
    ),
    completed: Boolean(set.completed_at),
    id: parseLocalSourceKey(set.id),
    isDropSet: Boolean(set.is_drop_set),
    targetWeight: formatCloudValue(
      set.target_weight_label,
      set.target_weight_value
    ),
    ...(minimumReps != null && Number(minimumReps) !== Number(prescribedReps)
      ? {
          minimumReps: String(minimumReps),
          prescribedMinimumReps: String(minimumReps),
        }
      : {}),
    ...(prescribedReps
      ? {
          prescribedReps,
          reps: prescribedReps,
        }
      : {}),
    ...(prescribedReps &&
    (set.target_rir_label != null || set.target_rir_value != null)
      ? {
          prescribedRir: formatCloudValue(
            set.target_rir_label,
            set.target_rir_value
          ),
          rir: formatCloudValue(set.target_rir_label, set.target_rir_value),
        }
      : {}),
  };
}

function cloudExerciseToLocal(exercise, sets, exerciseLookup) {
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

function formatCloudDate(value) {
  const parsed = value ? new Date(value) : null;

  if (parsed && Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }

  return "";
}

function cloudSessionToLocal(session, exercises, workoutSourceKeyById, templates) {
  const templateId =
    session.workout_id && workoutSourceKeyById.has(session.workout_id)
      ? parseLocalSourceKey(workoutSourceKeyById.get(session.workout_id))
      : null;
  const template = templates.find(
    (item) => templateId != null && String(item.id) === String(templateId)
  );

  return {
    completedAt: formatCloudDate(session.completed_at),
    completedAtIso: session.completed_at || null,
    durationSeconds: session.duration_seconds || null,
    exercises,
    id: parseLocalSourceKey(session.source_key),
    planId: template?.planId || null,
    planWeek: null,
    planWorkoutId: template?.planWorkoutId || null,
    startedAt: formatCloudDate(session.started_at),
    startedAtIso: session.started_at || null,
    templateId,
    templateName: session.workout_name || template?.name || "Workout",
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
  const actualRir = set.actualRir ?? "";
  const prescribedReps = set.prescribedReps || set.reps || set.targetReps || "";
  const minimumReps =
    set.prescribedMinimumReps ||
    set.minimumReps ||
    set.minimum_reps ||
    set.targetMinimumReps ||
    prescribedReps;
  const prescribedRir = set.prescribedRir || set.rir || set.targetRir || "";
  const isDropSet = Boolean(set.isDropSet || set.is_drop_set);
  const e1RM = isDropSet
    ? null
    : calculateE1RM(set.actualWeight, set.actualReps, actualRir);

  return {
    actual_reps: parseInteger(set.actualReps),
    actual_rir_label: actualRir !== "" ? String(actualRir) : null,
    actual_rir_value: parseRir(actualRir),
    actual_weight_label: set.actualWeight ? String(set.actualWeight) : null,
    actual_weight_value: parseNumber(set.actualWeight),
    completed_at: set.completed ? new Date().toISOString() : null,
    deleted_at: null,
    estimated_1rm: e1RM,
    is_drop_set: isDropSet,
    session_exercise_id: sessionExerciseId,
    set_number: setNumber,
    target_reps_label: prescribedReps
      ? String(minimumReps) !== String(prescribedReps)
        ? `${minimumReps}-${prescribedReps}`
        : String(prescribedReps)
      : null,
    target_reps_max: parseInteger(prescribedReps),
    target_reps_min: parseInteger(minimumReps),
    target_rir_label: prescribedRir !== "" ? String(prescribedRir) : null,
    target_rir_value: parseRir(prescribedRir),
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
  session,
  options = {}
) {
  const blockedResult = skipBlockedRemoteWrite("workout-history push", {
    removedExercises: 0,
    removedSessions: 0,
    removedSets: 0,
    syncedExercises: 0,
    syncedSessions: 0,
    syncedSets: 0,
  });
  if (blockedResult) return blockedResult;

  assertCloudReady(session);

  const userId = session.user.id;

  // Completed sessions link back to planned workouts/exercises where possible,
  // so refresh planned workout rows before writing history rows.
  if (!options.skipWorkoutRefresh) {
    await uploadWorkouts(templates, exerciseLibrary, session);
  }

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

  let removedSessionIds = [];

  if (!options.preserveCloudHistory) {
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

    removedSessionIds = existingSessions
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

export async function downloadWorkoutHistory(
  currentHistory,
  templates,
  exerciseLibrary,
  session,
  options = {}
) {
  assertCloudReady(session);

  const userId = session.user.id;
  const { data: sessionRows, error: sessionError } = await supabase
    .from("workout_sessions")
    .select(
      "id,workout_id,workout_name,started_at,completed_at,duration_seconds,source_key,updated_at"
    )
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null)
    .order("completed_at", {
      ascending: false,
    });

  if (sessionError) {
    throw sessionError;
  }

  const sessionIds = sessionRows.map((workout) => workout.id);
  const existingHistoryBySourceKey = new Map(
    currentHistory.map((workout) => [String(workout.id), workout])
  );

  if (sessionIds.length === 0) {
    return {
      downloaded: 0,
      history: options.keepLocalOnly === false ? [] : currentHistory,
      localOnly: options.keepLocalOnly === false ? 0 : currentHistory.length,
      updated: 0,
    };
  }

  const exerciseRows = await selectRowsByBatchedIn({
    column: "session_id",
    ids: sessionIds,
    orderColumn: "position",
    select:
      "id,session_id,exercise_id,position,exercise_name,equipment,primary_muscle,secondary_muscles,superset_group,notes",
    table: "session_exercises",
  });

  const exerciseIds = exerciseRows.map((exercise) => exercise.id);
  let setRows = [];

  if (exerciseIds.length > 0) {
    setRows = await selectRowsByBatchedIn({
      column: "session_exercise_id",
      ids: exerciseIds,
      orderColumn: "set_number",
      select:
        "id,session_exercise_id,set_number,target_weight_value,target_weight_label,target_reps_min,target_reps_max,target_reps_label,target_rir_value,target_rir_label,actual_weight_value,actual_weight_label,actual_reps,actual_rir_value,actual_rir_label,estimated_1rm,is_drop_set,completed_at",
      table: "session_sets",
    });
  }

  const workoutIds = sessionRows
    .map((workout) => workout.workout_id)
    .filter(Boolean);
  let workoutSourceKeyById = new Map();

  if (workoutIds.length > 0) {
    const data = await selectRowsByBatchedIn({
      column: "id",
      ids: workoutIds,
      select: "id,source_key",
      table: "workouts",
    });

    workoutSourceKeyById = new Map(
      data.map((workout) => [workout.id, workout.source_key])
    );
  }

  const setsByExerciseId = new Map();
  for (const set of setRows) {
    const sets = setsByExerciseId.get(set.session_exercise_id) || [];
    sets.push(cloudSetToLocal(set));
    setsByExerciseId.set(set.session_exercise_id, sets);
  }

  const exerciseLookup = buildLocalExerciseLookup(exerciseLibrary);
  const exercisesBySessionId = new Map();

  for (const exercise of exerciseRows) {
    const exercises = exercisesBySessionId.get(exercise.session_id) || [];
    exercises.push(
      cloudExerciseToLocal(
        exercise,
        setsByExerciseId.get(exercise.id) || [],
        exerciseLookup
      )
    );
    exercisesBySessionId.set(exercise.session_id, exercises);
  }

  const downloadedHistory = sessionRows.map((workout) =>
    cloudSessionToLocal(
      workout,
      exercisesBySessionId.get(workout.id) || [],
      workoutSourceKeyById,
      templates
    )
  );
  const downloadedSourceKeys = new Set(
    downloadedHistory.map((workout) => String(workout.id))
  );
  const localOnlyHistory = currentHistory.filter(
    (workout) => !downloadedSourceKeys.has(String(workout.id))
  );

  return {
    downloaded: downloadedHistory.length,
    history:
      options.keepLocalOnly === false
        ? downloadedHistory
        : [...downloadedHistory, ...localOnlyHistory],
    localOnly: localOnlyHistory.length,
    updated: downloadedHistory.filter((workout) =>
      existingHistoryBySourceKey.has(String(workout.id))
    ).length,
  };
}
