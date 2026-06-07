const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "data", "h2h", "manual", "nick-faldo-results.json");

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
  return text;
}

function convertEvent(event) {
  const next = {
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
    next.unofficial = true;
  }

  return next;
}

function convertFile(data) {
  const output = {
    player: "Nick Faldo",
    slug: "nick-faldo",
    seasons: {}
  };

  for (const [year, season] of Object.entries(data.seasons || {})) {
    output.seasons[year] = {
      events: (season.events || []).map(convertEvent)
    };
  }

  return output;
}

const raw = fs.readFileSync(filePath, "utf8");
const data = JSON.parse(raw);
const converted = convertFile(data);

fs.writeFileSync(filePath, JSON.stringify(converted, null, 2) + "\n");

console.log("Fixed nick-faldo-results.json");