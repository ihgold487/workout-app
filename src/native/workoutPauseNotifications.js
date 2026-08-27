import { Capacitor, registerPlugin } from "@capacitor/core";

const WORKOUT_PAUSE_NOTIFICATION_ID = 1002;
const LocalNotifications = registerPlugin("LocalNotifications");

export function canUseNativeWorkoutPauseNotifications() {
  return Capacitor.isNativePlatform();
}

async function ensureNotificationPermission() {
  const current = await LocalNotifications.checkPermissions();

  if (current.display === "granted") {
    return true;
  }

  if (current.display === "denied") {
    return false;
  }

  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export function formatWorkoutPauseDuration(seconds) {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

export async function scheduleWorkoutPauseNotification(
  delaySeconds,
  pausedDurationSeconds
) {
  if (
    !canUseNativeWorkoutPauseNotifications() ||
    !Number.isFinite(delaySeconds) ||
    delaySeconds <= 0
  ) {
    return false;
  }

  try {
    if (!(await ensureNotificationPermission())) {
      return false;
    }

    await cancelWorkoutPauseNotification();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: WORKOUT_PAUSE_NOTIFICATION_ID,
          title: "⚠️ Workout paused",
          body: `Your workout has been paused for ${formatWorkoutPauseDuration(
            pausedDurationSeconds
          )}. Are you still working out?`,
          sound: "default",
          schedule: {
            at: new Date(Date.now() + Math.ceil(delaySeconds) * 1000),
          },
        },
      ],
    });

    return true;
  } catch (error) {
    console.warn("Workout pause notification scheduling failed:", error);
    return false;
  }
}

export async function cancelWorkoutPauseNotification() {
  if (!canUseNativeWorkoutPauseNotifications()) {
    return false;
  }

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: WORKOUT_PAUSE_NOTIFICATION_ID }],
    });
    return true;
  } catch (error) {
    console.warn("Workout pause notification cancellation failed:", error);
    return false;
  }
}
