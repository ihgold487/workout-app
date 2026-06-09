import fs from "node:fs";
import path from "node:path";

const [
  inputPath = "supabase/seed_exercises_from_history.sql",
  outputPath = "supabase/exercise_library_review_template.csv",
] = process.argv.slice(2);

function unquoteSql(value) {
  const trimmed = value.trim();

  if (trimmed.toLowerCase() === "null") {
    return "";
  }

  return trimmed.replace(/^'|'$/g, "").replaceAll("''", "'");
}

function splitSqlTuple(value) {
  const cells = [];
  let current = "";
  let inQuote = false;
  let bracketDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "'" && inQuote && next === "'") {
      current += "''";
      index += 1;
      continue;
    }

    if (char === "'") {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (!inQuote && char === "[") {
      bracketDepth += 1;
    }

    if (!inQuote && char === "]") {
      bracketDepth -= 1;
    }

    if (!inQuote && bracketDepth === 0 && char === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    cells.push(current.trim());
  }

  return cells;
}

function parseSqlArray(value) {
  const trimmed = value.trim();

  if (trimmed === "'{}'" || trimmed === "{}") {
    return [];
  }

  const match = trimmed.match(/^array\[(.*)\]$/);

  if (!match) {
    return [];
  }

  return splitSqlTuple(match[1]).map(unquoteSql).filter(Boolean);
}

function csvValue(value) {
  const stringValue = String(value ?? "");

  if (!/[",\n;]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeName(value) {
  return value.toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function withoutPrimary(primary, secondary) {
  return unique(secondary).filter((muscle) => muscle !== primary);
}

function inferMuscles(name, seededPrimary, seededSecondary) {
  const normalized = normalizeName(name);

  if (seededPrimary) {
    return {
      primary: seededPrimary,
      secondary: seededSecondary,
    };
  }

  if (/curl/.test(normalized)) {
    return {
      primary: "Biceps",
      secondary: unique([
        /reverse/.test(normalized) ? "Forearms" : "",
        /hammer/.test(normalized) ? "Brachialis" : "",
      ]),
    };
  }

  if (/triceps|skull crusher|pushdown|kickback/.test(normalized)) {
    return {
      primary: "Triceps",
      secondary: [],
    };
  }

  if (/close grip/.test(normalized) && /bench|push-up/.test(normalized)) {
    return {
      primary: "Triceps",
      secondary: ["Chest", "Front Delts"],
    };
  }

  if (/bench|fly|hex press|push-up|dips/.test(normalized)) {
    return {
      primary: /incline|upper/.test(normalized) ? "Upper Chest" : "Chest",
      secondary: ["Triceps", "Front Delts"],
    };
  }

  if (/shoulder press|arnold press/.test(normalized)) {
    return {
      primary: "Shoulders",
      secondary: ["Triceps", "Front Delts"],
    };
  }

  if (/lateral raise|y raise|upright row/.test(normalized)) {
    return {
      primary: "Shoulders",
      secondary: [/bent-over|reverse/.test(normalized) ? "Rear Delts" : "Traps"],
    };
  }

  if (/face pull|reverse fly/.test(normalized)) {
    return {
      primary: "Rear Delts",
      secondary: ["Upper Back", "Traps"],
    };
  }

  if (/shrug/.test(normalized)) {
    return {
      primary: "Traps",
      secondary: ["Upper Back"],
    };
  }

  if (/row|shrug|pull-up|chin-up/.test(normalized)) {
    const primary = /pull-up|chin-up/.test(normalized) ? "Lats" : "Upper Back";

    return {
      primary,
      secondary: withoutPrimary(primary, [
        "Lats",
        "Biceps",
        /shrug/.test(normalized) ? "Traps" : "Rear Delts",
      ]),
    };
  }

  if (/pullover/.test(normalized)) {
    return {
      primary: "Lats",
      secondary: ["Chest", "Triceps"],
    };
  }

  if (/deadlift|good morning|hyperextension/.test(normalized)) {
    return {
      primary: "Hamstrings",
      secondary: ["Glutes", "Lower Back"],
    };
  }

  if (/hip thrust/.test(normalized)) {
    return {
      primary: "Glutes",
      secondary: ["Hamstrings"],
    };
  }

  if (/squat|lunge|step-up/.test(normalized)) {
    const primary = /split|lunge|step-up/.test(normalized) ? "Glutes" : "Quads";

    return {
      primary,
      secondary: withoutPrimary(primary, ["Glutes", "Quads", "Hamstrings"]),
    };
  }

  if (/leg curl/.test(normalized)) {
    return {
      primary: "Hamstrings",
      secondary: [],
    };
  }

  if (/calf/.test(normalized)) {
    return {
      primary: "Calves",
      secondary: [],
    };
  }

  if (/crunch|sit-up|leg raise|russian twist|side bend/.test(normalized)) {
    return {
      primary: "Abs",
      secondary: /side|twist/.test(normalized) ? ["Obliques"] : [],
    };
  }

  if (/cycling/.test(normalized)) {
    return {
      primary: "Cardio",
      secondary: ["Quads"],
    };
  }

  return {
    primary: "",
    secondary: [],
  };
}

const rawSql = fs.readFileSync(inputPath, "utf8");
const valuesSection = rawSql
  .split(/\bvalues\b/i)[1]
  ?.split(/\bon conflict\b/i)[0];

if (!valuesSection) {
  throw new Error(`Could not find values section in ${inputPath}`);
}

const rows = [];
let buffer = "";
let tupleDepth = 0;
let inQuote = false;

for (const char of valuesSection) {
  if (char === "'") {
    inQuote = !inQuote;
  }

  if (!inQuote && char === "(") {
    tupleDepth += 1;
  }

  if (tupleDepth > 0) {
    buffer += char;
  }

  if (!inQuote && char === ")") {
    tupleDepth -= 1;

    if (tupleDepth === 0) {
      rows.push(buffer.slice(1, -1));
      buffer = "";
    }
  }
}

const records = rows.map((row) => {
  const cells = splitSqlTuple(row);
  const name = unquoteSql(cells[1]);
  const description = unquoteSql(cells[2]);
  const equipment = unquoteSql(cells[6]);
  const seededPrimary = unquoteSql(cells[7]);
  const seededSecondary = parseSqlArray(cells[8]);
  const sourceKey = unquoteSql(cells[11]);
  const count = description.match(/Appears in (\d+) logged/)?.[1] || "";
  const inferred = inferMuscles(name, seededPrimary, seededSecondary);

  return {
    equipment,
    history_count: count,
    include_in_seed: "yes",
    name,
    notes: seededPrimary ? "existing seed match" : "inferred; review",
    primary_muscle: inferred.primary,
    secondary_muscles: inferred.secondary.join("; "),
    source_key: sourceKey || `history-csv-2026-06-07:${slug(`${name}-${equipment}`)}`,
  };
});

const header = [
  "name",
  "equipment",
  "primary_muscle",
  "secondary_muscles",
  "include_in_seed",
  "history_count",
  "notes",
  "source_key",
];

const output = [
  header.join(","),
  ...records
    .sort((a, b) => a.name.localeCompare(b.name) || a.equipment.localeCompare(b.equipment))
    .map((record) => header.map((column) => csvValue(record[column])).join(",")),
].join("\n");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${output}\n`);

console.log(`Wrote ${records.length} exercises to ${outputPath}`);
