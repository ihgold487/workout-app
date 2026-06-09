import { calculateE1RM } from "../utils/e1rm";

const PLAN_TYPE_2_WORKOUTS = [
  {
    name: "Workout 1",
    groups: [
      { label: "A", muscles: ["Quads", "Upper Back"], sets: 3 },
      { label: "B", muscles: ["Glutes", "Chest"], sets: 3 },
      { label: "C", muscles: ["Lats", "Upper Chest"], sets: 2 },
      { label: "D", muscles: ["Biceps", "Triceps"], sets: 2 },
      { label: "Abs", muscles: ["Abs"], sets: 2, supersetGroup: null },
    ],
  },
  {
    name: "Workout 2",
    groups: [
      { label: "A", muscles: ["Hamstrings", "Chest"], sets: 3 },
      { label: "B", muscles: ["Glutes", "Lats"], sets: 3 },
      { label: "C", muscles: ["Upper Back", "Upper Chest"], sets: 2 },
      { label: "D", muscles: ["Biceps", "Triceps"], sets: 2 },
      { label: "Abs", muscles: ["Abs"], sets: 2, supersetGroup: null },
    ],
  },
];

function normalizeMuscle(value) {
  return String(value || "").trim().toLowerCase();
}

function exerciseHasMuscle(exercise, muscle) {
  const target = normalizeMuscle(muscle);

  return (exercise.muscles || []).some(
    (exerciseMuscle) => normalizeMuscle(exerciseMuscle) === target
  );
}

function getExerciseE1RM(exercise, exerciseMetadata, history) {
  const metadata = exerciseMetadata?.[exercise.id] || {};

  if (metadata.latestE1RM?.value) {
    return metadata.latestE1RM.value;
  }

  if (metadata.maxE1RM?.value) {
    return metadata.maxE1RM.value;
  }

  for (const workout of history || []) {
    const performedExercise = workout.exercises?.find(
      (item) => item.exerciseId === exercise.id
    );

    if (!performedExercise) {
      continue;
    }

    const bestSetE1RM = performedExercise.sets?.reduce((best, set) => {
      const estimated = calculateE1RM(
        set.actualWeight || set.targetWeight,
        set.actualReps || set.targetReps,
        set.actualRir ?? set.targetRir
      );

      return estimated && (!best || estimated > best) ? estimated : best;
    }, null);

    if (bestSetE1RM) {
      return bestSetE1RM;
    }
  }

  return null;
}

function estimateTargetWeight(exercise, exerciseMetadata, history, reps, rir) {
  const e1RM = getExerciseE1RM(exercise, exerciseMetadata, history);
  const targetReps = Number(reps);
  const targetRir = Number(rir || 0);

  if (!e1RM || !Number.isFinite(targetReps)) {
    return "";
  }

  const rawWeight = e1RM / (1 + (targetReps + targetRir) / 30);
  const rounded = Math.round(rawWeight / 5) * 5;

  return rounded > 0 ? String(rounded) : "";
}

function chooseExercise(exerciseLibrary, muscle, usedExerciseIds, offset) {
  const candidates = exerciseLibrary
    .filter((exercise) => exerciseHasMuscle(exercise, muscle))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!candidates.length) {
    return null;
  }

  const unusedCandidates = candidates.filter(
    (exercise) => !usedExerciseIds.has(exercise.id)
  );
  const pool = unusedCandidates.length ? unusedCandidates : candidates;

  return pool[offset % pool.length];
}

function createSets(count, exercise, options) {
  const targetWeight = estimateTargetWeight(
    exercise,
    options.exerciseMetadata,
    options.history,
    options.reps,
    options.rir
  );

  return Array.from({ length: count }, (_, index) => ({
    id: Date.now() + Math.random() + index,
    targetWeight,
    targetReps: String(options.reps),
    targetRir: String(options.rir),
  }));
}

export function generatePlanType2Workouts({
  durationWeeks,
  exerciseLibrary,
  exerciseMetadata,
  history,
  reps,
  rir,
  seed = 0,
}) {
  const usedExerciseIds = new Set();
  const gaps = [];

  const workouts = PLAN_TYPE_2_WORKOUTS.map((workout, workoutIndex) => {
    const exercises = workout.groups.flatMap((group, groupIndex) =>
      group.muscles.flatMap((muscle, muscleIndex) => {
        const exercise = chooseExercise(
          exerciseLibrary,
          muscle,
          usedExerciseIds,
          seed + workoutIndex + groupIndex + muscleIndex
        );

        if (!exercise) {
          gaps.push(`${workout.name} ${group.label}: ${muscle}`);
          return [];
        }

        usedExerciseIds.add(exercise.id);

        return [
          {
            id: Date.now() + Math.random(),
            exerciseId: exercise.id,
            equipment: exercise.equipment,
            muscles: exercise.muscles,
            name: exercise.name,
            planMuscle: muscle,
            sets: createSets(group.sets, exercise, {
              exerciseMetadata,
              history,
              reps,
              rir,
            }),
            supersetGroup:
              group.supersetGroup === null ? null : group.label,
          },
        ];
      })
    );

    return {
      id: Date.now() + Math.random(),
      durationWeeks: Number(durationWeeks) || null,
      exercises,
      lastCompleted: null,
      name: `Plan Type 2 - ${workout.name}`,
      planType: "type-2",
    };
  });

  return {
    gaps,
    workouts,
  };
}
