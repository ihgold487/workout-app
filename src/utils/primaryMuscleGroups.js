const PRIMARY_MUSCLE_SECTIONS = [
  { key: "chest", label: "Chest", muscles: ["Chest"] },
  { key: "back", label: "Back", muscles: ["Lats", "Upper Back"] },
  {
    key: "shoulders",
    label: "Shoulders",
    muscles: ["Front Delts", "Side Delts", "Rear Delts"],
  },
  {
    key: "arms",
    label: "Arms",
    muscles: ["Biceps", "Triceps", "Forearms"],
  },
  {
    alwaysShowSubtotal: true,
    key: "legs",
    label: "Legs",
    muscles: ["Quads", "Hamstrings", "Glutes"],
  },
  { key: "calves", label: "Calves", muscles: ["Calves"] },
  { key: "core", label: "Core", muscles: ["Abs", "Obliques"] },
  { key: "full-body", label: "Full Body", muscles: ["Full Body"] },
];

export function buildPrimaryMuscleSections(muscleSets = {}) {
  const assignedMuscles = new Set();
  const sections = PRIMARY_MUSCLE_SECTIONS.map((section) => {
    const items = section.muscles
      .filter((muscle) => Object.prototype.hasOwnProperty.call(muscleSets, muscle))
      .map((muscle) => {
        assignedMuscles.add(muscle);
        return {
          muscle,
          sets: Number(muscleSets[muscle]) || 0,
        };
      });

    return {
      ...section,
      items,
      showSubtotal: section.alwaysShowSubtotal || items.length > 1,
      total: items.reduce((sum, item) => sum + item.sets, 0),
    };
  }).filter((section) => section.items.length > 0);
  const otherItems = Object.entries(muscleSets)
    .filter(([muscle]) => !assignedMuscles.has(muscle))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([muscle, sets]) => ({
      muscle,
      sets: Number(sets) || 0,
    }));

  if (otherItems.length > 0) {
    sections.push({
      items: otherItems,
      key: "other",
      label: "Other",
      showSubtotal: otherItems.length > 1,
      total: otherItems.reduce((sum, item) => sum + item.sets, 0),
    });
  }

  return sections;
}

export function getPrimaryMuscleSectionTotal(section, muscleSets = {}) {
  return section.items.reduce(
    (sum, item) => sum + (Number(muscleSets[item.muscle]) || 0),
    0
  );
}
