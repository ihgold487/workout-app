import { Capacitor, registerPlugin } from "@capacitor/core";

const WORKOUT_INACTIVITY_NOTIFICATION_ID = 1003;
const LocalNotifications = registerPlugin("LocalNotifications");

export function canUseNativeWorkoutInactivityNotifications() {
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

export async function scheduleWorkoutInactivityNotification(delaySeconds) {
  if (
    !canUseNativeWorkoutInactivityNotifications() ||
    !Number.isFinite(delaySeconds) ||
    delaySeconds <= 0
  ) {
    return false;
  }

  try {
    if (!(await ensureNotificationPermission())) {
      return false;
    }

    await cancelWorkoutInactivityNotification();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: WORKOUT_INACTIVITY_NOTIFICATION_ID,
          title: "⚠️ No recent sets",
          body: "No sets have been completed in 6 minutes. Are you still working out?",
          sound: "default",
          schedule: {
            at: new Date(Date.now() + Math.ceil(delaySeconds) * 1000),
          },
        },
      ],
    });

    return true;
  } catch (error) {
    console.warn("Workout inactivity notification scheduling failed:", error);
    return false;
  }
}

export async function cancelWorkoutInactivityNotification() {
  if (!canUseNativeWorkoutInactivityNotifications()) {
    return false;
  }

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: WORKOUT_INACTIVITY_NOTIFICATION_ID }],
    });
    return true;
  } catch (error) {
    console.warn("Workout inactivity notification cancellation failed:", error);
    return false;
  }
}
