const fs = require("fs");

const latestPath = process.argv[2] || "latest-radar.json";
const archivePath = process.argv[3] || "archive-radar.json";

const PLACEHOLDER_PATTERNS = [
  /golf-placeholder/i,
  /lpga-placeholder/i,
  /ncaa-golf-placeholder/i,
  /golf-placeholder-image/i
];

const PLAYER_IMAGE_PATTERNS = [
  /rory-mcil/i,
  /tiger-woods/i,
  /jordan-spieth/i,
  /scottie-scheffler/i,
  /bryson-dechambeau/i,
  /jon-rahm/i,
  /brooks-koepka/i,
  /nelly-korda/i,
  /phil-mickelson/i,
  /matt-fitzpatrick/i
];

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getStoryPool(latestData, archiveData) {
  const sections = [
    latestData.today,
    latestData.weekRadar,
    latestData.alsoMoving,
    latestData.golfInternet,
    latestData.homepageFeatures,
    Array.isArray(archiveData) ? archiveData : archiveData.stories
  ];

  const seen = new Set();
  const stories = [];

  for (const items of sections) {
    for (const item of asArray(items)) {
      if (!item) continue;
      const key = String(item.url || item.sourceUrl || item.title || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      stories.push(item);
    }
  }

  return stories;
}

function isPlaceholderImage(image) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(String(image || "")));
}

function isPlayerImage(image) {
  return PLAYER_IMAGE_PATTERNS.some((pattern) => pattern.test(String(image || "")));
}

function recommendedAlt(item) {
  const image = item.image || "";
  if (!image) return { status: "no-image", alt: null };
  if (item.imageAlt !== undefined) {
    return { status: "explicit", alt: item.imageAlt };
  }
  if (isPlaceholderImage(image)) {
    return { status: "decorative-placeholder", alt: "" };
  }
  if (isPlayerImage(image)) {
    const matched = PLAYER_IMAGE_PATTERNS.find((pattern) => pattern.test(image));
    const slug = matched ? String(matched).replace(/[^\w\s]/g, " ").trim() : "Golfer";
    return { status: "player-photo", alt: slug };
  }
  return { status: "needs-review", alt: null };
}

const latestData = readJson(latestPath, {});
const archiveData = readJson(archivePath, {});
const stories = getStoryPool(latestData, archiveData);

const missingImage = [];
const decorativeCandidates = [];
const duplicateTitleRisk = [];
const explicitAlt = [];

for (const item of stories) {
  const title = item.title || item.headline || "(untitled)";
  const image = item.image || "";
  const rec = recommendedAlt(item);

  if (!image) {
    missingImage.push(title);
    continue;
  }

  if (rec.status === "decorative-placeholder") {
    decorativeCandidates.push({ title, image });
  }

  if (rec.status === "explicit") {
    explicitAlt.push({ title, alt: rec.alt });
  }

  if (rec.status !== "decorative-placeholder" && title) {
    duplicateTitleRisk.push({ title, image, recommendedAlt: rec.alt });
  }
}

console.log("Morning Tee feed accessibility audit");
console.log(`Stories checked: ${stories.length}`);
console.log(`Missing image URL: ${missingImage.length}`);
console.log(`Decorative placeholder images (should use alt=\"\"): ${decorativeCandidates.length}`);
console.log(`Stories with explicit imageAlt in feed: ${explicitAlt.length}`);
console.log(`Stories where UI currently risks duplicating headline in image alt: ${duplicateTitleRisk.length}`);

if (decorativeCandidates.length) {
  console.log("\nDecorative placeholder examples:");
  decorativeCandidates.slice(0, 8).forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.title}`);
  });
}

if (missingImage.length) {
  console.log("\nMissing image examples:");
  missingImage.slice(0, 8).forEach((title, index) => console.log(`${index + 1}. ${title}`));
}

const exitCode = missingImage.length ? 1 : 0;
process.exit(exitCode);
