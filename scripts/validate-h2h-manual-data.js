const fs = require("fs");
const path = require("path");

const DEFAULT_DIRS = [
  path.join("data", "h2h", "manual"),
  path.join("manual-data-import", "staged")
];

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isSeasonKey(value) {
  return /^\d{4}(-\d{2,4})?$/.test(String(value || ""));
}

function isValidIsoDate(value) {
  if (value === null || value === undefined || value === "") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function isNumberLikeOrNull(value) {
  if (typeof value === "string") {
    if (!value.trim() || value.trim() === "-") return true;
    return Number.isFinite(Number(value.replace(/,/g, "")));
  }

  return value === null || value === undefined || typeof value === "number";
}

function validateEvent(event, context, errors) {
  const finish = event.finish ?? event.position;
  const needsReview = event.needsReview === true;

  if (!isValidIsoDate(event.date)) {
    errors.push(`${context}: date must be YYYY-MM-DD when present.`);
  }

  if (!needsReview && !event.tournament) {
    errors.push(`${context}: missing tournament.`);
  }

  if (!needsReview && (finish === undefined || finish === null || finish === "")) {
    errors.push(`${context}: missing finish/position.`);
  }

  ["r1", "r2", "r3", "r4", "total", "fedExCupRank", "fedExCupPoints"].forEach((field) => {
    if (field in event && !isNumberLikeOrNull(event[field])) {
      errors.push(`${context}: ${field} must be a number, numeric string, or null.`);
    }
  });

  if (Array.isArray(event.rounds)) {
    event.rounds.forEach((round, index) => {
      if (!isNumberLikeOrNull(round)) {
        errors.push(`${context}: rounds[${index}] must be a number, numeric string, or null.`);
      }
    });
  }
}

function validateFile(filePath) {
  const errors = [];
  let data;

  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return [`${filePath}: invalid JSON: ${error.message}`];
  }

  const baseSlug = path.basename(filePath).replace(/-results\.json$/, "");

  if (!data.player) {
    errors.push(`${filePath}: missing player.`);
  }

  if (data.slug && data.slug !== baseSlug) {
    errors.push(`${filePath}: slug ${data.slug} does not match filename slug ${baseSlug}.`);
  }

  if (!data.slug && data.player && slugify(data.player) !== baseSlug) {
    errors.push(`${filePath}: player name does not match filename slug ${baseSlug}.`);
  }

  if (!data.seasons || typeof data.seasons !== "object" || Array.isArray(data.seasons)) {
    errors.push(`${filePath}: missing seasons object.`);
    return errors;
  }

  const seen = new Set();

  for (const [seasonKey, season] of Object.entries(data.seasons)) {
    if (!isSeasonKey(seasonKey)) {
      errors.push(`${filePath}: invalid season key ${seasonKey}.`);
    }

    if (!Array.isArray(season.events)) {
      errors.push(`${filePath}: season ${seasonKey} missing events array.`);
      continue;
    }

    season.events.forEach((event, index) => {
      const context = `${filePath}: ${seasonKey} events[${index}]`;
      validateEvent(event, context, errors);

      const duplicateKey = [
        seasonKey,
        event.date || "",
        String(event.tournament || "").toLowerCase(),
        event.sourceFile || ""
      ].join("|");

      if (seen.has(duplicateKey)) {
        errors.push(`${context}: duplicate player-year-event row.`);
      }

      seen.add(duplicateKey);
    });
  }

  return errors;
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((file) => file.endsWith("-results.json"))
    .map((file) => path.join(dir, file));
}

function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_DIRS;
  const files = dirs.flatMap(collectFiles);
  const errors = files.flatMap(validateFile);

  console.log(`[H2H Validate] Checked ${files.length} manual/staged files.`);

  if (errors.length) {
    console.error(`[H2H Validate] Found ${errors.length} issue(s):`);
    errors.slice(0, 200).forEach((error) => console.error(`- ${error}`));

    if (errors.length > 200) {
      console.error(`- ...and ${errors.length - 200} more.`);
    }

    process.exit(1);
  }

  console.log("[H2H Validate] Manual data validation passed.");
}

main();
