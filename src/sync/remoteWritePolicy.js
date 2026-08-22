export function isRemoteWriteAllowed() {
  return true;
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
