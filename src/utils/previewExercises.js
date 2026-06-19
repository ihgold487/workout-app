export function getGroupedPreviewExercises(exercises) {
  return Object.values(
    exercises.reduce((groups, exercise) => {
      const key = exercise.supersetGroup || `single-${exercise.id}`;

      if (!groups[key]) {
        groups[key] = {
          exercises: [],
          group: exercise.supersetGroup,
        };
      }

      groups[key].exercises.push(exercise);
      return groups;
    }, {})
  );
}
