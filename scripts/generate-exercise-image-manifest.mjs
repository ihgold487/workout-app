import fs from "node:fs";
import path from "node:path";

const [
  csvPath = "supabase/exercise_library_review_template.csv",
  imageDirectory = "supabase/ExerciseImages",
  publicImageDirectory = "public/exercise-media",
  manifestPath = "supabase/exercise_image_manifest.json",
] = process.argv.slice(2);

const EXTENSION_PRIORITY = [".gif", ".webp", ".png", ".jpg", ".jpeg"];

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

function readCsv(filePath) {
  const rawCsv = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = rawCsv.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);

    if (cells.length !== header.length) {
      throw new Error(
        `${filePath}:${index + 2} has ${cells.length} columns; expected ${header.length}.`
      );
    }

    return {
      lineNumber: index + 2,
      ...Object.fromEntries(
        header.map((key, cellIndex) => [key, cells[cellIndex]])
      ),
    };
  });
}

function sanitizeFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageNameWithoutLine(fileName) {
  return fileName.replace(/^\d+\.\s*/, "").replace(/\.[^.]+$/, "").trim();
}

function extensionRank(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const index = EXTENSION_PRIORITY.indexOf(extension);

  return index === -1 ? EXTENSION_PRIORITY.length : index;
}

function chooseImageFile(files) {
  return [...files].sort((left, right) => {
    const leftName = imageNameWithoutLine(left);
    const rightName = imageNameWithoutLine(right);
    const leftBlank = leftName.length === 0 ? 1 : 0;
    const rightBlank = rightName.length === 0 ? 1 : 0;

    if (leftBlank !== rightBlank) {
      return leftBlank - rightBlank;
    }

    const extensionComparison = extensionRank(left) - extensionRank(right);

    if (extensionComparison !== 0) {
      return extensionComparison;
    }

    return left.localeCompare(right);
  })[0];
}

const rows = readCsv(csvPath).filter(
  (row) => row.include_in_seed?.toLowerCase() === "yes"
);
const imageFiles = fs.existsSync(imageDirectory)
  ? fs.readdirSync(imageDirectory).filter((fileName) => {
      const filePath = path.join(imageDirectory, fileName);
      return fs.statSync(filePath).isFile();
    })
  : [];
const filesByLine = imageFiles.reduce((groups, fileName) => {
  const lineNumber = Number(fileName.match(/^(\d+)\./)?.[1]);

  if (!lineNumber) {
    return groups;
  }

  groups[lineNumber] ||= [];
  groups[lineNumber].push(fileName);
  return groups;
}, {});

fs.mkdirSync(publicImageDirectory, { recursive: true });

const missing = [];
const duplicateChoices = [];
const manifest = [];

for (const row of rows) {
  const files = filesByLine[row.lineNumber] || [];

  if (files.length === 0) {
    missing.push(`${row.lineNumber}. ${row.name} / ${row.equipment}`);
    continue;
  }

  const chosenFile = chooseImageFile(files);
  const extension = path.extname(chosenFile).toLowerCase();
  const outputFile = `${sanitizeFilePart(row.source_key)}${extension}`;

  if (files.length > 1) {
    duplicateChoices.push({
      chosenFile,
      files,
      lineNumber: row.lineNumber,
      name: row.name,
    });
  }

  fs.copyFileSync(
    path.join(imageDirectory, chosenFile),
    path.join(publicImageDirectory, outputFile)
  );

  manifest.push({
    equipment: row.equipment,
    imageAlt: `${row.name} ${row.equipment} exercise demonstration`,
    imageFile: chosenFile,
    imageUrl: `exercise-media/${outputFile}`,
    lineNumber: row.lineNumber,
    name: row.name,
    sourceKey: row.source_key,
  });
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Copied ${manifest.length} exercise images to ${publicImageDirectory}`);
console.log(`Wrote ${manifest.length} image manifest rows to ${manifestPath}`);

if (missing.length > 0) {
  console.log(`Missing images (${missing.length}):`);
  for (const item of missing) {
    console.log(`  ${item}`);
  }
}

if (duplicateChoices.length > 0) {
  console.log(`Duplicate image choices (${duplicateChoices.length}):`);
  for (const item of duplicateChoices) {
    console.log(
      `  ${item.lineNumber}. ${item.name}: chose "${item.chosenFile}" from ${item.files
        .map((file) => `"${file}"`)
        .join(", ")}`
    );
  }
}
