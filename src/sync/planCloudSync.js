import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { uploadWorkouts } from "./workoutCloudSync";

const LOCAL_APP_SOURCE = "local_app";
const TYPE_3_WORKOUT_SEQUENCE = ["push", "pull", "lower", "upper", "lower"];
const TYPE_5_WORKOUT_SEQUENCE = ["push", "pull", "lower", "upper", "lower"];
const WORKOUT_TYPE_LABELS = {
  push: "Push",
  pull: "Pull",
  upper: "Upper",
  lower: "Lower",
  "full-body": "Full Body",
};
const WORKOUT_TYPE_BY_LABEL = {
  "full body": "full-body",
  "full-body": "full-body",
  lower: "lower",
  pull: "pull",
  push: "push",
  upper: "upper",
};

function normalizeWorkoutTypeValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ");

  return WORKOUT_TYPE_BY_LABEL[normalized] || "";
}

function normalizeWorkoutName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();
}

function inferWorkoutTypeFromName(name) {
  const normalized = ` ${normalizeWorkoutName(name)} `;

  if (/\bfull body\b|\bfull-body\b/.test(normalized)) {
    return "full-body";
  }

  return ["push", "pull", "lower", "upper"].find((type) =>
    new RegExp(`\\b${type}\\b`).test(normalized)
  ) || "";
}

function getSequenceWorkoutType(planType, position) {
  const sequence =
    planType === "type-3"
      ? TYPE_3_WORKOUT_SEQUENCE
      : planType === "type-5"
        ? TYPE_5_WORKOUT_SEQUENCE
        : null;

  return sequence?.[((Number(position) || 1) - 1) % sequence.length] || "";
}

function getNormalizedPlanWorkoutType({
  name,
  planType,
  position,
  storedType,
  templateType,
}) {
  return (
    inferWorkoutTypeFromName(name) ||
    getSequenceWorkoutType(planType, position) ||
    normalizeWorkoutTypeValue(storedType) ||
    normalizeWorkoutTypeValue(templateType) ||
    null
  );
}

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

function parseLocalSourceKey(sourceKey) {
  const numeric = Number(sourceKey);

  return Number.isFinite(numeric) && String(numeric) === String(sourceKey)
    ? numeric
    : sourceKey;
}

function parseDate(value) {
  const parsed = value ? new Date(value) : null;

  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : null;
}

function getPlanCompletionKey(completion) {
  const weekNumber = Number(completion?.weekNumber);
  const planWorkoutId = completion?.planWorkoutId;

  if (!Number.isFinite(weekNumber) || planWorkoutId == null) {
    return null;
  }

  return `${weekNumber}:${String(planWorkoutId)}`;
}

function mergePlanCompletions(localCompletions = [], cloudCompletions = []) {
  const mergedByKey = new Map();

  for (const completion of cloudCompletions) {
    const key = getPlanCompletionKey(completion);

    if (key) {
      mergedByKey.set(key, completion);
    }
  }

  for (const completion of localCompletions) {
    const key = getPlanCompletionKey(completion);

    if (key) {
      mergedByKey.set(key, completion);
    }
  }

  return Array.from(mergedByKey.values()).sort((a, b) => {
    const weekDiff = Number(a.weekNumber) - Number(b.weekNumber);

    if (weekDiff !== 0) {
      return weekDiff;
    }

    return String(a.planWorkoutId).localeCompare(String(b.planWorkoutId));
  });
}

function localPlanToCloud(plan, userId, existingCloudPlan = null) {
  const existingPlanConfig = existingCloudPlan?.plan_config || {};
  const existingCloudCompletions = Array.isArray(existingPlanConfig.completions)
    ? existingPlanConfig.completions
    : [];
  const localCompletions = Array.isArray(plan.completions)
    ? plan.completions
    : [];
  const completions = mergePlanCompletions(
    localCompletions,
    existingCloudCompletions
  );
  const currentWeek = Math.max(
    Number(plan.currentWeek) || 1,
    Number(existingPlanConfig.currentWeek) || 1
  );

  return {
    days_per_week: plan.daysPerWeek || null,
    deleted_at: null,
    description: plan.description || null,
    duration_weeks: plan.durationWeeks || null,
    ends_on: plan.endsOn || null,
    is_open_ended: Boolean(plan.isOpenEnded),
    name: plan.name,
    plan_config: {
      completions,
      config: plan.config || {},
      createdAt: plan.createdAt || null,
      currentWeek,
      goal: plan.goal || "maintain",
      planType: plan.planType || "type-2",
    },
    source: LOCAL_APP_SOURCE,
    source_key: String(plan.id),
    starts_on: plan.startsOn || null,
    status: plan.status || "inactive",
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

function localPlanWorkoutToCloud({
  cloudPlanId,
  cloudWorkoutId,
  plan,
  planWorkout,
  position,
  template,
  templateId,
  userId,
}) {
  const targetRir = plan.config?.rir ?? "";
  const weeklyPrescriptionsByPosition = (template?.exercises || []).reduce(
    (prescriptions, exercise, exerciseIndex) => {
      if (Array.isArray(exercise.weeklyPrescriptions)) {
        prescriptions[exerciseIndex + 1] = exercise.weeklyPrescriptions;
      }

      return prescriptions;
    },
    {}
  );
  const workoutType = getNormalizedPlanWorkoutType({
    name: planWorkout.name || template?.name,
    planType: plan.planType,
    position,
    storedType: planWorkout.workoutType,
    templateType: template?.workoutType,
  });

  return {
    day_number: planWorkout.dayNumber || position,
    deleted_at: null,
    name: planWorkout.name || `Workout ${position}`,
    phase: planWorkout.phase || null,
    position,
    target_rir_label: targetRir !== "" ? String(targetRir) : null,
    target_rir_value: targetRir === "" ? 0 : Number.parseInt(targetRir, 10) || 0,
    training_plan_id: cloudPlanId,
    updated_at: new Date().toISOString(),
    user_id: userId,
    week_number: planWorkout.weekNumber || null,
    workout_id: cloudWorkoutId || null,
    workout_rules: {
      planWorkoutId: planWorkout.planWorkoutId || null,
      templateId: templateId || planWorkout.templateId || null,
      weeklyPrescriptionsByPosition,
      workoutType,
      workoutTypeLabel:
        workoutType ? WORKOUT_TYPE_LABELS[workoutType] || null : null,
    },
  };
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

async function loadWorkoutSourceKeyMap(userId, workoutIds) {
  if (workoutIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("workouts")
    .select("id,source_key")
    .in("id", workoutIds)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return new Map(data.map((workout) => [workout.id, workout.source_key]));
}

async function softDeleteMissingPlanWorkouts({
  cloudPlanId,
  keptIds,
  userId,
}) {
  const { data, error } = await supabase
    .from("training_plan_workouts")
    .select("id")
    .eq("user_id", userId)
    .eq("training_plan_id", cloudPlanId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const missingIds = data
    .map((row) => row.id)
    .filter((id) => !keptIds.includes(id));

  if (missingIds.length === 0) {
    return 0;
  }

  const { error: deleteError } = await supabase
    .from("training_plan_workouts")
    .update({
      deleted_at: new Date().toISOString(),
    })
    .in("id", missingIds);

  if (deleteError) {
    throw deleteError;
  }

  return missingIds.length;
}

async function upsertPlanWorkoutByPosition(record) {
  const { data: existing, error: loadError } = await supabase
    .from("training_plan_workouts")
    .select("id")
    .eq("user_id", record.user_id)
    .eq("training_plan_id", record.training_plan_id)
    .eq("position", record.position)
    .maybeSingle();

  if (loadError) {
    throw loadError;
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from("training_plan_workouts")
      .update(record)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data.id;
  }

  const { data, error } = await supabase
    .from("training_plan_workouts")
    .insert(record)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

export async function uploadPlans(
  plans,
  templates,
  exerciseLibrary,
  session,
  options = {}
) {
  assertCloudReady(session);

  const userId = session.user.id;

  if (!options.skipWorkoutRefresh) {
    await uploadWorkouts(templates, exerciseLibrary, session);
  }

  const sourceKeys = plans.map((plan) => String(plan.id));
  const { data: existingPlanRows, error: existingPlanError } = sourceKeys.length
    ? await supabase
        .from("training_plans")
        .select("source_key,plan_config")
        .eq("user_id", userId)
        .eq("source", LOCAL_APP_SOURCE)
        .in("source_key", sourceKeys)
        .is("deleted_at", null)
    : { data: [], error: null };

  if (existingPlanError) {
    throw existingPlanError;
  }

  const existingPlansBySourceKey = new Map(
    (existingPlanRows || []).map((plan) => [plan.source_key, plan])
  );
  const planRecords = plans.map((plan) =>
    localPlanToCloud(plan, userId, existingPlansBySourceKey.get(String(plan.id)))
  );

  if (planRecords.length > 0) {
    const { error } = await supabase.from("training_plans").upsert(planRecords, {
      onConflict: "user_id,source,source_key",
    });

    if (error) {
      throw error;
    }
  }

  const { data: cloudPlans, error: cloudPlanError } = await supabase
    .from("training_plans")
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (cloudPlanError) {
    throw cloudPlanError;
  }

  const cloudPlansBySourceKey = new Map(
    cloudPlans.map((plan) => [plan.source_key, plan.id])
  );
  const workoutIdsBySourceKey = await loadWorkoutIdMap(userId);

  let syncedPlanWorkouts = 0;
  let removedPlanWorkouts = 0;

  for (const plan of plans) {
    const cloudPlanId = cloudPlansBySourceKey.get(String(plan.id));

    if (!cloudPlanId) {
      continue;
    }

    const keptIds = [];

    for (const [index, planWorkout] of (plan.workouts || []).entries()) {
      const template =
        templates.find(
          (item) => String(item.id) === String(planWorkout.templateId)
        ) ||
        templates.find(
          (item) =>
            String(item.planWorkoutId) === String(planWorkout.planWorkoutId)
        );
      const templateId = template?.id || planWorkout.templateId;
      const record = localPlanWorkoutToCloud({
        cloudPlanId,
        cloudWorkoutId: workoutIdsBySourceKey.get(String(templateId)),
        plan,
        planWorkout,
        position: index + 1,
        template,
        templateId,
        userId,
      });
      const id = await upsertPlanWorkoutByPosition(record);

      keptIds.push(id);
      syncedPlanWorkouts += 1;
    }

    removedPlanWorkouts += await softDeleteMissingPlanWorkouts({
      cloudPlanId,
      keptIds,
      userId,
    });
  }

  const removedPlanIds = cloudPlans
    .filter((plan) => !sourceKeys.includes(plan.source_key))
    .map((plan) => plan.id);

  if (removedPlanIds.length > 0) {
    const { error } = await supabase
      .from("training_plans")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .in("id", removedPlanIds);

    if (error) {
      throw error;
    }
  }

  return {
    removedPlanWorkouts,
    removedPlans: removedPlanIds.length,
    syncedPlanWorkouts,
    syncedPlans: planRecords.length,
  };
}

function cloudPlanToLocal(plan, planWorkouts, workoutSourceKeyById, existingPlan) {
  const planConfig = plan.plan_config || {};
  const planType = planConfig.planType || existingPlan?.planType || "type-2";

  return {
    ...(existingPlan || {}),
    completions: Array.isArray(planConfig.completions)
      ? planConfig.completions
      : [],
    config: planConfig.config || {},
    createdAt:
      planConfig.createdAt || parseDate(plan.created_at) || existingPlan?.createdAt,
    currentWeek: planConfig.currentWeek || 1,
    daysPerWeek: plan.days_per_week || existingPlan?.daysPerWeek || null,
    description: plan.description || existingPlan?.description || "",
    durationWeeks: plan.duration_weeks || existingPlan?.durationWeeks || null,
    goal: planConfig.goal || existingPlan?.goal || "maintain",
    id: parseLocalSourceKey(plan.source_key),
    isOpenEnded: Boolean(plan.is_open_ended),
    name: plan.name,
    planType,
    status: plan.status || "inactive",
    workouts: planWorkouts.map((workout) => {
      const rules = workout.workout_rules || {};
      const workoutType = getNormalizedPlanWorkoutType({
        name: workout.name,
        planType,
        position: workout.position,
        storedType: rules.workoutType,
      });
      const templateId =
        workout.workout_id && workoutSourceKeyById.has(workout.workout_id)
          ? parseLocalSourceKey(workoutSourceKeyById.get(workout.workout_id))
          : rules.templateId != null
            ? parseLocalSourceKey(rules.templateId)
            : null;

      return {
        dayNumber: workout.day_number || workout.position,
        name: workout.name,
        phase: workout.phase || null,
        planWorkoutId:
          rules.planWorkoutId ||
          `${parseLocalSourceKey(plan.source_key)}:workout-${workout.position}`,
        templateId,
        weekNumber: workout.week_number || null,
        weeklyPrescriptionsByPosition:
          rules.weeklyPrescriptionsByPosition || {},
        workoutType,
        workoutTypeLabel:
          workoutType ? WORKOUT_TYPE_LABELS[workoutType] || null : null,
      };
    }),
  };
}

export async function downloadPlans(
  currentPlans,
  templates,
  session,
  options = {}
) {
  assertCloudReady(session);

  const userId = session.user.id;
  const { data: planRows, error: planError } = await supabase
    .from("training_plans")
    .select(
      "id,name,description,duration_weeks,days_per_week,is_open_ended,starts_on,ends_on,status,plan_config,source_key,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null)
    .order("updated_at", {
      ascending: false,
    });

  if (planError) {
    throw planError;
  }

  const planIds = planRows.map((plan) => plan.id);
  const existingPlansBySourceKey = new Map(
    currentPlans.map((plan) => [String(plan.id), plan])
  );

  if (planIds.length === 0) {
    return {
      downloaded: 0,
      localOnly: options.keepLocalOnly === false ? 0 : currentPlans.length,
      plans: options.keepLocalOnly === false ? [] : currentPlans,
      updated: 0,
    };
  }

  const { data: planWorkoutRows, error: planWorkoutError } = await supabase
    .from("training_plan_workouts")
    .select(
      "id,training_plan_id,workout_id,week_number,day_number,position,name,phase,target_rir_value,target_rir_label,workout_rules"
    )
    .in("training_plan_id", planIds)
    .is("deleted_at", null)
    .order("position", {
      ascending: true,
    });

  if (planWorkoutError) {
    throw planWorkoutError;
  }

  const workoutSourceKeyById = await loadWorkoutSourceKeyMap(
    userId,
    planWorkoutRows.map((workout) => workout.workout_id).filter(Boolean)
  );
  const planWorkoutsByPlanId = new Map();

  for (const workout of planWorkoutRows) {
    const workouts = planWorkoutsByPlanId.get(workout.training_plan_id) || [];
    workouts.push(workout);
    planWorkoutsByPlanId.set(workout.training_plan_id, workouts);
  }

  const downloadedPlans = planRows.map((plan) =>
    cloudPlanToLocal(
      plan,
      planWorkoutsByPlanId.get(plan.id) || [],
      workoutSourceKeyById,
      existingPlansBySourceKey.get(String(plan.source_key)),
      templates
    )
  );
  const downloadedSourceKeys = new Set(
    downloadedPlans.map((plan) => String(plan.id))
  );
  const localOnlyPlans = currentPlans.filter(
    (plan) => !downloadedSourceKeys.has(String(plan.id))
  );
  const keptLocalOnlyPlans =
    options.keepLocalOnly === false ? [] : localOnlyPlans;

  return {
    downloaded: downloadedPlans.length,
    localOnly: localOnlyPlans.length,
    plans: [...downloadedPlans, ...keptLocalOnlyPlans],
    updated: downloadedPlans.filter((plan) =>
      existingPlansBySourceKey.has(String(plan.id))
    ).length,
  };
}
