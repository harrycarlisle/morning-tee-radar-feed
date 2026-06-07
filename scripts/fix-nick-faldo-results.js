const fs = require("fs");
const path = require("path");

const filePath = path.join(
  process.cwd(),
  "data",
  "h2h",
  "manual",
  "nick-faldo-results.json"
);

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  if (!text || text === "-") return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function cleanToPar(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  if (!text || text === "-") return null;
  if (text === "E") return "E";

  return text;
}

function repairKnownNickFaldoIssues(raw) {
  let text = raw;

  // Fix the bad splice where 1994 was accidentally inserted as an object
  // inside the 1993 events array.
  text = text.replace(
    /},\s*\{\s*"1994"\s*:\s*\{\s*"date"\s*:/,
    `}\n]\n},\n"1994": {\n"events": [\n{\n"date":`
  );

  // Fix older version of the same issue where a second root object was pasted in.
  text = text.replace(
    /]\s*},\s*\{\s*"player"\s*:\s*"Nick Faldo"\s*,\s*"seasons"\s*:\s*\{\s*"1994"\s*:\s*\{\s*"events"\s*:\s*\[/,
    `]\n},\n"1994": {\n"events": [`
  );

  // Remove a UTF-8 BOM if GitHub/text editor added one.
  text = text.replace(/^\uFEFF/, "");

  return text;
}

function convertEvent(event) {
  const converted = {
    date: event.date,
    tournament: event.tournament,
    finish: event.finish ?? event.position ?? null,
    toPar: cleanToPar(event.toPar ?? event.overall),
    rounds: Array.isArray(event.rounds)
      ? event.rounds.map(toNumberOrNull)
      : [
          toNumberOrNull(event.round1),
          toNumberOrNull(event.round2),
          toNumberOrNull(event.round3),
          toNumberOrNull(event.round4)
        ],
    total: toNumberOrNull(event.total),
    earnings: event.earnings ?? "$-"
  };

  if (event.unofficial === true || event.official === false) {
    converted.unofficial = true;
  }

  return converted;
}

function convertFile(data) {
  const output = {
    player: "Nick Faldo",
    slug: "nick-faldo",
    seasons: {}
  };

  for (const [year, season] of Object.entries(data.seasons || {})) {
    const events = Array.isArray(season.events) ? season.events : [];

    output.seasons[year] = {
      events: events.map(convertEvent)
    };
  }

  return output;
}

function parseWithRepair(raw) {
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    const repaired = repairKnownNickFaldoIssues(raw);

    try {
      return JSON.parse(repaired);
    } catch (secondError) {
      console.error("Could not parse nick-faldo-results.json.");
      console.error("Original error:");
      console.error(firstError.message);
      console.error("");
      console.error("After repair attempt:");
      console.error(secondError.message);
      process.exit(1);
    }
  }
}

const raw = fs.readFileSync(filePath, "utf8");
const data = parseWithRepair(raw);
const converted = convertFile(data);

fs.writeFileSync(filePath, JSON.stringify(converted, null, 2) + "\n");

console.log("Fixed nick-faldo-results.json");
