const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_DIR = path.join("data", "h2h", "manual");
const DEFAULT_REPORT_DIR = "manual-data-import";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((file) => file.endsWith("-results.json"))
    .sort()
    .map((file) => path.join(dir, file));
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).replace(/[$,%+,]/g, "").trim();
  if (!text || text === "-") return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function getFinish(event) {
  return event.finish ?? event.position ?? null;
}

function finishLooksStrange(value) {
  if (isBlank(value)) return false;

  const text = String(value).trim().toUpperCase();
  if (/^(CUT|MC|WD|W\/D|DQ|DNS|MDF|T?\d{1,3})$/.test(text)) return false;
  if (/^P\d{1,3}$/.test(text)) return false;

  return true;
}

function seasonYears(seasonKey) {
  const parts = String(seasonKey).split("-");
  const start = Number(parts[0]);

  if (!Number.isFinite(start)) return [];
  if (parts.length === 1) return [start];

  const rawEnd = parts[1];
  const end = rawEnd.length === 2
    ? Number(`${String(start).slice(0, 2)}${rawEnd}`)
    : Number(rawEnd);

  return Number.isFinite(end) ? [start, end] : [start];
}

function isMatchPlayOrStableford(event) {
  const text = normalizeName(event.tournament);
  return (
    text.includes("match play") ||
    text.includes("stableford") ||
    text.includes("international")
  );
}

function isUnofficial(event) {
  return (
    event.unofficial === true ||
    event.official === false ||
    event.officialStart === false ||
    String(event.tournament || "").trim().endsWith("*")
  );
}

function roundValues(event) {
  const direct = ["r1", "r2", "r3", "r4"].map((field) => event[field]);

  if (direct.some((value) => value !== undefined)) {
    return direct;
  }

  return Array.isArray(event.rounds) ? event.rounds : [];
}

function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function topEntries(map, limit = 50) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function checkEvent(event, context, warnings) {
  const finish = getFinish(event);
  const rounds = roundValues(event);
  const numericRounds = rounds.map(numberValue).filter((value) => value !== null);
  const total = numberValue(event.total);
  const allowedYears = seasonYears(context.seasonKey);
  const dateYear = Number(String(event.date || "").slice(0, 4));
  const currentYear = new Date().getFullYear();

  function warn(type, message) {
    warnings.push({
      type,
      message,
      player: context.player,
      playerSlug: context.playerSlug,
      year: context.seasonKey,
      eventIndex: context.eventIndex,
      date: event.date || null,
      tournament: event.tournament || null,
      sourceFile: event.sourceFile || null
    });
  }

  if (isBlank(finish)) warn("missing_finish", "Finish/position is missing.");
  if (isBlank(event.toPar)) warn("missing_to_par", "To-par value is missing.");
  if (isBlank(event.earnings)) warn("missing_earnings", "Earnings value is missing.");

  if (!rounds.length || rounds.some(isBlank)) {
    warn("missing_round_scores", "One or more round score fields are missing.");
  }

  if (total === null) {
    warn("null_total", "Total score is null or not numeric.");
  }

  if (typeof event.total === "string" && event.total.trim()) {
    warn("string_total", "Total score is stored as a string.");
  }

  if (finishLooksStrange(finish)) {
    warn("strange_finish", `Finish value ${finish} is unusual.`);
  }

  if (
    numericRounds.length &&
    total !== null &&
    numericRounds.reduce((sum, value) => sum + value, 0) !== total
  ) {
    warn("total_round_sum_mismatch", "Total does not equal the sum of known round scores.");
  }

  if (dateYear && (dateYear < 1900 || dateYear > currentYear + 1)) {
    warn("very_unusual_date", "Event date is outside the expected historical range.");
  } else if (dateYear && allowedYears.length && !allowedYears.includes(dateYear)) {
    warn("very_unusual_date", "Event date year does not match the season key.");
  }

  if (isMatchPlayOrStableford(event)) {
    warn("match_play_or_stableford", "Event may use non-standard match-play or Stableford scoring.");
  }

  if (isUnofficial(event)) {
    warn("unofficial_event", "Event is marked or appears to be unofficial.");
  }
}

function buildMarkdownReport(report) {
  const lines = [
    "# Manual H2H Sanity Report",
    "",
    "## Summary",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Data directory: ${report.dataDir}`,
    `- Files checked: ${report.filesChecked}`,
    `- Players checked: ${report.playersChecked}`,
    `- Seasons checked: ${report.seasonsChecked}`,
    `- Event rows checked: ${report.eventsChecked}`,
    `- Total warnings: ${report.warningCount}`,
    "",
    "## Top Warning Types",
    "",
    "| Warning | Count |",
    "| --- | ---: |"
  ];

  for (const item of report.topWarningTypes) {
    lines.push(`| ${item.key} | ${item.count} |`);
  }

  lines.push("");
  lines.push("## Warnings By Player");
  lines.push("");
  lines.push("| Player | Count |");
  lines.push("| --- | ---: |");

  for (const item of report.warningsByPlayer) {
    lines.push(`| ${item.key} | ${item.count} |`);
  }

  lines.push("");
  lines.push("## Warnings By Year");
  lines.push("");
  lines.push("| Year | Count |");
  lines.push("| --- | ---: |");

  for (const item of report.warningsByYear) {
    lines.push(`| ${item.key} | ${item.count} |`);
  }

  lines.push("");
  lines.push("## Examples");
  lines.push("");
  lines.push("| Type | Player | Year | Date | Tournament | Message |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const warning of report.examples) {
    lines.push(
      `| ${warning.type} | ${warning.player} | ${warning.year} | ${warning.date || ""} | ${warning.tournament || ""} | ${warning.message} |`
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function runSanityCheck(options = {}) {
  const dataDir = path.resolve(options.dataDir || DEFAULT_DATA_DIR);
  const reportDir = path.resolve(options.reportDir || DEFAULT_REPORT_DIR);
  const files = collectFiles(dataDir);
  const warnings = [];
  const warningsByPlayer = new Map();
  const warningsByYear = new Map();
  const warningTypes = new Map();
  let seasonsChecked = 0;
  let eventsChecked = 0;

  for (const file of files) {
    const data = readJson(file);

    for (const [seasonKey, season] of Object.entries(data.seasons || {})) {
      seasonsChecked += 1;

      const seenTournamentNames = new Map();
      let previousDate = "";

      (season.events || []).forEach((event, eventIndex) => {
        eventsChecked += 1;

        const before = warnings.length;
        checkEvent(event, {
          player: data.player,
          playerSlug: data.slug || path.basename(file).replace(/-results\.json$/, ""),
          seasonKey,
          eventIndex
        }, warnings);

        const normalizedTournament = normalizeName(event.tournament);
        if (normalizedTournament) {
          const count = seenTournamentNames.get(normalizedTournament) || 0;
          if (count > 0) {
            warnings.push({
              type: "duplicate_tournament_name",
              message: "Tournament name appears more than once in this player-year.",
              player: data.player,
              playerSlug: data.slug || path.basename(file).replace(/-results\.json$/, ""),
              year: seasonKey,
              eventIndex,
              date: event.date || null,
              tournament: event.tournament || null,
              sourceFile: event.sourceFile || null
            });
          }

          seenTournamentNames.set(normalizedTournament, count + 1);
        }

        if (previousDate && event.date && String(event.date) < previousDate) {
          warnings.push({
            type: "events_out_of_chronological_order",
            message: "Event date appears before the previous event in this player-year.",
            player: data.player,
            playerSlug: data.slug || path.basename(file).replace(/-results\.json$/, ""),
            year: seasonKey,
            eventIndex,
            date: event.date || null,
            tournament: event.tournament || null,
            sourceFile: event.sourceFile || null
          });
        }

        if (event.date) previousDate = String(event.date);

        for (const warning of warnings.slice(before)) {
          addCount(warningTypes, warning.type);
          addCount(warningsByPlayer, warning.player);
          addCount(warningsByYear, warning.year);
        }
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dataDir: path.relative(process.cwd(), dataDir).replace(/\\/g, "/") || ".",
    filesChecked: files.length,
    playersChecked: files.length,
    seasonsChecked,
    eventsChecked,
    warningCount: warnings.length,
    topWarningTypes: topEntries(warningTypes),
    warningsByPlayer: topEntries(warningsByPlayer, 200),
    warningsByYear: topEntries(warningsByYear, 200),
    examples: warnings.slice(0, 100),
    warnings
  };

  writeJson(path.join(reportDir, "sanity-report.json"), report);
  fs.writeFileSync(path.join(reportDir, "sanity-report.md"), buildMarkdownReport(report));

  return report;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--data-dir") {
      options.dataDir = next;
      index += 1;
    } else if (arg === "--report-dir") {
      options.reportDir = next;
      index += 1;
    }
  }

  return options;
}

function main() {
  const report = runSanityCheck(parseArgs(process.argv));

  console.log("[H2H Sanity] Report:");
  console.log(JSON.stringify({
    filesChecked: report.filesChecked,
    eventsChecked: report.eventsChecked,
    warningCount: report.warningCount,
    topWarningTypes: report.topWarningTypes.slice(0, 10)
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  runSanityCheck
};
