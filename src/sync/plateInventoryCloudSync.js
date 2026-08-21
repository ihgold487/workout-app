import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { skipBlockedRemoteWrite } from "./remoteWritePolicy";

const PLATE_INVENTORIES_TABLE = "equipment_plate_inventories";

function assertCloudReady(session) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before using cloud sync.");
  }
}

export async function downloadPlateInventory(session) {
  assertCloudReady(session);

  const { data, error } = await supabase
    .from(PLATE_INVENTORIES_TABLE)
    .select("inventory,updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    inventory: data?.inventory || null,
    updatedAt: data?.updated_at || null,
  };
}

export async function uploadPlateInventory(inventory, session) {
  const blockedResult = skipBlockedRemoteWrite("plate-inventory push", { uploaded: 0 });
  if (blockedResult) return blockedResult;

  assertCloudReady(session);

  const { error } = await supabase
    .from(PLATE_INVENTORIES_TABLE)
    .upsert(
      {
        inventory,
        updated_at: new Date().toISOString(),
        user_id: session.user.id,
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    throw error;
  }

  return {
    uploaded: 1,
  };
}
