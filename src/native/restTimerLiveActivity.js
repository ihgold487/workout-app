import { Capacitor, registerPlugin } from "@capacitor/core";

const RestTimerLiveActivity = registerPlugin("RestTimerLiveActivity");

export function canUseNativeRestTimerLiveActivity() {
  return Capacitor.isNativePlatform();
}

async function callNativeRestTimerLiveActivity(method, options = {}) {
  if (!canUseNativeRestTimerLiveActivity()) {
    return false;
  }

  try {
    const result = await RestTimerLiveActivity[method](options);
    return result?.supported !== false;
  } catch (error) {
    console.warn(`Native rest timer Live Activity ${method} failed:`, error);
    return false;
  }
}

export function startNativeRestTimerLiveActivity(seconds, context = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Promise.resolve(false);
  }

  return callNativeRestTimerLiveActivity("start", {
    seconds: Math.ceil(seconds),
    workoutName: context.workoutName || "Workout",
    exerciseName: context.exerciseName || "",
    setNumber: context.setNumber || 0,
    totalSets: context.totalSets || 0,
    startedAtMs:
      Number.isFinite(context.startedAtMs) && context.startedAtMs > 0
        ? context.startedAtMs
        : 0,
  });
}

export function pauseNativeRestTimerLiveActivity(seconds) {
  return callNativeRestTimerLiveActivity("pause", {
    seconds: Math.max(0, Math.ceil(Number(seconds) || 0)),
  });
}

export function resumeNativeRestTimerLiveActivity(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Promise.resolve(false);
  }

  return callNativeRestTimerLiveActivity("resume", {
    seconds: Math.ceil(seconds),
  });
}

export function endNativeRestTimerLiveActivity() {
  return callNativeRestTimerLiveActivity("end");
}

export async function getNativeRestTimerLiveActivityState() {
  if (!canUseNativeRestTimerLiveActivity()) {
    return null;
  }

  try {
    return await RestTimerLiveActivity.getState();
  } catch (error) {
    console.warn("Native rest timer Live Activity state read failed:", error);
    return null;
  }
}
