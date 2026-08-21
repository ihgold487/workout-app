import { Capacitor } from "@capacitor/core";

// TEMPORARY native pull-only safeguard. Remove this policy when native writes
// to the persisted database are ready to be enabled.
export function isRemoteWriteAllowed() {
  return !Capacitor.isNativePlatform();
}

export function skipBlockedRemoteWrite(operation, result) {
  if (isRemoteWriteAllowed()) {
    return false;
  }

  console.info(`Native pull-only mode: skipped remote ${operation}`);
  return result;
}

export function assertRemoteWriteAllowed(operation) {
  if (isRemoteWriteAllowed()) return;

  console.info(`Native pull-only mode: skipped remote ${operation}`);
  throw new Error("Native pull-only mode: remote changes are temporarily disabled.");
}
