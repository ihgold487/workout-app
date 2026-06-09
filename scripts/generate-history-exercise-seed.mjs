import fs from "node:fs";
import path from "node:path";
import { seedExercises } from "../src/data/seedExercises.js";

const [inputPath, outputPath = "supabase/seed_exercises_from_history.sql"] =
  process.argv.slice(2);

if (!inputPath) {
  console.error(
    "Usage: node scripts/generate-history-exercise-seed.mjs <history.csv> [output.sql]"
  );
  process.exit(1);
}

const EQUIPMENT_ALIASES = new Map([
  ["EZ bar", "EZ Curl Bar"],
  ["Resistance bands", "Resistance Band"],
  ["Smith machine", "Smith Machine"],
  ["Trap bar", "Trap Bar"],
]);

function stripQuotes(value) {
  return value.replace(/^"|"$/g, "");
}

function normalizeEquipment(equipment) {
  return EQUIPMENT_ALIASES.get(equipment) || equipment;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sqlString(value) {
  return value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  if (!values?.length) {
    return "'{}'";
  }

  return `array[${values.map(sqlString).join(", ")}]`;
}

function parseExerciseLine(line) {
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

function seedLookupKey(exercise) {
  return `${exercise.name}||${exercise.equipment?.[0] || ""}`;
}

const seedByExactKey = new Map(seedExercises.map((exercise) => [
  seedLookupKey(exercise),
  exercise,
]));

const seedByName = new Map();

for (const exercise of seedExercises) {
  if (!seedByName.has(exercise.name)) {
    seedByName.set(exercise.name, exercise);
  }
}

const rawCsv = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const exerciseStats = new Map();

for (const line of rawCsv.split(/\r?\n/)) {
  const exercise = parseExerciseLine(line);

  if (!exercise) {
    continue;
  }

  const key = `${exercise.name}||${exercise.equipment}`;
  const current = exerciseStats.get(key) || {
    count: 0,
    equipment: exercise.equipment,
    name: exercise.name,
  };

  current.count += 1;
  exerciseStats.set(key, current);
}

const rows = [...exerciseStats.values()]
  .map((exercise) => {
    const exactSeed = seedByExactKey.get(`${exercise.name}||${exercise.equipment}`);
    const nameSeed = seedByName.get(exercise.name);
    const seed = exactSeed || nameSeed;
    const muscles = seed?.muscles || [];

    return {
      ...exercise,
      primaryMuscle: muscles[0] || null,
      secondaryMuscles: muscles.slice(1),
      sourceKey: `history-csv-2026-06-07:${slug(
        `${exercise.name}-${exercise.equipment}`
      )}`,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.equipment.localeCompare(b.equipment));

const valuesSql = rows
  .map((exercise) => {
    const description = `Baseline exercise from 2026-06-07 workout history export. Appears in ${exercise.count} logged workout exercise entries.`;

    return `  (null, ${sqlString(exercise.name)}, ${sqlString(
      description
    )}, null, null, ${sqlString(exercise.name)}, ${sqlString(
      exercise.equipment
    )}, ${sqlString(exercise.primaryMuscle)}, ${sqlArray(
      exercise.secondaryMuscles
    )}, true, 'history_csv_2026_06_07', ${sqlString(exercise.sourceKey)})`;
  })
  .join(",\n");

const output = `-- Baseline exercise seed generated from 2026_06_07 Workouts.csv.
-- Re-run safely after schema.sql. Source keys keep repeated runs idempotent.

insert into public.exercises (
  user_id,
  name,
  description,
  image_url,
  image_storage_path,
  image_alt,
  equipment,
  primary_muscle,
  secondary_muscles,
  is_builtin,
  source,
  source_key
)
values
${valuesSql}
on conflict (source, source_key) where user_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  image_alt = excluded.image_alt,
  equipment = excluded.equipment,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  is_builtin = true,
  updated_at = now(),
  deleted_at = null;
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);

console.log(`Wrote ${rows.length} baseline exercises to ${outputPath}`);
