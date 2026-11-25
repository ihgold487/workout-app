import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { skipBlockedRemoteWrite } from "./remoteWritePolicy";

const LOCAL_APP_SOURCE = "local_app";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

function parseLocalSourceKey(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(numeric) === String(value)
    ? numeric
    : value;
}

function templateToCloud(template, userId) {
  return {
    created_at: template.createdAt || new Date().toISOString(),
    deleted_at: null,
    exercise_snapshot: template.exercise || {},
    last_completed_at: template.lastCompletedAt || null,
    name: template.name,
    prescription: template.prescription || {},
    source: LOCAL_APP_SOURCE,
    source_key: String(template.id),
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_format: template.format,
  };
}

function logToCloud(log, userId) {
  return {
    completed_at: log.completedAt || new Date().toISOString(),
    created_at: log.createdAt || log.completedAt || new Date().toISOString(),
    deleted_at: null,
    exercise_snapshot: log.exercise || {},
    notes: log.notes || null,
    prescription: log.prescription || {},
    results: log.results || {},
    source: LOCAL_APP_SOURCE,
    source_key: String(log.id),
    started_at: log.startedAt || null,
    template_name: log.templateName || null,
    template_source_key:
      log.templateId == null ? null : String(log.templateId),
    updated_at: new Date().toISOString(),
    user_id: userId,
    workout_format: log.format,
  };
}

async function softDeleteMissingRows(table, sourceKeys, userId) {
  const { data, error } = await supabase
    .from(table)
    .select("id,source_key")
    .eq("user_id", userId)
    .eq("source", LOCAL_APP_SOURCE)
    .is("deleted_at", null);

  if (error) throw error;

  const missingIds = (data || [])
    .filter((row) => !sourceKeys.includes(String(row.source_key)))
    .map((row) => row.id);

  if (missingIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .in("id", missingIds);

  if (deleteError) throw deleteError;
}

export async function uploadCardioWorkouts(
  templates = [],
  history = [],
  session
) {
  if (skipBlockedRemoteWrite("cardio workout push", true)) return;

  assertCloudReady(session);
  const userId = session.user.id;
  const templateRows = templates.map((template) => templateToCloud(template, userId));
  const logRows = history.map((log) => logToCloud(log, userId));

  if (templateRows.length > 0) {
    const { error } = await supabase
      .from("cardio_workout_templates")
      .upsert(templateRows, { onConflict: "user_id,source,source_key" });
    if (error) throw error;
  }

  if (logRows.length > 0) {
    const { error } = await supabase
      .from("cardio_workout_logs")
      .upsert(logRows, { onConflict: "user_id,source,source_key" });
    if (error) throw error;
  }

  await softDeleteMissingRows(
    "cardio_workout_templates",
    templates.map((template) => String(template.id)),
    userId
  );
  await softDeleteMissingRows(
    "cardio_workout_logs",
    history.map((log) => String(log.id)),
    userId
  );
}

function cloudTemplateToLocal(template) {
  return {
    createdAt: template.created_at,
    exercise: template.exercise_snapshot || {},
    format: template.workout_format,
    id: parseLocalSourceKey(template.source_key),
    lastCompletedAt: template.last_completed_at || null,
    name: template.name,
    prescription: template.prescription || {},
    updatedAt: template.updated_at,
  };
}

function cloudLogToLocal(log) {
  return {
    completedAt: log.completed_at,
    createdAt: log.created_at,
    exercise: log.exercise_snapshot || {},
    format: log.workout_format,
    id: parseLocalSourceKey(log.source_key),
    notes: log.notes || "",
    prescription: log.prescription || {},
    results: log.results || {},
    startedAt: log.started_at || null,
    templateId:
      log.template_source_key == null
        ? null
        : parseLocalSourceKey(log.template_source_key),
    templateName: log.template_name || "",
    updatedAt: log.updated_at,
  };
}

export async function downloadCardioWorkouts(
  localTemplates = [],
  localHistory = [],
  session,
  { keepLocalOnly = false } = {}
) {
  assertCloudReady(session);

  const [templateResponse, logResponse] = await Promise.all([
    supabase
      .from("cardio_workout_templates")
      .select("*")
      .eq("user_id", session.user.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("cardio_workout_logs")
      .select("*")
      .eq("user_id", session.user.id)
      .is("deleted_at", null)
      .order("completed_at", { ascending: false }),
  ]);

  if (templateResponse.error) throw templateResponse.error;
  if (logResponse.error) throw logResponse.error;

  return {
    history: keepLocalOnly
      ? localHistory
      : (logResponse.data || []).map(cloudLogToLocal),
    templates: keepLocalOnly
      ? localTemplates
      : (templateResponse.data || []).map(cloudTemplateToLocal),
  };
}
