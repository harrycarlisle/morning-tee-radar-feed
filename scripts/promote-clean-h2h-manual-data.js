const fs = require("fs");
const path = require("path");

const SOURCE_TAG = "manual-screenshot-import";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    replaceExisting: false,
    allowWarnings: false,
    allowUnverifiedOcr: false,
    importDir: "manual-data-import",
    productionDir: path.join("data", "h2h", "manual")
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--replace-existing") {
      args.replaceExisting = true;
    } else if (arg === "--allow-warnings") {
      args.allowWarnings = true;
    } else if (arg === "--allow-unverified-ocr") {
      args.allowUnverifiedOcr = true;
    } else if (arg === "--import-dir") {
      args.importDir = next;
      index += 1;
    } else if (arg === "--production-dir") {
      args.productionDir = next;
      index += 1;
    }
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function eventYear(event, fallbackYear) {
  const dateYear = String(event.date || "").match(/^(\d{4})-/)?.[1];
  return dateYear || String(fallbackYear || "").slice(0, 4);
}

function eventKey(event) {
  return [
    event.date || "",
    String(event.tournament || "").trim().toLowerCase()
  ].join("|");
}

function cloneEventForProduction(event) {
  const {
    needsReview,
    reviewSeverity,
    ...cleanEvent
  } = event;

  return {
    ...cleanEvent,
    source: cleanEvent.source || SOURCE_TAG
  };
}

function hasEmbeddedResultToken(tournament) {
  return /\b(CUT|W\/D|WD|DQ|T?\d{1,3})$/i.test(String(tournament || "").trim());
}

function promotionSafetyIssues(event) {
  const issues = [];
  const rounds = ["r1", "r2", "r3", "r4"]
    .map((field) => event[field])
    .filter((value) => value !== null && value !== undefined);

  if (hasEmbeddedResultToken(event.tournament)) {
    issues.push("Tournament text appears to include a finish/result token.");
  }

  if (rounds.some((value) => Number(value) > 99)) {
    issues.push("Round score columns appear shifted because a round field is greater than 99.");
  }

  if ((event.total === null || event.total === undefined) && rounds.length > 0) {
    issues.push("Total is missing while round-score fields are populated.");
  }

  if (/^\d+(\.\d+)?$/.test(String(event.toPar || "")) && Math.abs(Number(event.toPar)) > 60) {
    issues.push("To-par field appears to contain a FedEx or points value.");
  }

  return issues;
}

function isVerifiedEvent(event) {
  return event.verified === true || event.manualVerified === true;
}

function groupStagedEventsByYear(stagedPlayer) {
  const byYear = new Map();

  for (const [seasonKey, season] of Object.entries(stagedPlayer.seasons || {})) {
    for (const event of season.events || []) {
      const year = eventYear(event, seasonKey);

      if (!byYear.has(year)) {
        byYear.set(year, {
          events: [],
          skippedDuplicateEvents: []
        });
      }

      const group = byYear.get(year);
      const key = eventKey(event);

      if (group.events.some((existing) => eventKey(existing) === key)) {
        group.skippedDuplicateEvents.push({
          date: event.date || null,
          tournament: event.tournament || null,
          sourceFile: event.sourceFile || null
        });
        continue;
      }

      group.events.push(cloneEventForProduction(event));
    }
  }

  for (const group of byYear.values()) {
    group.events.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }

  return byYear;
}

function buildEligibleGroups(promotableSummary, options) {
  return promotableSummary.playerYears
    .filter((group) => {
      if (group.promotable !== true) return false;
      if (Number(group.blockingCount || 0) !== 0) return false;
      if (!options.allowWarnings && Number(group.warningCount || 0) !== 0) return false;
      return true;
    })
    .sort((a, b) => a.playerSlug.localeCompare(b.playerSlug) || String(a.year).localeCompare(String(b.year)));
}

function productionTemplate(stagedPlayer) {
  return {
    player: stagedPlayer.player,
    slug: stagedPlayer.slug,
    source: SOURCE_TAG,
    seasons: {}
  };
}

function backupProductionFile(productionFile, backupDir) {
  if (!fs.existsSync(productionFile)) return null;

  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, path.basename(productionFile));
  fs.copyFileSync(productionFile, backupFile);
  return backupFile;
}

function buildMarkdownReport(report) {
  const lines = [
    "# Manual H2H Clean Promotion Report",
    "",
    "## Summary",
    "",
    `- Mode: ${report.dryRun ? "dry run" : "write"}`,
    `- Replace existing years: ${report.replaceExisting ? "yes" : "no"}`,
    `- Allow warning-only groups: ${report.allowWarnings ? "yes" : "no"}`,
    `- Allow unverified OCR groups: ${report.allowUnverifiedOcr ? "yes" : "no"}`,
    `- Promotable player-years in source summary: ${report.sourcePromotablePlayerYears}`,
    `- Eligible player-years: ${report.eligiblePlayerYears}`,
    `- Promoted player-years: ${report.promotedPlayerYears}`,
    `- Skipped existing player-years: ${report.skippedExistingPlayerYears}`,
    `- Skipped non-promotable player-years: ${report.skippedNotPromotablePlayerYears}`,
    `- Skipped warning-only player-years: ${report.skippedWarningPlayerYears}`,
    `- Skipped unverified OCR player-years: ${report.skippedUnverifiedOcrPlayerYears}`,
    `- Skipped unsafe OCR player-years: ${report.skippedUnsafePlayerYears}`,
    `- Production files changed: ${report.productionFilesChanged}`,
    `- New production files: ${report.newProductionFiles}`,
    `- Backups written: ${report.backups.length}`,
    "",
    "## Promoted Player-Years",
    "",
    "| Player | Slug | Year | Rows | Production file |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const item of report.promoted) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.rowCount} | ${item.productionFile} |`);
  }

  lines.push("");
  lines.push("## Skipped Existing Production Years");
  lines.push("");
  lines.push("| Player | Slug | Year | Reason |");
  lines.push("| --- | --- | --- | --- |");

  for (const item of report.skippedExisting) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.reason} |`);
  }

  lines.push("");
  lines.push("## Skipped Warning-Only Player-Years");
  lines.push("");
  lines.push("| Player | Slug | Year | Warnings | Reason |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const item of report.skippedWarning) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.warningCount} | ${item.reason} |`);
  }

  lines.push("");
  lines.push("## Skipped Non-Promotable Player-Years");
  lines.push("");
  lines.push("| Player | Slug | Year | Blocking | Warning | Reason |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const item of report.skippedNotPromotable) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.blockingCount} | ${item.warningCount} | ${item.reason} |`);
  }

  lines.push("");
  lines.push("## Skipped Unverified OCR Player-Years");
  lines.push("");
  lines.push("| Player | Slug | Year | Reason |");
  lines.push("| --- | --- | --- | --- |");

  for (const item of report.skippedUnverifiedOcr) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.reason} |`);
  }

  lines.push("");
  lines.push("## Skipped Unsafe OCR Player-Years");
  lines.push("");
  lines.push("| Player | Slug | Year | Reason |");
  lines.push("| --- | --- | --- | --- |");

  for (const item of report.skippedUnsafe) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.reason} |`);
  }

  lines.push("");
  lines.push("## Duplicate Staged Events Skipped");
  lines.push("");
  lines.push("| Player | Slug | Year | Date | Tournament |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const item of report.skippedDuplicateEvents) {
    lines.push(`| ${item.player} | ${item.playerSlug} | ${item.year} | ${item.date || ""} | ${item.tournament || ""} |`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function promoteCleanGroups(options) {
  const importDir = path.resolve(options.importDir);
  const productionDir = path.resolve(options.productionDir);
  const summaryPath = path.join(importDir, "promotable-summary.json");
  const stagedDir = path.join(importDir, "staged");
  const reportPath = path.join(importDir, "promotion-report.json");
  const markdownPath = path.join(importDir, "promotion-report.md");
  const backupDir = path.join(importDir, "backups", "promotion");

  const summary = readJson(summaryPath);
  const sourcePromotableGroups = summary.playerYears
    .filter((group) => group.promotable === true && Number(group.blockingCount || 0) === 0);
  const eligibleGroups = buildEligibleGroups(summary, options);
  const eligibleKeys = new Set(eligibleGroups.map((group) => `${group.playerSlug}|${group.year}`));
  const skippedWarning = sourcePromotableGroups
    .filter((group) => !options.allowWarnings && Number(group.warningCount || 0) > 0)
    .map((group) => ({
      player: group.player,
      playerSlug: group.playerSlug,
      year: group.year,
      reviewCount: group.reviewCount,
      blockingCount: group.blockingCount,
      warningCount: group.warningCount,
      reason: "Skipped by default because warning-only OCR still needs manual review."
    }));
  const skippedNotPromotable = summary.playerYears
    .filter((group) => !group.promotable || Number(group.blockingCount || 0) !== 0)
    .map((group) => ({
      player: group.player,
      playerSlug: group.playerSlug,
      year: group.year,
      blockingCount: group.blockingCount,
      warningCount: group.warningCount,
      reason: group.promotable ? "Skipped because blocking count is not zero." : "promotable-summary marks this player-year as not promotable."
    }));
  const stagedCache = new Map();
  const productionCache = new Map();
  const changedProduction = new Map();

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    replaceExisting: options.replaceExisting,
    allowWarnings: options.allowWarnings,
    allowUnverifiedOcr: options.allowUnverifiedOcr,
    importDir,
    productionDir,
    sourcePromotablePlayerYears: sourcePromotableGroups.length,
    eligiblePlayerYears: eligibleGroups.length,
    skippedNotPromotablePlayerYears: skippedNotPromotable.length,
    skippedWarningPlayerYears: skippedWarning.length,
    skippedUnverifiedOcrPlayerYears: 0,
    skippedUnsafePlayerYears: 0,
    promotedPlayerYears: 0,
    skippedExistingPlayerYears: 0,
    productionFilesChanged: 0,
    newProductionFiles: 0,
    promoted: [],
    skippedExisting: [],
    skippedNotPromotable,
    skippedWarning,
    skippedUnverifiedOcr: [],
    skippedUnsafe: [],
    skippedDuplicateEvents: [],
    backups: []
  };

  for (const group of eligibleGroups) {
    const stagedFile = path.join(stagedDir, `${group.playerSlug}-results.json`);
    const productionFile = path.join(productionDir, `${group.playerSlug}-results.json`);

    if (!fs.existsSync(stagedFile)) {
      report.skippedNotPromotable.push({
        player: group.player,
        playerSlug: group.playerSlug,
        year: group.year,
        blockingCount: group.blockingCount,
        warningCount: group.warningCount,
        reason: "Staged player file is missing."
      });
      report.skippedNotPromotablePlayerYears += 1;
      continue;
    }

    if (!stagedCache.has(group.playerSlug)) {
      const stagedPlayer = readJson(stagedFile);
      stagedCache.set(group.playerSlug, {
        player: stagedPlayer,
        byYear: groupStagedEventsByYear(stagedPlayer)
      });
    }

    const staged = stagedCache.get(group.playerSlug);
    const stagedYear = staged.byYear.get(String(group.year));

    if (!stagedYear || !stagedYear.events.length) {
      report.skippedNotPromotable.push({
        player: group.player,
        playerSlug: group.playerSlug,
        year: group.year,
        blockingCount: group.blockingCount,
        warningCount: group.warningCount,
        reason: "No staged events found for this promotable player-year."
      });
      report.skippedNotPromotablePlayerYears += 1;
      continue;
    }

    if (!options.allowUnverifiedOcr && !stagedYear.events.every(isVerifiedEvent)) {
      report.skippedUnverifiedOcr.push({
        player: group.player,
        playerSlug: group.playerSlug,
        year: group.year,
        rowCount: stagedYear.events.length,
        reason: "Skipped because OCR-derived rows have not been manually verified."
      });
      report.skippedUnverifiedOcrPlayerYears += 1;
      continue;
    }

    const unsafeIssues = stagedYear.events.flatMap((event) => {
      return promotionSafetyIssues(event).map((reason) => ({
        reason,
        date: event.date || null,
        tournament: event.tournament || null,
        sourceFile: event.sourceFile || null
      }));
    });

    if (unsafeIssues.length) {
      report.skippedUnsafe.push({
        player: group.player,
        playerSlug: group.playerSlug,
        year: group.year,
        rowCount: stagedYear.events.length,
        reason: unsafeIssues[0].reason,
        issues: unsafeIssues.slice(0, 20)
      });
      report.skippedUnsafePlayerYears += 1;
      continue;
    }

    if (!productionCache.has(group.playerSlug)) {
      const exists = fs.existsSync(productionFile);
      productionCache.set(group.playerSlug, {
        exists,
        file: productionFile,
        data: exists ? readJson(productionFile) : productionTemplate(staged.player)
      });
    }

    const production = productionCache.get(group.playerSlug);
    const existingSeason = production.data.seasons?.[group.year];

    if (existingSeason && !options.replaceExisting) {
      report.skippedExisting.push({
        player: group.player,
        playerSlug: group.playerSlug,
        year: group.year,
        productionFile: path.relative(process.cwd(), production.file).replace(/\\/g, "/"),
        reason: "Production year already exists; default promotion preserves existing production data."
      });
      report.skippedExistingPlayerYears += 1;
      continue;
    }

    if (!production.data.seasons) production.data.seasons = {};

    production.data.seasons[group.year] = {
      source: SOURCE_TAG,
      promotedAt: report.generatedAt,
      events: stagedYear.events
    };

    for (const duplicate of stagedYear.skippedDuplicateEvents) {
      report.skippedDuplicateEvents.push({
        player: group.player,
        playerSlug: group.playerSlug,
        year: group.year,
        ...duplicate
      });
    }

    changedProduction.set(group.playerSlug, production);
    report.promoted.push({
      player: group.player,
      playerSlug: group.playerSlug,
      year: group.year,
      rowCount: stagedYear.events.length,
      reviewCount: group.reviewCount,
      warningCount: group.warningCount,
      productionFile: path.relative(process.cwd(), production.file).replace(/\\/g, "/"),
      newFile: !production.exists
    });
  }

  report.promotedPlayerYears = report.promoted.length;
  report.productionFilesChanged = changedProduction.size;
  report.newProductionFiles = report.promoted.filter((item) => item.newFile).length
    ? Array.from(changedProduction.values()).filter((item) => !item.exists).length
    : 0;

  if (!options.dryRun) {
    for (const production of changedProduction.values()) {
      const backup = backupProductionFile(production.file, backupDir);
      if (backup) {
        report.backups.push(path.relative(process.cwd(), backup).replace(/\\/g, "/"));
      }

      const sortedSeasons = Object.fromEntries(
        Object.entries(production.data.seasons || {})
          .sort(([yearA], [yearB]) => String(yearA).localeCompare(String(yearB)))
      );
      writeJson(production.file, {
        ...production.data,
        seasons: sortedSeasons
      });
    }
  }

  writeJson(reportPath, report);
  fs.writeFileSync(markdownPath, buildMarkdownReport(report));

  return report;
}

function main() {
  const args = parseArgs(process.argv);
  const report = promoteCleanGroups(args);

  console.log("[H2H Promote] Report:");
  console.log(JSON.stringify({
    dryRun: report.dryRun,
    eligiblePlayerYears: report.eligiblePlayerYears,
    promotedPlayerYears: report.promotedPlayerYears,
    skippedExistingPlayerYears: report.skippedExistingPlayerYears,
    skippedNotPromotablePlayerYears: report.skippedNotPromotablePlayerYears,
    skippedWarningPlayerYears: report.skippedWarningPlayerYears,
    skippedUnverifiedOcrPlayerYears: report.skippedUnverifiedOcrPlayerYears,
    skippedUnsafePlayerYears: report.skippedUnsafePlayerYears,
    productionFilesChanged: report.productionFilesChanged,
    newProductionFiles: report.newProductionFiles
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  promoteCleanGroups,
  groupStagedEventsByYear
};
