import {
  createWorkoutBackup,
  WORKOUT_DATA_SCHEMA_VERSION,
} from "../storage/workoutStorage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { skipBlockedRemoteWrite } from "./remoteWritePolicy";

const SNAPSHOT_TABLE = "workout_data_snapshots";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

export async function uploadWorkoutSnapshot(data, storageVersion, session) {
  if (skipBlockedRemoteWrite("legacy workout snapshot push", true)) return;

  assertCloudReady(session);

  // First cloud milestone: one full app snapshot per user. This is intentionally
  // simple while the workout/program data model is still evolving pre-production.
  const snapshot = createWorkoutBackup(data);

  const { error } = await supabase.from(SNAPSHOT_TABLE).upsert({
    data: snapshot.data,
    schema_version: WORKOUT_DATA_SCHEMA_VERSION,
    storage_version: storageVersion,
    updated_at: new Date().toISOString(),
    user_id: session.user.id,
  });

  if (error) {
    throw error;
  }
}

export async function downloadWorkoutSnapshot(session) {
  assertCloudReady(session);

  const { data, error } = await supabase
    .from(SNAPSHOT_TABLE)
    .select("data,schema_version,storage_version,updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
