const fs = require("fs");
const path = require("path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function severityForReason(reason) {
  const text = String(reason || "").toLowerCase();

  if (
    text.includes("missing finish") ||
    text.includes("missing tournament") ||
    text.includes("could not parse date") ||
    text.includes("parsed invalid date") ||
    text.includes("does not match screenshot season") ||
    text.includes("no date rows") ||
    text.includes("ocr failed") ||
    text.includes("ocr skipped") ||
    text.includes("filename does not match")
  ) {
    return "blocking";
  }

  if (
    text.includes("normalized") ||
    text.includes("questionable") ||
    text.includes("uncertain")
  ) {
    return "warning";
  }

  return "info";
}

function reasonCategories(reason) {
  const text = String(reason || "");
  const categories = [];

  if (/Missing finish\/position/i.test(text)) {
    categories.push("Missing finish/position from OCR row.");
  }

  if (/Missing tournament/i.test(text)) {
    categories.push("Missing tournament name from OCR row.");
  }

  if (/Could not parse date token/i.test(text)) {
    categories.push("Could not parse date token.");
  }

  if (/Parsed invalid date token/i.test(text)) {
    categories.push("Parsed invalid date token.");
  }

  if (/does not match screenshot season/i.test(text)) {
    categories.push("Date year does not match screenshot season.");
  }

  if (/Date OCR token was normalized/i.test(text)) {
    categories.push("Date OCR token was normalized.");
  }

  if (/No date rows were detected/i.test(text)) {
    categories.push("No date rows were detected by OCR.");
  }

  if (/OCR failed|OCR skipped/i.test(text)) {
    categories.push("OCR failed or was skipped.");
  }

  if (/Filename does not match/i.test(text)) {
    categories.push("Filename did not match expected pattern.");
  }

  return categories.length ? categories : [text || "Uncategorized review item."];
}

function yearFromSource(sourceScreenshot) {
  const base = path.basename(String(sourceScreenshot || ""), path.extname(String(sourceScreenshot || "")));
  const match = base.match(/^(.+?)-(\d{4}(?:-\d{2,4})?)(?:-(\d+))?$/);
  if (!match) return "unknown";
  return match[2].slice(0, 4);
}

function reviewYear(item) {
  const date = item.partialData?.date;
  if (/^\d{4}-/.test(String(date || ""))) return String(date).slice(0, 4);
  return yearFromSource(item.sourceScreenshot);
}

function normalizeReviewItem(item) {
  const severity = item.severity || severityForReason(item.reason);
  return {
    severity,
    year: item.year || reviewYear(item),
    ...item,
    severity
  };
}

function incrementCount(map, key, delta = 1) {
  map.set(key, (map.get(key) || 0) + delta);
}

function sortEntriesByCount(map) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function stagedPlayerYearGroups(stagedDir) {
  const groups = new Map();

  if (!fs.existsSync(stagedDir)) return groups;

  for (const file of fs.readdirSync(stagedDir).filter((name) => name.endsWith("-results.json"))) {
    const data = readJson(path.join(stagedDir, file));
    const player = data.player || file.replace(/-results\.json$/, "");
    const playerSlug = data.slug || file.replace(/-results\.json$/, "");

    for (const [seasonKey, season] of Object.entries(data.seasons || {})) {
      for (const event of season.events || []) {
        const year = /^\d{4}-/.test(String(event.date || ""))
          ? String(event.date).slice(0, 4)
          : String(seasonKey).slice(0, 4);
        const key = `${playerSlug}|${year}`;

        if (!groups.has(key)) {
          groups.set(key, {
            player,
            playerSlug,
            year,
            rowCount: 0,
            reviewCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
            promotable: true
          });
        }

        groups.get(key).rowCount += 1;
      }
    }
  }

  return groups;
}

function applyReviewsToGroups(groups, reviewItems) {
  for (const item of reviewItems) {
    const playerSlug = item.playerSlug || "unknown";
    const year = item.year || "unknown";
    const key = `${playerSlug}|${year}`;

    if (!groups.has(key)) {
      groups.set(key, {
        player: item.playerName || playerSlug,
        playerSlug,
        year,
        rowCount: 0,
        reviewCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        promotable: false
      });
    }

    const group = groups.get(key);
    group.reviewCount += 1;
    group[`${item.severity}Count`] += 1;
  }

  for (const group of groups.values()) {
    group.promotable = group.rowCount > 0 && group.blockingCount === 0;
  }
}

function table(rows, headers) {
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`
  ];

  for (const row of rows) {
    lines.push(`| ${headers.map((header) => String(row[header] ?? "")).join(" | ")} |`);
  }

  return lines.join("\n");
}

function textSnippet(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function buildReviewSummary(manifest, reviewItems, groups) {
  const byPlayer = new Map();
  const byYear = new Map();
  const byReason = new Map();
  const severityCounts = { blocking: 0, warning: 0, info: 0 };

  for (const item of reviewItems) {
    const playerKey = `${item.playerName || item.playerSlug}|${item.playerSlug}`;
    const current = byPlayer.get(playerKey) || {
      Player: item.playerName || item.playerSlug,
      Slug: item.playerSlug,
      Total: 0,
      Blocking: 0,
      Warning: 0,
      Info: 0
    };

    current.Total += 1;
    current[item.severity[0].toUpperCase() + item.severity.slice(1)] += 1;
    byPlayer.set(playerKey, current);

    incrementCount(byYear, item.year || "unknown");
    severityCounts[item.severity] += 1;

    for (const category of reasonCategories(item.reason)) {
      incrementCount(byReason, category);
    }
  }

  const playerRows = Array.from(byPlayer.values())
    .sort((a, b) => b.Total - a.Total || a.Player.localeCompare(b.Player));
  const yearRows = sortEntriesByCount(byYear)
    .map(([Year, Count]) => ({ Year, Count }));
  const reasonRows = sortEntriesByCount(byReason)
    .slice(0, 15)
    .map(([Reason, Count]) => ({ Reason, Count }));
  const examples = reviewItems
    .filter((item) => item.severity === "blocking")
    .slice(0, 8);
  const promotableCount = Array.from(groups.values())
    .filter((group) => group.promotable)
    .length;
  const stagedRows = Array.from(groups.values())
    .reduce((sum, group) => sum + group.rowCount, 0);

  const lines = [
    "# Manual H2H Import Review Summary",
    "",
    "## Totals",
    "",
    `- Screenshots processed: ${manifest.screenshotsProcessed ?? "unknown"}`,
    `- Staged event rows: ${stagedRows}`,
    `- Review-needed rows: ${reviewItems.length}`,
    `- Blocking review rows: ${severityCounts.blocking}`,
    `- Warning review rows: ${severityCounts.warning}`,
    `- Info review rows: ${severityCounts.info}`,
    `- Clean promotable player-years: ${promotableCount}`,
    "",
    "## Review-Needed Count By Player",
    "",
    table(playerRows, ["Player", "Slug", "Total", "Blocking", "Warning", "Info"]),
    "",
    "## Review-Needed Count By Year",
    "",
    table(yearRows, ["Year", "Count"]),
    "",
    "## Most Common Review Reasons",
    "",
    table(reasonRows, ["Reason", "Count"]),
    "",
    "## Examples Of Uncertain Extracted Text",
    ""
  ];

  for (const item of examples) {
    lines.push(`### ${item.playerName || item.playerSlug} - ${item.year}`);
    lines.push("");
    lines.push(`- Severity: ${item.severity}`);
    lines.push(`- Source: ${item.sourceScreenshot}`);
    lines.push(`- Reason: ${item.reason}`);
    lines.push(`- Partial data: \`${JSON.stringify(item.partialData || {})}\``);
    lines.push(`- OCR text: ${textSnippet(item.partialText || item.partialExtractedText)}`);
    lines.push("");
  }

  lines.push("## Recommended Next Action");
  lines.push("");
  lines.push("Review blocking rows first in `manual-data-import/review-needed.json`, correct staged player-year data only where the screenshot is clear, rerun validation, then promote only player-year groups with `blockingCount: 0`. Do not promote full player files until their unresolved blocking rows are handled.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function generateReviewReports(outDir = "manual-data-import") {
  const resolved = path.resolve(outDir);
  const manifestPath = path.join(resolved, "manifest.json");
  const reviewPath = path.join(resolved, "review-needed.json");
  const stagedDir = path.join(resolved, "staged");

  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  const reviewItems = fs.existsSync(reviewPath)
    ? readJson(reviewPath).map(normalizeReviewItem)
    : [];
  const groups = stagedPlayerYearGroups(stagedDir);

  applyReviewsToGroups(groups, reviewItems);

  const promotableGroups = Array.from(groups.values())
    .sort((a, b) => a.player.localeCompare(b.player) || String(a.year).localeCompare(String(b.year)));

  writeJson(reviewPath, reviewItems);
  writeJson(path.join(resolved, "promotable-summary.json"), {
    generatedAt: new Date().toISOString(),
    rules: {
      promotable: "A player-year is promotable only if blockingCount is 0."
    },
    playerYears: promotableGroups
  });

  fs.writeFileSync(
    path.join(resolved, "review-summary.md"),
    buildReviewSummary(manifest, reviewItems, groups)
  );

  return {
    reviewNeeded: reviewItems.length,
    playerYears: promotableGroups.length,
    promotablePlayerYears: promotableGroups.filter((group) => group.promotable).length
  };
}

function main() {
  const outDir = process.argv[2] || "manual-data-import";
  const summary = generateReviewReports(outDir);
  console.log("[H2H Review] Summary:");
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  generateReviewReports,
  normalizeReviewItem,
  severityForReason
};
