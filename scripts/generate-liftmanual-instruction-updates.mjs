import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const inputFile = "supabase/exercise_instruction_urls.csv";
const missingFile = "supabase/exercise_instruction_urls_missing.csv";
const outputSqlFile = "supabase/update_exercise_instructions_from_liftmanual.sql";
const failureFile = "supabase/exercise_instruction_import_failures.csv";
const seedFile = "src/data/seedExercises.js";
const requestDelayMs = Number(process.env.LIFTMANUAL_REQUEST_DELAY_MS || 750);
const retryDelayMs = Number(process.env.LIFTMANUAL_RETRY_DELAY_MS || 5000);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");

      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] || ""])
      );
    });
}

function csvLine(values) {
  return values
    .map((value) => {
      const text = String(value ?? "");

      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, " - ")
    .replace(/&ndash;/g, " - ")
    .replace(/&deg;/g, " degrees ")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/[—–]/g, " - ")
    .replace(/°/g, " degrees ");
}

function stripTags(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInstructionSteps(html, expectedName) {
  const headingPattern = /<h2[^>]*>([\s\S]*?Instructions[\s\S]*?)<\/h2>/gi;
  let headingMatch;

  while ((headingMatch = headingPattern.exec(html))) {
    const afterHeading = html.slice(headingPattern.lastIndex);
    const olMatch = afterHeading.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);

    if (!olMatch) {
      continue;
    }

    const steps = [...olMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => paraphraseStep(stripTags(match[1]), expectedName))
      .filter(Boolean);

    if (steps.length > 0) {
      return steps;
    }
  }

  return [];
}

function paraphraseStep(step, exerciseName) {
  let text = step
    .replace(/\bdesired number of reps\b/gi, "planned reps")
    .replace(/\brepeat for\b/gi, "continue for")
    .replace(/\bmake sure\b/gi, "confirm")
    .replace(/\bkeep\b/gi, "maintain")
    .replace(/\bslowly\b/gi, "with control")
    .replace(/\bfirmly\b/gi, "securely")
    .replace(/\bbrace\b/gi, "tighten")
    .replace(/\bexhale\b/gi, "breathe out")
    .replace(/\binhale\b/gi, "breathe in")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (!/[.!?]$/.test(text)) {
    text += ".";
  }

  return text
    .replace(new RegExp(`^${exerciseName}\\s+`, "i"), "")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, character) =>
      `${prefix}${character.toUpperCase()}`
    );
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
          },
          rejectUnauthorized: false,
        },
        (response) => {
          if (
            [301, 302, 303, 307, 308].includes(response.statusCode) &&
            response.headers.location
          ) {
            resolve(fetchHtml(new URL(response.headers.location, url).href));
            return;
          }

          let html = "";

          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            html += chunk;
          });
          response.on("end", () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP ${response.statusCode}`));
              return;
            }

            resolve(html);
          });
        }
      )
      .on("error", reject);
  });
}

async function fetchHtmlWithRetry(url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchHtml(url);
    } catch (error) {
      lastError = error;

      if (!String(error.message || "").includes("HTTP 429") || attempt === attempts) {
        break;
      }

      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sourceKeyFromImageUrl(imageUrl) {
  const basename = path
    .basename(imageUrl)
    .replace(/\.(gif|webp|jpg|jpeg|png)$/i, "");
  const match = basename.match(
    /^(history-csv-\d{4}-\d{2}-\d{2}|manual-\d{4}-\d{2}-\d{2})-(.+)$/
  );

  if (!match) {
    return "";
  }

  return `${match[1]}:${match[2]}`;
}

function parseSeedSourceKeys(seedText) {
  const blocks = seedText.match(/\{\n[\s\S]*?\n  \}/g) || [];
  const byLocalId = new Map();

  for (const block of blocks) {
    const id = Number(block.match(/\n\s*id:\s*(\d+),/)?.[1]);
    const imageUrl = block.match(/\n\s*imageUrl:\s*"([^"]+)"/)?.[1] || "";
    const sourceKey = sourceKeyFromImageUrl(imageUrl);

    if (Number.isFinite(id) && sourceKey) {
      byLocalId.set(id, sourceKey);
    }
  }

  return byLocalId;
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  if (!values.length) {
    return "'{}'::text[]";
  }

  return `array[${values.map(sqlString).join(", ")}]::text[]`;
}

async function main() {
  const [csvText, seedText] = await Promise.all([
    fs.readFile(inputFile, "utf8"),
    fs.readFile(seedFile, "utf8"),
  ]);
  const rows = parseCsv(csvText);
  const sourceKeysByLocalId = parseSeedSourceKeys(seedText);
  const rowsWithUrls = rows.filter((row) => row.lift_manual_url);
  const missingRows = rows.filter((row) => !row.lift_manual_url);
  const updates = [];
  const failures = [];

  for (const [index, row] of rowsWithUrls.entries()) {
    process.stdout.write(
      `[${index + 1}/${rowsWithUrls.length}] ${row.name} (${row.equipment})\n`
    );

    try {
      if (index > 0 && requestDelayMs > 0) {
        await sleep(requestDelayMs);
      }

      const html = await fetchHtmlWithRetry(row.lift_manual_url);
      const steps = extractInstructionSteps(html, row.name);
      const sourceKey =
        sourceKeysByLocalId.get(Number(row.local_id)) ||
        `history-csv-2026-06-07:${slug(`${row.name}-${row.equipment}`)}`;

      if (!steps.length) {
        failures.push({
          ...row,
          reason: "No instruction list found",
        });
        continue;
      }

      updates.push({
        ...row,
        sourceKey,
        steps,
      });
    } catch (error) {
      failures.push({
        ...row,
        reason: error.message,
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const sql = [
    "-- Updates built-in exercise instructions from Lift Manual URLs.",
    `-- Generated ${generatedAt}.`,
    "-- Review before running in Supabase SQL editor.",
    "",
    "begin;",
    "",
    ...updates.flatMap((update) => [
      `-- ${update.name} (${update.equipment})`,
      "update public.exercises",
      "set",
      `  instruction_steps = ${sqlTextArray(update.steps)},`,
      "  instruction_source = 'Lift Manual',",
      `  instruction_source_url = ${sqlString(update.lift_manual_url)},`,
      "  updated_at = now()",
      "where user_id is null",
      "  and is_builtin = true",
      "  and source = 'curated_exercise_library_v1'",
      `  and source_key = ${sqlString(update.sourceKey)};`,
      "",
    ]),
    "commit;",
    "",
  ].join("\n");

  const missingCsv = [
    "local_id,name,equipment,lift_manual_url",
    ...missingRows.map((row) =>
      csvLine([row.local_id, row.name, row.equipment, row.lift_manual_url])
    ),
    "",
  ].join("\n");
  const failureCsv = [
    "local_id,name,equipment,lift_manual_url,reason",
    ...failures.map((row) =>
      csvLine([
        row.local_id,
        row.name,
        row.equipment,
        row.lift_manual_url,
        row.reason,
      ])
    ),
    "",
  ].join("\n");

  await Promise.all([
    fs.writeFile(outputSqlFile, sql),
    fs.writeFile(missingFile, missingCsv),
    fs.writeFile(failureFile, failureCsv),
  ]);

  console.log(
    `Generated ${updates.length} updates, ${missingRows.length} missing URL rows, ${failures.length} failures.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
