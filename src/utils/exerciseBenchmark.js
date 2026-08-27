function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export const BENCHMARK_FAMILY_OPTIONS = [
  {
    contextLabel: "Chest barbell press",
    key: "chest_barbell_press",
    label: "Chest press",
  },
  {
    contextLabel: "Lower/posterior-chain deadlift",
    key: "posterior_chain_deadlift",
    label: "Posterior chain",
  },
  {
    contextLabel: "Back pull-up/chin-up",
    key: "vertical_pull",
    label: "Vertical pull",
  },
];

function getBenchmarkFamilyOption(key) {
  return BENCHMARK_FAMILY_OPTIONS.find((option) => option.key === key) || null;
}

function getExerciseEquipmentLabel(exercise) {
  const equipment = exercise?.equipment;

  return Array.isArray(equipment)
    ? equipment.filter(Boolean).join(", ")
    : String(equipment || "");
}

function getExplicitBenchmarkValue(exercise) {
  if (Object.prototype.hasOwnProperty.call(exercise || {}, "benchmark")) {
    return exercise.benchmark == null ? null : Boolean(exercise.benchmark);
  }

  if (Object.prototype.hasOwnProperty.call(exercise || {}, "is_benchmark")) {
    return exercise.is_benchmark == null ? null : Boolean(exercise.is_benchmark);
  }

  return null;
}

function getExplicitBenchmarkFamilyKey(exercise) {
  const value =
    exercise?.benchmarkFamilyKey ?? exercise?.benchmark_family_key ?? null;

  return value == null || String(value).trim() === ""
    ? null
    : String(value).trim();
}

function getInferredBenchmarkFamilyKeyForExercise(exercise) {
  const name = normalizeText(exercise?.name || exercise?.exercise_name);
  const equipment = normalizeText(getExerciseEquipmentLabel(exercise));

  if (
    equipment.includes("barbell") &&
    (name === "bench press" || name === "incline bench press")
  ) {
    return "chest_barbell_press";
  }

  if (
    (equipment.includes("barbell") || equipment.includes("trap bar")) &&
    /^(deadlifts?|sumo deadlifts?|deficit deadlifts?)$/.test(name)
  ) {
    return "posterior_chain_deadlift";
  }

  if (/pull[- ]?ups?|chin[- ]?ups?/.test(name)) {
    return "vertical_pull";
  }

  return "";
}

export function getBenchmarkFamilyForExercise(exercise) {
  const familyKey = getBenchmarkFamilyKeyForExercise(exercise);

  if (!familyKey) {
    return "";
  }

  return getBenchmarkFamilyOption(familyKey)?.contextLabel || familyKey;
}

export function getBenchmarkFamilyKeyForExercise(exercise) {
  const explicitBenchmarkValue = getExplicitBenchmarkValue(exercise);

  if (explicitBenchmarkValue === false) {
    return "";
  }

  return (
    getExplicitBenchmarkFamilyKey(exercise) ||
    getInferredBenchmarkFamilyKeyForExercise(exercise)
  );
}

export function isExerciseBenchmark(exercise) {
  const explicitBenchmarkValue = getExplicitBenchmarkValue(exercise);

  if (explicitBenchmarkValue != null) {
    return explicitBenchmarkValue;
  }

  return Boolean(getBenchmarkFamilyKeyForExercise(exercise));
}
