function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function getInferredBenchmarkFamilyForExercise(exercise) {
  const name = normalizeText(exercise?.name || exercise?.exercise_name);
  const equipment = normalizeText(getExerciseEquipmentLabel(exercise));

  if (
    equipment.includes("barbell") &&
    (name === "bench press" || name === "incline bench press")
  ) {
    return "Chest barbell press";
  }

  if (
    (equipment.includes("barbell") || equipment.includes("trap bar")) &&
    /(^| )deadlifts?$|sumo deadlifts?|deficit deadlifts?/.test(name)
  ) {
    return "Lower/posterior-chain deadlift";
  }

  if (/pull[- ]?ups?|chin[- ]?ups?/.test(name)) {
    return "Back pull-up/chin-up";
  }

  return "";
}

export function getBenchmarkFamilyForExercise(exercise) {
  const explicitBenchmarkValue = getExplicitBenchmarkValue(exercise);

  if (explicitBenchmarkValue === false) {
    return "";
  }

  return getInferredBenchmarkFamilyForExercise(exercise);
}

export function isExerciseBenchmark(exercise) {
  const explicitBenchmarkValue = getExplicitBenchmarkValue(exercise);

  if (explicitBenchmarkValue != null) {
    return explicitBenchmarkValue;
  }

  return Boolean(getInferredBenchmarkFamilyForExercise(exercise));
}
