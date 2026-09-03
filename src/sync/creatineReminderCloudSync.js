import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { skipBlockedRemoteWrite } from "./remoteWritePolicy";

const CREATINE_REMINDER_SETTINGS_TABLE = "user_creatine_reminder_settings";
const DEFAULT_REMINDER_TIME = "16:00";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  if (!session?.user?.id) throw new Error("Sign in before using cloud sync.");
}

function normalizeTime(value) {
  const time = String(value || "").trim();
  const match = time.match(/^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  return match ? match[1] : DEFAULT_REMINDER_TIME;
}

export async function downloadCreatineReminderSettings(session) {
  assertCloudReady(session);

  const { data, error } = await supabase
    .from(CREATINE_REMINDER_SETTINGS_TABLE)
    .select("enabled,reminder_time,updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    enabled: Boolean(data.enabled),
    time: normalizeTime(data.reminder_time),
    updatedAt: data.updated_at || null,
  };
}

export async function upsertCreatineReminderSettings(settings, session) {
  const blockedResult = skipBlockedRemoteWrite("creatine-reminder push", {
    applied: false,
  });
  if (blockedResult) return blockedResult;

  assertCloudReady(session);
  const { error } = await supabase.from(CREATINE_REMINDER_SETTINGS_TABLE).upsert(
    {
      enabled: Boolean(settings?.enabled),
      reminder_time: normalizeTime(settings?.time),
      updated_at: settings?.updatedAt || new Date().toISOString(),
      user_id: session.user.id,
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  return { applied: true };
}
