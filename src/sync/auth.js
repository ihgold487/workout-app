import { isSupabaseConfigured, supabase } from "./supabaseClient";

export async function getCurrentSession() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export function subscribeToAuthChanges(callback) {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signInWithPassword(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signUpWithPassword(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function changePasswordWithCurrentPassword(
  email,
  currentPassword,
  newPassword
) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (signInError) {
    throw new Error("Current password is incorrect.");
  }

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function getMyApprovalStatus() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("get_my_app_approval_status");

  if (error) {
    throw error;
  }

  return data;
}

export async function listAppUserApprovals() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("list_app_user_approvals");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function updateAppUserApproval(userId, status, notes = null) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.rpc("update_app_user_approval", {
    target_user_id: userId,
    next_status: status,
    approval_notes: notes,
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  if (!isSupabaseConfigured) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
