import { isSupabaseConfigured, supabase } from "./supabaseClient";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

async function getActiveCount(table, session) {
  const { count, error } = await supabase
    .from(table)
    .select("*", {
      count: "exact",
      head: true,
    })
    .or(`user_id.eq.${session.user.id},user_id.is.null`)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return count || 0;
}

async function getUserActiveCount(table, session) {
  const { count, error } = await supabase
    .from(table)
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", session.user.id)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return count || 0;
}

async function getUserCount(table, session) {
  const { count, error } = await supabase
    .from(table)
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", session.user.id);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function getNormalizedCloudSummary(session) {
  assertCloudReady(session);

  const [
    exercises,
    workouts,
    workoutExercises,
    workoutExerciseSets,
    workoutSessions,
    sessionExercises,
    sessionSets,
    trainingPlans,
    trainingPlanWorkouts,
    nutritionEntries,
    nutritionFoods,
    nutritionTargets,
    bodyMeasurements,
    exercisePreferences,
  ] = await Promise.all([
    getActiveCount("exercises", session),
    getUserActiveCount("workouts", session),
    getUserActiveCount("workout_exercises", session),
    getUserActiveCount("workout_exercise_sets", session),
    getUserActiveCount("workout_sessions", session),
    getUserActiveCount("session_exercises", session),
    getUserActiveCount("session_sets", session),
    getUserActiveCount("training_plans", session),
    getUserActiveCount("training_plan_workouts", session),
    getUserActiveCount("nutrition_entries", session),
    getActiveCount("nutrition_foods", session),
    getUserActiveCount("nutrition_daily_targets", session),
    getUserActiveCount("body_measurements", session),
    getUserCount("user_exercise_preferences", session),
  ]);

  const { data: recentSessions, error: latestError } = await supabase
    .from("workout_sessions")
    .select("completed_at,source_key,workout_name")
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .order("completed_at", {
      ascending: false,
    })
    .limit(10);

  if (latestError) {
    throw latestError;
  }

  const { data: maxE1RMSet, error: maxE1RMError } = await supabase
    .from("session_sets")
    .select("estimated_1rm")
    .eq("user_id", session.user.id)
    .is("deleted_at", null)
    .not("estimated_1rm", "is", null)
    .order("estimated_1rm", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (maxE1RMError) {
    throw maxE1RMError;
  }

  return {
    bodyMeasurements,
    exercisePreferences,
    exercises,
    latestSession: recentSessions?.[0] || null,
    maxE1RM: maxE1RMSet?.estimated_1rm ?? null,
    nutritionEntries,
    nutritionFoods,
    nutritionTargets,
    recentSessions: recentSessions || [],
    sessionExercises,
    sessionSets,
    trainingPlanWorkouts,
    trainingPlans,
    workoutExerciseSets,
    workoutExercises,
    workoutSessions,
    workouts,
  };
}
