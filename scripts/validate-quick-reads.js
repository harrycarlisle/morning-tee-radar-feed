const fs = require("fs");
const { quickReadLooksWeak: looksWeak } = require("../lib/quick-read-quality");

const RADAR_PATH = process.argv[2] || "latest-radar.json";

const SECTIONS = [
  "homepageFeatures",
  "today",
  "alsoMoving",
  "weekRadar",
  "golfInternet",
  "checking"
];

const TEXT_FIELDS = [
  "quickRead",
  "quickContext",
  "modalSummary",
  "summary",
  "description",
  "excerpt"
];

function getSectionItems(radarJson, section) {
  const value = radarJson[section];

  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      section,
      index,
      item
    }));
  }

  if (value && typeof value === "object") {
    return [{
      section,
      index: 0,
      item: value
    }];
  }

  return [];
}

function analyzeItem(entry) {
  const selectedField = TEXT_FIELDS.find((field) => String(entry.item?.[field] || "").trim()) || "";
  const usefulField = TEXT_FIELDS.find((field) => !looksWeak(entry.item?.[field], entry.item)) || "";
  const quickReadPresent = Boolean(String(entry.item?.quickRead || "").trim());
  const quickReadWeak = looksWeak(entry.item?.quickRead, entry.item);
  const selectedText = selectedField ? String(entry.item[selectedField] || "") : "";

  return {
    section: entry.section,
    index: entry.index,
    title: entry.item?.title || entry.item?.headline || "",
    source: entry.item?.source || entry.item?.sourceName || "",
    selectedField,
    selectedWeak: selectedField ? looksWeak(selectedText, entry.item) : true,
    usefulField,
    quickReadPresent,
    quickReadWeak,
    preview: selectedText.replace(/\s+/g, " ").slice(0, 180)
  };
}

function main() {
  const radarJson = JSON.parse(fs.readFileSync(RADAR_PATH, "utf8"));
  const rows = SECTIONS
    .flatMap((section) => getSectionItems(radarJson, section))
    .map(analyzeItem);

  const report = {
    file: RADAR_PATH,
    updatedAt: radarJson.updatedAt || radarJson.generatedAt || "",
    totalItemsChecked: rows.length,
    strongQuickReadCount: rows.filter((row) => row.quickReadPresent && !row.quickReadWeak).length,
    missingQuickReadCount: rows.filter((row) => !row.quickReadPresent).length,
    weakQuickReadCount: rows.filter((row) => row.quickReadPresent && row.quickReadWeak).length,
    weakSelectedTextCount: rows.filter((row) => row.selectedWeak).length,
    usefulFallbackWithoutQuickReadCount: rows.filter((row) => (!row.quickReadPresent || row.quickReadWeak) && row.usefulField && row.usefulField !== "quickRead").length,
    weakSelectedTextItems: rows
      .filter((row) => row.selectedWeak)
      .map((row) => ({
        section: row.section,
        index: row.index,
        title: row.title,
        selectedField: row.selectedField || null,
        usefulField: row.usefulField || null,
        preview: row.preview
      }))
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.weakSelectedTextCount > 0) {
    process.exitCode = 1;
  }
}

main();
