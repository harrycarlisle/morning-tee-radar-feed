const TOUR_CATEGORIES = new Set(["PGA TOUR", "LPGA", "LIV", "DP TOUR", "JAPAN TOUR", "GOLF"]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[\u2010-\u2015-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Match whole tour names, never the "pga tour" inside "lpga tour" or "liv" in "live".
const TOUR_PATTERNS = [
  ["LPGA", /\blpga\b/],
  ["PGA TOUR", /\bpga tour\b(?! (?:champions|americas|of australasia)\b)/],
  ["LIV", /\bliv\b/],
  ["DP TOUR", /\b(?:dp world(?: tour)?|dp tour|european tour)\b/],
  ["JAPAN TOUR", /\b(?:japan (?:golf )?tour|jgto)\b/]
];
const OTHER_TOURS = /\b(?:pga tour (?:champions|americas|of australasia)|korn ferry(?: tour)?|ladies european tour|asian tour|epson tour|jlpga|klpga)\b/g;
const LPGA_EVENTS = /\b(?:maybank (?:championship|classic)|women'?s pga championship|(?:u\.?\s*s\.?\s+)?women'?s open|women'?s u\.?\s*s\.?\s+open|evian championship|chevron championship)\b/g;
const PGA_EVENTS = /\b(?:pga championship|cj cup|byron nelson|colonial|charles schwab|truist|masters|u\.?\s*s\.?\s+open|the open|players championship)\b/;

function tourMatches(value, includeEvents = true) {
  let text = normalize(value);
  const matches = new Set();

  // Mask more specific names before testing overlapping names (e.g. European Tour).
  text = text.replace(OTHER_TOURS, () => { matches.add("GOLF"); return " "; });
  if (includeEvents) {
    text = text.replace(LPGA_EVENTS, () => { matches.add("LPGA"); return " "; });
  }
  for (const [category, pattern] of TOUR_PATTERNS) {
    if (pattern.test(text)) matches.add(category);
  }
  if (includeEvents && PGA_EVENTS.test(text)) matches.add("PGA TOUR");
  return matches;
}

function resolvedCategory(matches) {
  return matches.size === 1 ? [...matches][0] : matches.size > 1 ? "GOLF" : null;
}

function metadataText(value) {
  return typeof value === "string" ? value : value && typeof value.name === "string" ? value.name : "";
}

function tourMetadata(item) {
  return [item.tour, item.tourName, item.tournament?.tour, item.tournament?.tourName,
    item.competition?.tour, item.competition?.tourName].map(metadataText).filter(Boolean).join(" ");
}

function competitionText(item) {
  return [metadataText(item.tournament), item.tournamentName, metadataText(item.competition)]
    .filter(Boolean).join(" ");
}

function isLeaderboard(item) {
  return normalize(item.sourceType || item.signal) === "leaderboard" ||
    normalize(item.status) === "live" || Array.isArray(item.leaders);
}

function inferTourCategory(item) {
  const metadata = tourMetadata(item);
  // Explicit but unsupported tour metadata is unknown, not a reason to guess from a player.
  if (metadata) return resolvedCategory(tourMatches(metadata, false)) || "GOLF";

  // A named competition beats a player's affiliation. A clear headline beats background
  // mentions in the summary or publisher name; multiple tours in the same tier stay GOLF.
  for (const value of [competitionText(item), item.title, item.summary]) {
    const category = resolvedCategory(tourMatches(value));
    if (category) return category;
  }
  return resolvedCategory(tourMatches(item.sourceName || item.source, false));
}

function inferCategory(item = {}) {
  const text = normalize(`${item.title || ""} ${item.summary || ""} ${item.sourceName || item.source || ""}`);
  if (normalize(item.sourceType || item.signal) === "reddit") return "GOLF INTERNET";

  // Preserve non-tour editorial categories for stories.
  if (!isLeaderboard(item)) {
    if (["ncaa", "college golf", "men's golf championship", "mens golf championship",
      "women's golf championship", "womens golf championship"].some((term) => text.includes(term))) return "NCAA";
    if (["youtube", "rick shiels", "bob does sports", "grant horvat"].some((term) => text.includes(term))) return "YOUTUBE";
  }

  const tour = inferTourCategory(item);
  if (tour) return tour;
  if (isLeaderboard(item)) return "GOLF";

  // Retain existing editorial player fallbacks only when no competition is identified.
  if (/\b(?:rory|scheffler|brooks koepka)\b/.test(text)) return "PGA TOUR";
  if (/\bnelly korda\b/.test(text)) return "LPGA";
  return "GOLF";
}

function repairPublishedCategories(feed) {
  let corrections = 0;
  const repair = (item) => {
    if (!item || !TOUR_CATEGORIES.has(item.category) ||
        normalize(item.sourceType || item.signal) === "reddit") return item;

    let category;
    if (isLeaderboard(item) || tourMetadata(item)) {
      category = inferTourCategory(item) || "GOLF";
    } else {
      // Repair the demonstrated LPGA/PGA substring error, leaving other existing
      // editorial labels alone. Published summaries/headlines may be truncated.
      if (item.category !== "PGA TOUR") return item;
      const matches = tourMatches([competitionText(item), item.title, item.summary,
        item.quickRead, item.quickContext, item.modalSummary, item.sourceName || item.source]
        .filter(Boolean).join(" "));
      category = matches.size === 1 && matches.has("LPGA") ? "LPGA" : null;
    }
    if (!category || category === item.category) return item;
    corrections += 1;
    return { ...item, category };
  };

  const json = { ...feed };
  for (const section of ["homepageFeatures", "today", "alsoMoving", "weekRadar", "week_radar",
    "golfInternet", "checking", "liveLeaderboards", "liveLeaderboard", "stories"]) {
    if (Array.isArray(feed[section])) json[section] = feed[section].map(repair);
    else if (feed[section] && typeof feed[section] === "object") json[section] = repair(feed[section]);
  }
  return { json, corrections };
}

module.exports = { inferCategory, repairPublishedCategories };
