import { Capacitor, registerPlugin } from "@capacitor/core";

const PROVISIONING_EXPIRY_REMINDERS = [
  {
    id: 1201,
    leadTimeMs: 12 * 60 * 60 * 1000,
    title: "Development app expires in 12 hours",
  },
  {
    id: 1202,
    leadTimeMs: 2 * 60 * 60 * 1000,
    title: "Development app expires in 2 hours",
  },
];

const LocalNotifications = registerPlugin("LocalNotifications");
const ProvisioningExpiry = registerPlugin("ProvisioningExpiry");
let notificationOperation = Promise.resolve();

function canUseNativeProvisioningExpiryReminder() {
  return Capacitor.isNativePlatform();
}

function reminderIds() {
  return PROVISIONING_EXPIRY_REMINDERS.map(({ id }) => ({ id }));
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

export async function getNativeProvisioningExpiration() {
  if (!canUseNativeProvisioningExpiryReminder()) {
    return null;
  }

  try {
    const { expirationDate } = await ProvisioningExpiry.getExpiration();
    const expiration = new Date(expirationDate);

    return Number.isFinite(expiration.getTime()) ? expiration : null;
  } catch (error) {
    console.warn("Provisioning expiration lookup failed:", error);
    return null;
  }
}

export async function scheduleNativeProvisioningExpiryReminders(
  expiration,
  { requestPermission = false } = {}
) {
  if (!canUseNativeProvisioningExpiryReminder()) {
    return { status: "unsupported" };
  }

  if (!(expiration instanceof Date) || !Number.isFinite(expiration.getTime())) {
    return { status: "unavailable" };
  }

  const operation = notificationOperation.then(async () => {
    try {
      if (!(await hasNotificationPermission(requestPermission))) {
        return {
          status: requestPermission ? "denied" : "permission-required",
        };
      }

      await LocalNotifications.cancel({ notifications: reminderIds() });

      const now = Date.now();
      const notifications = PROVISIONING_EXPIRY_REMINDERS.map((reminder) => {
        const date = new Date(expiration.getTime() - reminder.leadTimeMs);

        return {
          ...reminder,
          date,
        };
      })
        .filter(({ date }) => date.getTime() > now)
        .map(({ id, title, date }) => ({
          id,
          title,
          body: "Rebuild and reinstall it from Xcode before it expires.",
          schedule: { at: date },
        }));

      if (notifications.length === 0) {
        return { status: "expired" };
      }

      await LocalNotifications.schedule({ notifications });
      return { status: "scheduled" };
    } catch (error) {
      console.warn("Provisioning expiry reminder scheduling failed:", error);
      return { status: "error" };
    }
  });

  notificationOperation = operation.catch(() => ({ status: "error" }));
  return operation;
}
