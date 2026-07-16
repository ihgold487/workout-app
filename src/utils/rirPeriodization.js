export const RIR_PERIODIZATION_MODES = {
  CONSTANT: "constant",
  LINEAR: "linear",
  STEP: "step",
};

export const RIR_PERIODIZATION_ORDER = [
  RIR_PERIODIZATION_MODES.CONSTANT,
  RIR_PERIODIZATION_MODES.LINEAR,
  RIR_PERIODIZATION_MODES.STEP,
];

export function getDefaultRirPeriodizationMode(planType) {
  return planType === "type-3"
    ? RIR_PERIODIZATION_MODES.STEP
    : RIR_PERIODIZATION_MODES.CONSTANT;
}

function clampRir(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return Math.max(0, numericValue);
}

function formatRirValue(value) {
  if (value === "") {
    return "";
  }

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function getStepDecrease(weekNumber, durationWeeks) {
  if (durationWeeks < 4) {
    return weekNumber - 1;
  }

  if (durationWeeks === 4) {
    return [0, 1, 1, 2][weekNumber - 1] ?? 2;
  }

  if (durationWeeks === 5) {
    return [0, 1, 1, 2, 2][weekNumber - 1] ?? 2;
  }

  return [0, 1, 1, 2, 2, 3][weekNumber - 1] ?? 3;
}

export function getRirForPlanWeek({
  durationWeeks,
  initialRir,
  mode = RIR_PERIODIZATION_MODES.CONSTANT,
  weekNumber,
}) {
  const startingRir = clampRir(initialRir);

  if (startingRir === "") {
    return "";
  }

  const resolvedDurationWeeks = Math.max(1, Number(durationWeeks) || 1);
  const resolvedWeekNumber = Math.min(
    resolvedDurationWeeks,
    Math.max(1, Number(weekNumber) || 1)
  );
  const decrease =
    mode === RIR_PERIODIZATION_MODES.LINEAR
      ? resolvedWeekNumber - 1
      : mode === RIR_PERIODIZATION_MODES.STEP
        ? getStepDecrease(resolvedWeekNumber, resolvedDurationWeeks)
        : 0;

  return formatRirValue(clampRir(startingRir - decrease));
}
