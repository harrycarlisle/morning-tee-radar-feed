const fs = require("fs");

const latestPath = process.argv[2] || "latest-radar.json";
const archivePath = process.argv[3] || "archive-radar.json";

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getTimestamp(item) {
  const value = item.timestamp || item.approvedAt || item.updatedAt || item.publishedAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function getTitle(item) {
  return item.title || item.headline || item.label || "(untitled)";
}

function getCategory(item) {
  return String(item.category || item.label || item.signal || "").toUpperCase();
}

function isGolfInternet(item) {
  const source = String(item.source || item.sourceName || "").toLowerCase();
  const signal = String(item.signal || "").toLowerCase();
  return getCategory(item).includes("GOLF INTERNET") ||
    getCategory(item).includes("VIRAL") ||
    source.includes("r/golf") ||
    signal.includes("reddit");
}

function getArchiveStories(archiveData) {
  if (Array.isArray(archiveData)) return archiveData;
  return asArray(archiveData.stories);
}

function getStoryPool(latestData, archiveData) {
  const sections = [
    ["today", latestData.today],
    ["weekRadar", latestData.weekRadar],
    ["alsoMoving", latestData.alsoMoving],
    ["golfInternet", latestData.golfInternet],
    ["archive", getArchiveStories(archiveData)]
  ];

  const seen = new Set();
  const stories = [];

  for (const [section, items] of sections) {
    for (const item of asArray(items)) {
      if (!item) continue;
      const key = String(item.url || item.sourceUrl || getTitle(item)).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      stories.push({ ...item, sourceSection: section });
    }
  }

  return stories;
}

function sectionBaseScore(section) {
  if (section === "today") return 500;
  if (section === "alsoMoving") return 430;
  if (section === "weekRadar") return 410;
  if (section === "archive") return 180;
  if (section === "golfInternet") return 90;
  return 200;
}

function getQualityScore(item) {
  const reasons = [];
  let score = sectionBaseScore(item.sourceSection);

  if (item.sourceSection !== "golfInternet") {
    reasons.push(item.sourceSection);
  }

  if (Number.isFinite(Number(item.score))) {
    score += Number(item.score) / 10;
    reasons.push(`score ${item.score}`);
  }

  if (Number.isFinite(Number(item.interestScore))) {
    score += Number(item.interestScore) / 2;
    reasons.push(`interest ${item.interestScore}`);
  }

  if (Number.isFinite(Number(item.searchPriority))) {
    score += Number(item.searchPriority);
    reasons.push(`searchPriority ${item.searchPriority}`);
  }

  if (Number.isFinite(Number(item.displayPriority))) {
    score += Number(item.displayPriority) / 2;
    reasons.push(`displayPriority ${item.displayPriority}`);
  }

  if (isGolfInternet(item) && item.searchTopSlotEligible !== true) {
    score -= 450;
    reasons.push("light Golf Internet");
  }

  const ageHours = (Date.now() - getTimestamp(item)) / 36e5;
  if (Number.isFinite(ageHours) && ageHours >= 0) {
    score += Math.max(0, 24 - ageHours);
  }

  return {
    score,
    reason: reasons.join("; ") || "default ranking"
  };
}

function formatStory(item, index, mode) {
  const quality = getQualityScore(item);
  const iso = getTimestamp(item) ? new Date(getTimestamp(item)).toISOString() : "no timestamp";
  const flags = [
    item.sourceSection,
    item.source || item.sourceName || "unknown source",
    getCategory(item) || "uncategorized"
  ].join(" | ");
  const scoreText = mode === "quality" ? ` | quality ${Math.round(quality.score)} | ${quality.reason}` : "";
  return `${String(index + 1).padStart(2, " ")}. ${getTitle(item)} | ${flags} | ${iso}${scoreText}`;
}

const latestData = readJson(latestPath, {});
const archiveData = readJson(archivePath, {});
const stories = getStoryPool(latestData, archiveData);

const currentTop = [...stories]
  .sort((a, b) => getTimestamp(b) - getTimestamp(a))
  .slice(0, 10);

const qualityTop = [...stories]
  .sort((a, b) => {
    const scoreDelta = getQualityScore(b).score - getQualityScore(a).score;
    return scoreDelta || getTimestamp(b) - getTimestamp(a);
  })
  .slice(0, 10);

console.log("Current search-style top 10 (recency only):");
currentTop.forEach((item, index) => console.log(formatStory(item, index, "recency")));

console.log("");
console.log("Recommended top 10 (quality-aware):");
qualityTop.forEach((item, index) => console.log(formatStory(item, index, "quality")));
