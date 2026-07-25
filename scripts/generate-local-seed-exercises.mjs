import fs from "node:fs";
import path from "node:path";
import { seedExercises as existingSeedExercises } from "../src/data/seedExercises.js";

const [
  inputPath = "supabase/exercise_library_review_template.csv",
  outputPath = "src/data/seedExercises.js",
  imageManifestPath = "supabase/exercise_image_manifest.json",
] = process.argv.slice(2);

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuote && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }

    if (char === "," && !inQuote) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function exerciseKey(name, equipment) {
  return `${name.trim().toLowerCase()}||${equipment.trim().toLowerCase()}`;
}

function splitMuscles(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((muscle) => muscle.trim())
    .filter(Boolean);
}

function parseOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function jsString(value) {
  return JSON.stringify(value);
}

const rawCsv = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const lines = rawCsv.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0]);
const rows = lines.slice(1).map((line, index) => {
  const cells = parseCsvLine(line);

  if (cells.length !== header.length) {
    throw new Error(
      `Line ${index + 2} has ${cells.length} columns; expected ${header.length}.`
    );
  }

  return Object.fromEntries(
    header.map((key, cellIndex) => [key, cells[cellIndex]])
  );
});

const includedRows = rows.filter(
  (row) => row.include_in_seed?.toLowerCase() === "yes"
);
const imageManifest = fs.existsSync(imageManifestPath)
  ? JSON.parse(fs.readFileSync(imageManifestPath, "utf8"))
  : [];
const imageManifestBySourceKey = new Map(
  imageManifest.map((item) => [item.sourceKey, item])
);

const existingIdsByKey = new Map(
  existingSeedExercises.map((exercise) => [
    exerciseKey(exercise.name, exercise.equipment?.[0] || ""),
    exercise.id,
  ])
);
const existingExercisesByKey = new Map(
  existingSeedExercises.map((exercise) => [
    exerciseKey(exercise.name, exercise.equipment?.[0] || ""),
    exercise,
  ])
);
const usedIds = new Set();
let nextId =
  Math.max(0, ...existingSeedExercises.map((exercise) => Number(exercise.id))) +
  1;

const seenRows = new Set();
const exercises = includedRows.map((row) => {
  for (const field of ["name", "equipment", "primary_muscle"]) {
    if (!row[field]) {
      throw new Error(`Missing ${field} for ${row.name || "unknown row"}.`);
    }
  }

  const key = exerciseKey(row.name, row.equipment);

  if (seenRows.has(key)) {
    throw new Error(`Duplicate name/equipment pair: ${row.name} / ${row.equipment}`);
  }

  seenRows.add(key);

  let id = existingIdsByKey.get(key);

  if (id == null || usedIds.has(id)) {
    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    id = nextId;
    nextId += 1;
  }

  usedIds.add(id);
  const image = imageManifestBySourceKey.get(row.source_key);
  const existingExercise = existingExercisesByKey.get(key) || {};

  return {
    bodyweightLoadPercent: parseOptionalNumber(row.bodyweight_load_percent),
    description: existingExercise.description || "",
    id,
    imageAlt: image?.imageAlt || "",
    imageUrl: image?.imageUrl || "",
    instructionSource: existingExercise.instructionSource || "",
    instructionSourceUrl: existingExercise.instructionSourceUrl || "",
    instructionSteps: Array.isArray(existingExercise.instructionSteps)
      ? existingExercise.instructionSteps
      : [],
    name: row.name,
    equipment: [row.equipment],
    muscles: [row.primary_muscle, ...splitMuscles(row.secondary_muscles)],
    builtin: true,
  };
});

const output = `// Generated from ${inputPath}. Review that CSV, then run:
// node scripts/generate-local-seed-exercises.mjs

export const seedExercises = [
${exercises
  .map(
    (exercise) => `  {
    id: ${exercise.id},
    name: ${jsString(exercise.name)},
    equipment: [${exercise.equipment.map(jsString).join(", ")}],
    muscles: [${exercise.muscles.map(jsString).join(", ")}],
    ${
      exercise.bodyweightLoadPercent == null
        ? ""
        : `bodyweightLoadPercent: ${exercise.bodyweightLoadPercent},\n    `
    }imageUrl: ${jsString(exercise.imageUrl)},
    imageAlt: ${jsString(exercise.imageAlt)},
    ${
      exercise.description
        ? `description: ${jsString(exercise.description)},\n    `
        : ""
    }${
      exercise.instructionSteps.length > 0
        ? `instructionSteps: [\n${exercise.instructionSteps
            .map((step) => `      ${jsString(step)},`)
            .join("\n")}\n    ],\n    `
        : ""
    }${
      exercise.instructionSource
        ? `instructionSource: ${jsString(exercise.instructionSource)},\n    `
        : ""
    }${
      exercise.instructionSourceUrl
        ? `instructionSourceUrl: ${jsString(exercise.instructionSourceUrl)},\n    `
        : ""
    }builtin: true,
  }`
  )
  .join(",\n")}
];
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);

console.log(`Wrote ${exercises.length} seed exercises to ${outputPath}`);
