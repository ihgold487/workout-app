import { Capacitor, registerPlugin } from "@capacitor/core";

const PickerHaptics = registerPlugin("PickerHaptics");

export function canUseNativePickerHaptics() {
  return Capacitor.isNativePlatform();
}

export async function triggerNativePickerSelectionHaptic() {
  if (!canUseNativePickerHaptics()) {
    return false;
  }

  try {
    await PickerHaptics.selectionChanged();
    return true;
  } catch (error) {
    console.warn("Native picker haptic failed:", error);
    return false;
  }
}

export async function triggerNativeWarningHaptic() {
  if (!canUseNativePickerHaptics()) {
    return false;
  }

  try {
    await PickerHaptics.warning();
    return true;
  } catch (error) {
    console.warn("Native warning haptic failed:", error);
    return false;
  }
}

export async function triggerNativeSetCompletionHaptic() {
  if (!canUseNativePickerHaptics()) {
    return false;
  }

  try {
    await PickerHaptics.setCompleted();
    return true;
  } catch (error) {
    console.warn("Native set-completion haptic failed:", error);
    return false;
  }
}

export async function triggerNativeWorkoutCompletionHaptic() {
  if (!canUseNativePickerHaptics()) {
    return false;
  }

  try {
    await PickerHaptics.workoutCompleted();
    return true;
  } catch (error) {
    console.warn("Native workout-completion haptic failed:", error);
    return false;
  }
}
