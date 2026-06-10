import fs from "node:fs";
import path from "node:path";

const [
  inputPath = "supabase/exercise_library_review_template.csv",
  outputPath = "supabase/seed_exercises_from_review.sql",
  imageManifestPath = "supabase/exercise_image_manifest.json",
] = process.argv.slice(2);

const SOURCE = "curated_exercise_library_v1";

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

function sqlString(value) {
  return value == null || value === ""
    ? "null"
    : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(value) {
  const values = String(value || "")
    .split(/[;,]/)
    .map((muscle) => muscle.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return "'{}'";
  }

  return `array[${values.map(sqlString).join(", ")}]`;
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

  return Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex]]));
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

const seenSourceKeys = new Set();
const seenNameEquipment = new Set();

for (const row of includedRows) {
  for (const field of ["name", "equipment", "primary_muscle", "source_key"]) {
    if (!row[field]) {
      throw new Error(`Missing ${field} for ${row.name || "unknown row"}.`);
    }
  }

  const sourceKey = row.source_key;
  const nameEquipmentKey = `${row.name.toLowerCase()}||${row.equipment.toLowerCase()}`;

  if (seenSourceKeys.has(sourceKey)) {
    throw new Error(`Duplicate source_key: ${sourceKey}`);
  }

  if (seenNameEquipment.has(nameEquipmentKey)) {
    throw new Error(`Duplicate name/equipment pair: ${row.name} / ${row.equipment}`);
  }

  seenSourceKeys.add(sourceKey);
  seenNameEquipment.add(nameEquipmentKey);
}

const valuesSql = includedRows
  .map((row) => {
    const image = imageManifestBySourceKey.get(row.source_key);

    return `  (null, ${sqlString(row.name)}, null, ${sqlString(
      image?.imageUrl
    )}, null, ${sqlString(image?.imageAlt || row.name)}, ${sqlString(
      row.equipment
    )}, ${sqlString(
        row.primary_muscle
      )}, ${sqlArray(row.secondary_muscles)}, true, ${sqlString(
        SOURCE
      )}, ${sqlString(row.source_key)})`;
  })
  .join(",\n");

const output = `-- Curated baseline exercise library generated from ${path.basename(inputPath)}.
-- Review ${inputPath} first, then run this after schema.sql.
--
-- This intentionally soft-deletes older built-in exercise libraries rather than
-- hard-deleting referenced exercise rows. The app should treat deleted_at as
-- inactive when reading normalized exercise rows.

begin;

update public.exercises
set deleted_at = now(),
    updated_at = now()
where user_id is null
  and is_builtin = true
  and source <> ${sqlString(SOURCE)};

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
  image_url = excluded.image_url,
  image_storage_path = excluded.image_storage_path,
  image_alt = excluded.image_alt,
  equipment = excluded.equipment,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  is_builtin = true,
  updated_at = now(),
  deleted_at = null;

commit;
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);

console.log(`Wrote ${includedRows.length} curated exercises to ${outputPath}`);
