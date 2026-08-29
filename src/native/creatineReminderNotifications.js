import { Capacitor, registerPlugin } from "@capacitor/core";

const CREATINE_NOTIFICATION_ID_START = 1100;
const CREATINE_NOTIFICATION_DAYS = 30;
const LocalNotifications = registerPlugin("LocalNotifications");
let notificationOperation = Promise.resolve();

export function canUseNativeCreatineNotifications() {
  return Capacitor.isNativePlatform();
}

function notificationIds() {
  return Array.from({ length: CREATINE_NOTIFICATION_DAYS }, (_, index) => ({
    id: CREATINE_NOTIFICATION_ID_START + index,
  }));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function reminderDates(time, skippedDates = []) {
  const [hours, minutes] = String(time || "").split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return [];
  }

  const now = new Date();
  const skipped = new Set(skippedDates);
  const dates = [];

  for (let offset = 0; dates.length < CREATINE_NOTIFICATION_DAYS; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    date.setHours(hours, minutes, 0, 0);

    if (date <= now || skipped.has(localDateKey(date))) {
      continue;
    }

    dates.push(date);
  }

  return dates;
}

async function hasNotificationPermission(requestPermission) {
  const current = await LocalNotifications.checkPermissions();

  if (current.display === "granted") {
    return true;
  }

  if (!requestPermission || current.display === "denied") {
    return false;
  }

  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export async function cancelNativeCreatineNotifications() {
  if (!canUseNativeCreatineNotifications()) {
    return true;
  }

  const operation = notificationOperation.then(async () => {
    try {
      await LocalNotifications.cancel({ notifications: notificationIds() });
      return true;
    } catch (error) {
      console.warn("Creatine reminder cancellation failed:", error);
      return false;
    }
  });

  notificationOperation = operation.catch(() => false);
  return operation;
}

export async function scheduleNativeCreatineNotifications({
  requestPermission = false,
  skippedDates = [],
  time,
}) {
  if (!canUseNativeCreatineNotifications()) {
    return { status: "unsupported" };
  }

  const operation = notificationOperation.then(async () => {
    try {
      if (!(await hasNotificationPermission(requestPermission))) {
        return {
          status: requestPermission ? "denied" : "permission-required",
        };
      }

      await LocalNotifications.cancel({ notifications: notificationIds() });

      const dates = reminderDates(time, skippedDates);
      await LocalNotifications.schedule({
        notifications: dates.map((date, index) => ({
          id: CREATINE_NOTIFICATION_ID_START + index,
          title: "Creatine reminder",
          body: "Remember to take your creatine today.",
          schedule: { at: date },
          sound: "default",
        })),
      });

      return { status: "scheduled" };
    } catch (error) {
      console.warn("Creatine reminder scheduling failed:", error);
      return { status: "error" };
    }
  });

  notificationOperation = operation.catch(() => ({ status: "error" }));
  return operation;
}
