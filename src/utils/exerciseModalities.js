export const EXERCISE_MODALITIES = [
  {
    key: "strength",
    label: "Strength",
  },
  {
    key: "cardio",
    label: "Cardio",
  },
  {
    key: "conditioning",
    label: "Conditioning",
  },
];

const MODALITY_KEYS = new Set(EXERCISE_MODALITIES.map(({ key }) => key));
const DEFAULT_MODALITIES = ["strength"];

function readExerciseModalities(exercise) {
  if (Array.isArray(exercise?.trainingModalities)) {
    return exercise.trainingModalities;
  }

  if (Array.isArray(exercise?.training_modalities)) {
    return exercise.training_modalities;
  }

  return [];
}

export function getExerciseModalities(exercise) {
  const normalized = [...new Set(
    readExerciseModalities(exercise).filter((modality) =>
      MODALITY_KEYS.has(modality)
    )
  )];

  return normalized.length > 0 ? normalized : [...DEFAULT_MODALITIES];
}

export function hasExerciseModality(exercise, modality) {
  return getExerciseModalities(exercise).includes(modality);
}

export function isStrengthExercise(exercise) {
  return hasExerciseModality(exercise, "strength");
}

export function withExerciseModalities(exercise) {
  return {
    ...exercise,
    trainingModalities: getExerciseModalities(exercise),
  };
}
