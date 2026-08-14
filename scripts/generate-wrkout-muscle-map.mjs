import fs from "node:fs";
import path from "node:path";
import { seedExercises } from "../src/data/seedExercises.js";

const [wrkoutExercisesDir, historyCsvPath, outputPath] = process.argv.slice(2);

if (!wrkoutExercisesDir || !historyCsvPath || !outputPath) {
  console.error(
    "Usage: node scripts/generate-wrkout-muscle-map.mjs <wrkout exercises dir> <history.csv> <output.json>"
  );
  process.exit(1);
}

const EQUIPMENT_ALIASES = new Map([
  ["EZ bar", "EZ Curl Bar"],
  ["Resistance bands", "Resistance Band"],
  ["Smith machine", "Smith Machine"],
  ["Trap bar", "Trap Bar"],
]);

const WRKOUT_EQUIPMENT = new Map([
  ["barbell", "Barbell"],
  ["body only", "Bodyweight"],
  ["cable", "Cable"],
  ["dumbbell", "Dumbbells"],
  ["e-z curl bar", "EZ Curl Bar"],
  ["machine", "Machine"],
]);

const WRKOUT_MUSCLES = new Map([
  ["abdominals", "Abs"],
  ["abductors", "Glutes"],
  ["adductors", "Quads"],
  ["biceps", "Biceps"],
  ["calves", "Calves"],
  ["chest", "Chest"],
  ["forearms", "Forearms"],
  ["glutes", "Glutes"],
  ["hamstrings", "Hamstrings"],
  ["lats", "Lats"],
  ["lower back", "Upper Back"],
  ["middle back", "Upper Back"],
  ["quadriceps", "Quads"],
  ["shoulders", "Front Delts"],
  ["traps", "Upper Traps"],
  ["triceps", "Triceps"],
]);

function normalizeEquipment(value) {
  return EQUIPMENT_ALIASES.get(value) || value || "";
}

function stripQuotes(value) {
  return value.replace(/^"|"$/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/°/g, " deg ")
    .replace(/flys/g, "fly")
    .replace(/flyes/g, "fly")
    .replace(/pushups/g, "pushup")
    .replace(/sit ups/g, "sit up")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(barbell|dumbbell|dumbbells|cable|machine|bodyweight)\b/g, " ")
    .replace(/\b(with|and|the|on|one|arm)\b/g, " ")
    .replace(/\b(curls)\b/g, "curl")
    .replace(/\b(rows)\b/g, "row")
    .replace(/\b(raises)\b/g, "raise")
    .replace(/\b(presses)\b/g, "press")
    .replace(/\b(squats)\b/g, "squat")
    .replace(/\b(deadlifts)\b/g, "deadlift")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalizeName(value).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const left = tokens(a);
  const right = tokens(b);

  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;

  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (left.size + right.size - intersection);
}

function parseHistoryExercise(line) {
  const cells = line
    .trim()
    .split(";")
    .map((cell) => stripQuotes(cell));

  if (cells.length !== 1 || !/^\d+\. /.test(cells[0])) {
    return null;
  }

  const parts = cells[0].replace(/^\d+\. /, "").split(" · ");
  const name = parts[0];
  const equipment = normalizeEquipment(parts[1] || "");

  return name && equipment ? { equipment, name } : null;
}

function mapMuscles(muscles) {
  return muscles.map((muscle) => WRKOUT_MUSCLES.get(muscle)).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function seedKey(exercise) {
  return `${exercise.name}||${exercise.equipment?.[0] || ""}`;
}

function confidenceFor(seed, match) {
  if (seed) {
    return "seed-exact";
  }

  if (!match) {
    return "none";
  }

  if (match.score >= 0.95) {
    return "high";
  }

  if (match.score >= 0.72) {
    return "medium";
  }

  return "low";
}

function findBestMatch(exercise, wrkoutExercises) {
  let best = null;

  for (const candidate of wrkoutExercises) {
    let score = jaccard(exercise.name, candidate.name);
    const leftName = normalizeName(exercise.name);
    const rightName = normalizeName(candidate.name);

    if (exercise.equipment && candidate.equipment === exercise.equipment) {
      score += 0.2;
    }

    if (leftName === rightName) {
      score += 0.5;
    }

    if (leftName && rightName && (leftName.includes(rightName) || rightName.includes(leftName))) {
      score += 0.12;
    }

    if (!best || score > best.score) {
      best = {
        ...candidate,
        score,
      };
    }
  }

  return best;
}

const seedByKey = new Map(seedExercises.map((exercise) => [seedKey(exercise), exercise]));
const historyExercises = new Map();

for (const line of fs.readFileSync(historyCsvPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const exercise = parseHistoryExercise(line);

  if (!exercise) {
    continue;
  }

  const key = `${exercise.name}||${exercise.equipment}`;
  const current = historyExercises.get(key) || {
    ...exercise,
    count: 0,
  };

  current.count += 1;
  historyExercises.set(key, current);
}

const wrkoutExercises = [];

for (const dir of fs.readdirSync(wrkoutExercisesDir)) {
  const filePath = path.join(wrkoutExercisesDir, dir, "exercise.json");

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const exercise = JSON.parse(fs.readFileSync(filePath, "utf8"));

  wrkoutExercises.push({
    equipment: WRKOUT_EQUIPMENT.get(exercise.equipment) || exercise.equipment || "",
    instructions: exercise.instructions || [],
    name: exercise.name,
    primaryMuscles: exercise.primaryMuscles || [],
    secondaryMuscles: exercise.secondaryMuscles || [],
  });
}

const rows = [...historyExercises.values()]
  .map((exercise) => {
    const seed = seedByKey.get(`${exercise.name}||${exercise.equipment}`);
    const match = findBestMatch(exercise, wrkoutExercises);
    const confidence = confidenceFor(seed, match);
    const wrkoutPrimary = mapMuscles(match?.primaryMuscles || []);
    const wrkoutSecondary = mapMuscles(match?.secondaryMuscles || []);

    return {
      confidence,
      count: exercise.count,
      equipment: exercise.equipment,
      mappedPrimaryMuscle: seed?.muscles?.[0] || wrkoutPrimary[0] || null,
      mappedSecondaryMuscles: seed
        ? seed.muscles.slice(1)
        : unique([...wrkoutPrimary.slice(1), ...wrkoutSecondary]),
      name: exercise.name,
      seedMuscles: seed?.muscles || null,
      wrkout: match
        ? {
            equipment: match.equipment,
            name: match.name,
            primaryMuscles: match.primaryMuscles,
            score: Number(match.score.toFixed(3)),
            secondaryMuscles: match.secondaryMuscles,
          }
        : null,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.equipment.localeCompare(b.equipment));

const summary = rows.reduce(
  (counts, row) => ({
    ...counts,
    [row.confidence]: (counts[row.confidence] || 0) + 1,
  }),
  {
    total: rows.length,
  }
);

fs.mkdirSync(path.dirname(outputPath), {
  recursive: true,
});
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      source: "https://github.com/wrkout/exercises.json",
      summary,
      rows,
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${rows.length} mapped exercises to ${outputPath}`);
console.log(JSON.stringify(summary, null, 2));
