const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { generateReviewReports, severityForReason } = require("./summarize-h2h-review");

const DEFAULT_ZIP = process.env.H2H_SCREENSHOT_ZIP || "";
const SOURCE_TAG = "manual-screenshot-import";

function parseArgs(argv) {
  const args = {
    input: DEFAULT_ZIP,
    outDir: "manual-data-import",
    limit: null,
    skipOcr: false,
    promote: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--input") {
      args.input = next;
      i += 1;
    } else if (arg === "--out-dir") {
      args.outDir = next;
      i += 1;
    } else if (arg === "--limit") {
      args.limit = Number(next);
      i += 1;
    } else if (arg === "--skip-ocr") {
      args.skipOcr = true;
    } else if (arg === "--promote") {
      args.promote = true;
    } else if (!args.input) {
      args.input = arg;
    }
  }

  if (!args.input) {
    throw new Error("Missing --input path to screenshot zip or extracted folder.");
  }

  return args;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function displayNameFromFolder(folderName) {
  return String(folderName || "").replace(/\s+-\s+Harry Done$/i, "").trim();
}

function parseScreenshotName(fileName, fallbackFolderName) {
  const base = path.basename(fileName, path.extname(fileName));
  const match = base.match(/^(.+?)-(\d{4}(?:-\d{4})?)(?:-(\d+))?$/);
  const playerName = displayNameFromFolder(fallbackFolderName);

  if (!match) {
    return {
      playerName,
      playerSlug: slugify(playerName),
      seasonKey: null,
      imageIndex: null,
      parseError: "Filename does not match expected player-slug-season-index pattern."
    };
  }

  return {
    playerName,
    playerSlug: slugify(playerName) || slugify(match[1]),
    seasonKey: match[2],
    imageIndex: match[3] ? Number(match[3]) : null,
    parseError: null
  };
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractInput(inputPath, outDir) {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Input path does not exist: ${resolved}`);
  }

  if (fs.statSync(resolved).isDirectory()) {
    return resolved;
  }

  if (path.extname(resolved).toLowerCase() !== ".zip") {
    throw new Error(`Input must be a .zip file or directory: ${resolved}`);
  }

  const sourceDir = path.join(outDir, "source");
  ensureCleanDir(sourceDir);

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${psQuote(resolved)} -DestinationPath ${psQuote(sourceDir)} -Force`
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`Could not extract zip: ${result.stderr || result.stdout}`);
  }

  return sourceDir;
}

function walkPngs(dir) {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files.sort((a, b) => a.localeCompare(b));
}

function runOcr(imagePath) {
  const script = path.join(process.cwd(), "scripts", "ocr-winrt.ps1");

  if (!fs.existsSync(script)) {
    return {
      ok: false,
      text: "",
      words: [],
      error: "scripts/ocr-winrt.ps1 was not found."
    };
  }

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, imagePath],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    return {
      ok: false,
      text: result.stdout || "",
      words: [],
      error: result.stderr || `OCR exited with status ${result.status}`
    };
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      text: result.stdout || "",
      words: [],
      error: `OCR returned invalid JSON: ${error.message}`
    };
  }
}

function normalizeDateToken(value) {
  return String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[^0-9.]/g, "");
}

function parseDate(value, expectedSeasonKey) {
  const token = normalizeDateToken(value);
  const expectedYear = String(expectedSeasonKey || "").match(/\d{4}/)?.[0] || "";
  let month = null;
  let day = null;
  let year = null;

  let match = token.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (match) {
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }

  match = token.match(/^(\d{1,2})\.(\d{1,2})(\d{4})$/);

  if (!year && match) {
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }

  match = token.match(/^(\d{2,4})\.(\d{4})$/);

  if (!year && match) {
    const head = match[1];
    year = Number(match[2]);
    month = Number(head.length === 4 ? head.slice(0, 2) : head.slice(0, 1));
    day = Number(head.length === 4 ? head.slice(2) : head.slice(1));
  }

  match = token.match(/^(\d{1,2})\.?(\d{1,2})(\d{4})$/);

  if (!year && match) {
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }

  if (!year || !month || !day) {
    return { iso: null, reason: `Could not parse date token "${value}".` };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, reason: `Parsed invalid date token "${value}".` };
  }

  if (expectedYear && Math.abs(Number(expectedYear) - year) > 1) {
    return { iso: null, reason: `Date year ${year} does not match screenshot season ${expectedSeasonKey}.` };
  }

  return {
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    reason: null
  };
}

function toNumberOrNull(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || text === "-") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function cleanMoney(value) {
  const text = String(value || "").trim();
  if (!text || text === "$-" || text === "-") return null;
  return text.startsWith("$") ? text : null;
}

function columnValue(words, y, minX, maxX, tolerance = 9) {
  const rowWords = words
    .filter((word) => word.x >= minX && word.x < maxX && Math.abs(word.y - y) <= tolerance)
    .sort((a, b) => a.x - b.x)
    .map((word) => word.text);

  return rowWords.join(" ").trim() || null;
}

function tournamentValue(words, y, nextY) {
  const maxY = nextY ? nextY - 5 : y + 44;
  const rowWords = words
    .filter((word) => word.x >= 105 && word.x < 455 && word.y >= y - 5 && word.y < maxY)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .map((word) => word.text);

  return rowWords.join(" ").replace(/\s+/g, " ").trim() || null;
}

function parseEventsFromOcr(ocr, screenshot) {
  const words = Array.isArray(ocr.words) ? ocr.words : [];
  const dateWords = words
    .filter((word) => word.x < 105 && word.y > 145 && /\d/.test(word.text))
    .sort((a, b) => a.y - b.y);

  const events = [];
  const reviews = [];

  for (let index = 0; index < dateWords.length; index += 1) {
    const dateWord = dateWords[index];
    const nextDateWord = dateWords[index + 1];
    const parsedDate = parseDate(dateWord.text, screenshot.seasonKey);
    const y = dateWord.y;
    const tournament = tournamentValue(words, y, nextDateWord?.y);
    const finish = columnValue(words, y, 455, 500, 12);

    const event = {
      date: parsedDate.iso,
      tournament,
      finish,
      r1: toNumberOrNull(columnValue(words, y, 500, 535)),
      r2: toNumberOrNull(columnValue(words, y, 535, 570)),
      r3: toNumberOrNull(columnValue(words, y, 570, 603)),
      r4: toNumberOrNull(columnValue(words, y, 603, 635)),
      total: toNumberOrNull(columnValue(words, y, 635, 685)),
      toPar: columnValue(words, y, 685, 735),
      fedExCupRank: toNumberOrNull(columnValue(words, y, 735, 790)),
      fedExCupPoints: toNumberOrNull(columnValue(words, y, 790, 835)),
      earnings: cleanMoney(columnValue(words, y, 930, 1040, 12))
    };

    const reasons = [];

    if (!parsedDate.iso) reasons.push(parsedDate.reason);
    if (!tournament) reasons.push("Missing tournament name from OCR row.");
    if (!finish) reasons.push("Missing finish/position from OCR row.");
    if (dateWord.text !== String(parsedDate.iso || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2.$3.$1").replace(/^0/, "").replace(".0", ".")) {
      reasons.push(`Date OCR token was normalized from "${dateWord.text}".`);
    }

    const severity = reasons.length
      ? severityForReason(reasons.filter(Boolean).join(" "))
      : null;

    if (reasons.length) {
      reviews.push({
        playerName: screenshot.playerName,
        playerSlug: screenshot.playerSlug,
        sourceScreenshot: screenshot.relativePath,
        severity,
        reason: reasons.filter(Boolean).join(" "),
        partialData: event,
        partialText: ocr.text || ""
      });
    }

    events.push({
      ...event,
      needsReview: reasons.length > 0,
      reviewSeverity: severity,
      sourceFile: screenshot.relativePath
    });
  }

  if (!dateWords.length) {
    reviews.push({
      playerName: screenshot.playerName,
      playerSlug: screenshot.playerSlug,
      sourceScreenshot: screenshot.relativePath,
      severity: "blocking",
      reason: "No date rows were detected by OCR.",
      partialText: ocr.text || ""
    });
  }

  return { events, reviews };
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function buildPlayerFiles(playerMap, outDir, importedAt) {
  const stagedDir = path.join(outDir, "staged");

  for (const player of playerMap.values()) {
    const seasons = {};

    for (const event of player.events) {
      const seasonKey = event.seasonKey;
      if (!seasons[seasonKey]) seasons[seasonKey] = { events: [] };

      const { seasonKey: _seasonKey, ...cleanEvent } = event;
      seasons[seasonKey].events.push(cleanEvent);
    }

    for (const season of Object.values(seasons)) {
      season.events.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    }

    const output = {
      player: player.playerName,
      slug: player.playerSlug,
      source: SOURCE_TAG,
      importMetadata: {
        importedAt,
        sourceFiles: Array.from(player.sourceFiles).sort(),
        screenshotsProcessed: player.screenshotsProcessed,
        needsReview: player.reviewCount
      },
      seasons
    };

    writeJson(path.join(stagedDir, `${player.playerSlug}-results.json`), output);
  }
}

function promoteValidatedPlayers(playerMap, outDir) {
  const backupDir = path.join(outDir, "backups");
  const manualDir = path.join(process.cwd(), "data", "h2h", "manual");
  let promoted = 0;

  for (const player of playerMap.values()) {
    if (player.reviewCount > 0) continue;

    const stagedPath = path.join(outDir, "staged", `${player.playerSlug}-results.json`);
    const productionPath = path.join(manualDir, `${player.playerSlug}-results.json`);

    if (fs.existsSync(productionPath)) {
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(productionPath, path.join(backupDir, `${player.playerSlug}-results.json`));
    }

    fs.copyFileSync(stagedPath, productionPath);
    promoted += 1;
  }

  return promoted;
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  ensureCleanDir(path.join(outDir, "staged"));

  const sourceDir = extractInput(args.input, outDir);
  const screenshots = walkPngs(sourceDir).slice(0, args.limit || undefined);
  const importedAt = new Date().toISOString();
  const playerMap = new Map();
  const reviewNeeded = [];

  screenshots.forEach((file, index) => {
    const relativePath = path.relative(sourceDir, file).replace(/\\/g, "/");
    const parts = relativePath.split("/");
    const folderName = parts.length > 1 ? parts[parts.length - 2] : "";
    const screenshot = {
      ...parseScreenshotName(path.basename(file), folderName),
      relativePath
    };

    console.log(`[H2H Import] ${index + 1}/${screenshots.length} ${relativePath}`);

    if (!playerMap.has(screenshot.playerSlug)) {
      playerMap.set(screenshot.playerSlug, {
        playerName: screenshot.playerName,
        playerSlug: screenshot.playerSlug,
        sourceFiles: new Set(),
        screenshotsProcessed: 0,
        reviewCount: 0,
        events: []
      });
    }

    const player = playerMap.get(screenshot.playerSlug);
    player.sourceFiles.add(relativePath);
    player.screenshotsProcessed += 1;

    if (screenshot.parseError) {
      const item = {
        playerName: screenshot.playerName,
        playerSlug: screenshot.playerSlug,
        sourceScreenshot: relativePath,
        severity: "blocking",
        reason: screenshot.parseError
      };
      reviewNeeded.push(item);
      player.reviewCount += 1;
      return;
    }

    const ocr = args.skipOcr
      ? { ok: false, text: "", words: [], error: "OCR skipped by --skip-ocr." }
      : runOcr(file);

    if (!ocr.ok) {
      const item = {
        playerName: screenshot.playerName,
        playerSlug: screenshot.playerSlug,
        sourceScreenshot: relativePath,
        severity: "blocking",
        reason: ocr.error || "OCR failed.",
        partialExtractedText: ocr.text || ""
      };
      reviewNeeded.push(item);
      player.reviewCount += 1;
      return;
    }

    const parsed = parseEventsFromOcr(ocr, screenshot);

    parsed.events.forEach((event) => {
      player.events.push({
        ...event,
        seasonKey: screenshot.seasonKey
      });
    });

    parsed.reviews.forEach((item) => {
      reviewNeeded.push(item);
      player.reviewCount += 1;
    });
  });

  buildPlayerFiles(playerMap, outDir, importedAt);
  writeJson(path.join(outDir, "review-needed.json"), reviewNeeded);

  const manifest = {
    importedAt,
    input: path.resolve(args.input),
    sourceDir,
    screenshotsProcessed: screenshots.length,
    playersProcessed: playerMap.size,
    stagedFiles: playerMap.size,
    reviewNeeded: reviewNeeded.length,
    promotedFiles: args.promote ? promoteValidatedPlayers(playerMap, outDir) : 0,
    productionWriteMode: args.promote ? "validated players only" : "staging only"
  };

  writeJson(path.join(outDir, "manifest.json"), manifest);
  generateReviewReports(outDir);
  console.log("[H2H Import] Manifest:");
  console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  parseDate,
  parseScreenshotName,
  slugify
};
