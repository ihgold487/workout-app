export const DEFAULT_WEIGHT_INCREMENT = 2.5;

export const EQUIPMENT_WEIGHT_INCREMENTS = {
  barbell: 2.5,
  bench: null,
  bodyweight: 2.5,
  cable: 2.5,
  dumbbell: 2.5,
  dumbbells: 2.5,
  "ez bar": 2.5,
  "ez curl bar": 2.5,
  landmine: 1.25,
  machine: 1.25,
  pullup: 1.25,
  "pullup bar": 1.25,
  "resistance band": null,
  "resistance bands": null,
  smith: 2.5,
  "smith machine": 2.5,
  "trap bar": 2.5,
  "tricep bar": 2.5,
};

const CABLE_FINE_INCREMENT_MAX_WEIGHT = 25;
const CABLE_FINE_INCREMENT = 1.25;
const CABLE_STANDARD_INCREMENT = 2.5;

function normalizeEquipmentName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getPrimaryEquipment(exercise) {
  const equipment = exercise?.equipment;

  if (Array.isArray(equipment)) {
    return equipment.find(Boolean) || "";
  }

  return equipment || "";
}

export function getExerciseWeightIncrement(
  exercise,
  fallback = DEFAULT_WEIGHT_INCREMENT,
  workingWeight = null
) {
  const override =
    exercise?.weightIncrement ??
    exercise?.weight_increment ??
    exercise?.metadata?.weightIncrement ??
    exercise?.metadata?.weight_increment;

  if (override !== "" && override != null) {
    const parsed = Number.parseFloat(String(override));

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const equipmentKey = normalizeEquipmentName(getPrimaryEquipment(exercise));

  if (equipmentKey === "cable") {
    const parsedWorkingWeight = Number.parseFloat(String(workingWeight));

    return Number.isFinite(parsedWorkingWeight) &&
      parsedWorkingWeight <= CABLE_FINE_INCREMENT_MAX_WEIGHT
      ? CABLE_FINE_INCREMENT
      : CABLE_STANDARD_INCREMENT;
  }

  if (Object.prototype.hasOwnProperty.call(EQUIPMENT_WEIGHT_INCREMENTS, equipmentKey)) {
    return EQUIPMENT_WEIGHT_INCREMENTS[equipmentKey];
  }

  return fallback;
}

export function roundWeightToIncrement(value, increment) {
  const numericValue = Number.parseFloat(String(value));
  const numericIncrement = Number.parseFloat(String(increment));

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (!Number.isFinite(numericIncrement) || numericIncrement <= 0) {
    return Number(numericValue.toFixed(4));
  }

  return Number(
    (Math.round(numericValue / numericIncrement) * numericIncrement).toFixed(4)
  );
}
