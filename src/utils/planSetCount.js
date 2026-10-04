export function getPlanWorkingSetCount(exercise = {}) {
  return (exercise.sets || []).filter(
    (set) => !set?.isDropSet && !set?.is_drop_set
  ).length;
}
