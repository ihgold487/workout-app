import { Capacitor, registerPlugin } from "@capacitor/core";

const REST_TIMER_NOTIFICATION_ID = 1001;
const LocalNotifications = registerPlugin("LocalNotifications");

export function canUseNativeRestNotifications() {
  return Capacitor.isNativePlatform();
}

async function ensureNativeRestNotificationPermission(notifications) {
  const current = await notifications.checkPermissions();

  if (current.display === "granted") {
    return true;
  }

  if (current.display === "denied") {
    return false;
  }

  const requested = await notifications.requestPermissions();
  return requested.display === "granted";
}

export async function scheduleNativeRestTimerNotification(seconds) {
  if (
    !canUseNativeRestNotifications() ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return false;
  }

  try {
    const hasPermission =
      await ensureNativeRestNotificationPermission(LocalNotifications);

    if (!hasPermission) {
      return false;
    }

    await LocalNotifications.cancel({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_TIMER_NOTIFICATION_ID,
          title: "Rest complete",
          body: "Ready for next set",
          sound: "default",
          schedule: {
            at: new Date(Date.now() + Math.ceil(seconds) * 1000),
          },
        },
      ],
    });

    return true;
  } catch (error) {
    console.warn("Native rest timer notification scheduling failed:", error);
    return false;
  }
}

export async function cancelNativeRestTimerNotification() {
  if (!canUseNativeRestNotifications()) {
    return false;
  }

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });

    return true;
  } catch (error) {
    console.warn("Native rest timer notification cancellation failed:", error);
    return false;
  }
}
