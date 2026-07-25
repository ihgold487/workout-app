function parseNumber(value) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number.parseFloat(String(value).replace(/^\+/, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function firstPresentValue(...values) {
  return values.find((value) => value !== "" && value != null);
}

function getBodyweightLoadPercent(exercise) {
  const parsed = parseNumber(
    exercise?.bodyweightLoadPercent ?? exercise?.bodyweight_load_percent
  );

  return parsed && parsed > 0 ? Math.min(100, parsed) : 0;
}

function getBodyWeightValue(bodyWeight) {
  if (typeof bodyWeight === "number" || typeof bodyWeight === "string") {
    return parseNumber(bodyWeight);
  }

  return parseNumber(bodyWeight?.weight ?? bodyWeight?.body_weight_value);
}

function getBodyweightLoad(options = {}) {
  const bodyweightLoadPercent = getBodyweightLoadPercent(options.exercise);
  const bodyWeightValue = getBodyWeightValue(options.bodyWeight);

  return bodyweightLoadPercent > 0 && bodyWeightValue
    ? bodyWeightValue * (bodyweightLoadPercent / 100)
    : 0;
}

export function getLatestBodyWeightForDate(entries = [], dateValue = null) {
  const targetTime = dateValue ? Date.parse(dateValue) : Date.now();
  const safeTargetTime = Number.isFinite(targetTime) ? targetTime : Date.now();

  return [...entries]
    .filter((entry) => {
      const entryTime = Date.parse(entry?.date || entry?.measured_at || "");

      return Number.isFinite(entryTime) && entryTime <= safeTargetTime;
    })
    .sort((a, b) =>
      String(b.date || b.measured_at || "").localeCompare(
        String(a.date || a.measured_at || "")
      )
    )[0] || null;
}

export function calculateE1RM(
  actualWeight,
  actualReps,
  actualRir,
  targetWeight,
  targetReps,
  targetRir,
  options = {}
) {
  const weightValue = firstPresentValue(actualWeight, targetWeight);

  const w = parseNumber(weightValue);

  const r = parseNumber(firstPresentValue(actualReps, targetReps));

  const reserve = parseNumber(firstPresentValue(actualRir, targetRir, 0)) ?? 0;
  const bodyweightLoad = getBodyweightLoad(options);
  const addedWeight = w ?? (bodyweightLoad ? 0 : null);

  if (addedWeight == null || r == null) {
    return null;
  }

  const e1rmFactor = 1 + (r + reserve) / 30;

  if (bodyweightLoad) {
    return (addedWeight + bodyweightLoad) * e1rmFactor - bodyweightLoad;
  }

  return addedWeight * e1rmFactor;
}

export function estimateWeightForE1RM(e1rm, reps, rir, options = {}) {
  const targetE1RM = parseNumber(e1rm);
  const targetReps = parseNumber(reps);
  const targetRir = parseNumber(rir) ?? 0;

  if (targetE1RM == null || targetReps == null) {
    return null;
  }

  const e1rmFactor = 1 + (targetReps + targetRir) / 30;
  const bodyweightLoad = getBodyweightLoad(options);

  return bodyweightLoad
    ? (targetE1RM + bodyweightLoad) / e1rmFactor - bodyweightLoad
    : targetE1RM / e1rmFactor;
}

export function formatE1RM(value) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue.toFixed(1) : "—";
}
