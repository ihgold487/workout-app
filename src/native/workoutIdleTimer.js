import { Capacitor, registerPlugin } from "@capacitor/core";

const WorkoutIdleTimer = registerPlugin("WorkoutIdleTimer");

export function canUseNativeWorkoutIdleTimer() {
  return Capacitor.isNativePlatform();
}

export async function setNativeWorkoutAutoLockEnabled(enabled) {
  if (!canUseNativeWorkoutIdleTimer()) {
    return false;
  }

  try {
    await WorkoutIdleTimer.setAutoLockEnabled({ enabled });
    return true;
  } catch (error) {
    console.warn("Native workout auto-lock update failed:", error);
    return false;
  }
}
