const fs = require("fs");
const path = require("path");

const { validateFile } = require("./validate-h2h-manual-data");
const { runSanityCheck } = require("./sanity-check-h2h-manual-data");

function parseArgs(argv) {
  const args = {
    dryRun: false,
    importDir: "manual-data-import",
    productionDir: path.join("data", "h2h", "manual")
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--dry-run") {
      args.dryRun = true;
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

function relative(file) {
  return path.relative(process.cwd(), file).replace(/\\/g, "/");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function collectStagedFiles(stagedDir) {
  if (!fs.existsSync(stagedDir)) return [];

  return fs.readdirSync(stagedDir)
    .filter((file) => file.endsWith("-results.json"))
    .sort()
    .map((file) => path.join(stagedDir, file));
}

function countData(data) {
  const seasonEntries = Object.entries(data.seasons || {});
  const eventRows = seasonEntries.reduce((sum, [, season]) => {
    return sum + (Array.isArray(season.events) ? season.events.length : 0);
  }, 0);

  return {
    seasons: seasonEntries.length,
    eventRows
  };
}

function backupProductionDirectory(productionDir, importDir, generatedAt) {
  const backupDir = path.join(importDir, "backups", `manual-production-${generatedAt}`);

  fs.mkdirSync(path.dirname(backupDir), { recursive: true });

  if (fs.existsSync(productionDir)) {
    fs.cpSync(productionDir, backupDir, { recursive: true });
  } else {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  return backupDir;
}

function buildMarkdownReport(report) {
  const lines = [
    "# Manual H2H Promotion Report",
    "",
    "## Summary",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Mode: ${report.dryRun ? "dry run" : "write"}`,
    `- Staged files checked: ${report.stagedFilesChecked}`,
    `- Player files promoted: ${report.playerFilesPromoted}`,
    `- Seasons promoted: ${report.seasonsPromoted}`,
    `- Event rows promoted: ${report.eventRowsPromoted}`,
    `- Player files skipped: ${report.playerFilesSkipped}`,
    `- Production files replaced: ${report.productionFilesReplaced}`,
    `- New production files: ${report.newProductionFiles}`,
    `- Existing production files preserved because no staged replacement exists: ${report.existingProductionFilesPreserved}`,
    `- Backup location: ${report.backupLocation || (report.dryRun ? "not created during dry run" : "none")}`,
    "",
    "## Promoted Files",
    "",
    "| Player | Slug | Seasons | Event rows | Action | Production file |",
    "| --- | --- | ---: | ---: | --- | --- |"
  ];

  for (const item of report.promoted) {
    lines.push(`| ${item.player} | ${item.slug} | ${item.seasons} | ${item.eventRows} | ${item.action} | ${item.productionFile} |`);
  }

  lines.push("");
  lines.push("## Skipped Files");
  lines.push("");
  lines.push("| Staged file | Reason |");
  lines.push("| --- | --- |");

  for (const item of report.skipped) {
    lines.push(`| ${item.stagedFile} | ${item.reason} |`);
  }

  lines.push("");
  lines.push("## Replaced Production Files");
  lines.push("");
  lines.push("| Production file | Backup |");
  lines.push("| --- | --- |");

  for (const item of report.replaced) {
    lines.push(`| ${item.productionFile} | ${report.backupLocation || "dry run only"} |`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function promoteStagedManualData(options) {
  const importDir = path.resolve(options.importDir);
  const stagedDir = path.join(importDir, "staged");
  const productionDir = path.resolve(options.productionDir);
  const generatedAt = timestamp();
  const stagedFiles = collectStagedFiles(stagedDir);
  const productionFilesBefore = fs.existsSync(productionDir)
    ? fs.readdirSync(productionDir).filter((file) => file.endsWith("-results.json"))
    : [];
  const stagedBasenames = new Set(stagedFiles.map((file) => path.basename(file)));
  const backupDir = options.dryRun
    ? null
    : backupProductionDirectory(productionDir, importDir, generatedAt);

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    importDir: relative(importDir),
    stagedDir: relative(stagedDir),
    productionDir: relative(productionDir),
    backupLocation: backupDir ? relative(backupDir) : null,
    stagedFilesChecked: stagedFiles.length,
    playerFilesPromoted: 0,
    seasonsPromoted: 0,
    eventRowsPromoted: 0,
    playerFilesSkipped: 0,
    productionFilesReplaced: 0,
    newProductionFiles: 0,
    existingProductionFilesPreserved: productionFilesBefore.filter((file) => !stagedBasenames.has(file)).length,
    promoted: [],
    skipped: [],
    replaced: [],
    preservedProductionFiles: productionFilesBefore
      .filter((file) => !stagedBasenames.has(file))
      .sort()
      .map((file) => relative(path.join(productionDir, file)))
  };

  for (const stagedFile of stagedFiles) {
    const validationErrors = validateFile(stagedFile);

    if (validationErrors.length) {
      report.skipped.push({
        stagedFile: relative(stagedFile),
        reason: "Hard schema validation failed.",
        errors: validationErrors
      });
      report.playerFilesSkipped += 1;
      continue;
    }

    const data = readJson(stagedFile);
    const counts = countData(data);
    const productionFile = path.join(productionDir, path.basename(stagedFile));
    const existed = fs.existsSync(productionFile);

    report.promoted.push({
      player: data.player,
      slug: data.slug || path.basename(stagedFile).replace(/-results\.json$/, ""),
      seasons: counts.seasons,
      eventRows: counts.eventRows,
      action: existed ? "replace existing production file" : "add new production file",
      productionFile: relative(productionFile),
      stagedFile: relative(stagedFile)
    });

    if (existed) {
      report.replaced.push({
        productionFile: relative(productionFile),
        stagedFile: relative(stagedFile)
      });
      report.productionFilesReplaced += 1;
    } else {
      report.newProductionFiles += 1;
    }

    report.playerFilesPromoted += 1;
    report.seasonsPromoted += counts.seasons;
    report.eventRowsPromoted += counts.eventRows;

    if (!options.dryRun) {
      fs.mkdirSync(productionDir, { recursive: true });
      fs.copyFileSync(stagedFile, productionFile);
    }
  }

  if (!options.dryRun) {
    const sanityReport = runSanityCheck({
      dataDir: productionDir,
      reportDir: importDir
    });

    report.sanityReport = {
      path: relative(path.join(importDir, "sanity-report.json")),
      warningCount: sanityReport.warningCount,
      topWarningTypes: sanityReport.topWarningTypes.slice(0, 10)
    };
  }

  writeJson(path.join(importDir, "promotion-report.json"), report);
  fs.writeFileSync(path.join(importDir, "promotion-report.md"), buildMarkdownReport(report));

  return report;
}

function main() {
  const args = parseArgs(process.argv);
  const report = promoteStagedManualData(args);

  console.log("[H2H Promote] Report:");
  console.log(JSON.stringify({
    dryRun: report.dryRun,
    playerFilesPromoted: report.playerFilesPromoted,
    seasonsPromoted: report.seasonsPromoted,
    eventRowsPromoted: report.eventRowsPromoted,
    playerFilesSkipped: report.playerFilesSkipped,
    productionFilesReplaced: report.productionFilesReplaced,
    newProductionFiles: report.newProductionFiles,
    backupLocation: report.backupLocation,
    sanityWarnings: report.sanityReport?.warningCount ?? null
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  promoteStagedManualData
};
