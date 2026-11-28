import { Capacitor, registerPlugin } from "@capacitor/core";

const AppleHealth = registerPlugin("AppleHealth");

export function canUseNativeAppleHealth() {
  return Capacitor.getPlatform() === "ios";
}

export async function getHeartRateAuthorizationStatus() {
  if (!canUseNativeAppleHealth()) {
    return { available: false, requestStatus: "unavailable" };
  }

  return AppleHealth.getHeartRateAuthorizationStatus();
}

export async function requestHeartRateAuthorization() {
  if (!canUseNativeAppleHealth()) {
    return { requestCompleted: false };
  }

  return AppleHealth.requestHeartRateAuthorization();
}
