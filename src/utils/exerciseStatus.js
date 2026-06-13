export const EXERCISE_STATUS = {
  active: "active",
  inactive: "inactive",
};

export function getExerciseStatus(exercise) {
  return exercise?.active === EXERCISE_STATUS.inactive
    ? EXERCISE_STATUS.inactive
    : EXERCISE_STATUS.active;
}

export function isExerciseActive(exercise) {
  return getExerciseStatus(exercise) === EXERCISE_STATUS.active;
}

export function withDefaultExerciseStatus(exercise) {
  return {
    ...exercise,
    active: getExerciseStatus(exercise),
  };
}
