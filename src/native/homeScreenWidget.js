import { Capacitor, registerPlugin } from "@capacitor/core";

const RestTimerLiveActivity = registerPlugin("RestTimerLiveActivity");

export async function publishHomeScreenWidget(snapshot) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await RestTimerLiveActivity.publishHomeWidget({ snapshot });
  } catch (error) {
    console.warn("Unable to update the home-screen widget:", error);
  }
}

export async function consumeHomeScreenWidgetAction() {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const result = await RestTimerLiveActivity.consumeHomeWidgetAction();
    return result?.action || null;
  } catch (error) {
    console.warn("Unable to read the home-screen widget action:", error);
    return null;
  }
}

export function addHomeScreenWidgetActionListener(listener) {
  if (!Capacitor.isNativePlatform()) {
    return Promise.resolve({ remove() {} });
  }

  return RestTimerLiveActivity.addListener("homeWidgetAction", listener);
}
