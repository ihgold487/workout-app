import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";

export async function writeTextToClipboard(value) {
  const text = String(value ?? "");

  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: text });
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard writing is not available in this browser.");
  }

  await navigator.clipboard.writeText(text);
}
