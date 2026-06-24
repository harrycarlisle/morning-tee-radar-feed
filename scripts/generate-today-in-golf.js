const fs = require("fs");

const RADAR_PATH = "latest-radar.json";
const TODAY_PATH = "today-in-golf.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MANUAL_EDITION = process.env.MANUAL_EDITION || "auto";
const FORCE_RUN = process.env.FORCE_RUN === "true";
const DRY_RUN_EDITION_LABELS = process.env.DRY_RUN_EDITION_LABELS === "true";

const TODAY_IN_GOLF_TITLE = "Today In Golf";
const TODAY_IN_GOLF_SUMMARY = "A 30-second briefing on today's biggest golf stories.";
const TODAY_IN_GOLF_CTA = "See all stories ->";

function normalizeDisplayText(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2013\u2014]/g, "-");
}

function readJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function getETParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value || "";

  const rawHour = Number(get("hour"));
  const normalizedHour = rawHour === 24 ? 0 : rawHour;

  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: normalizedHour,
    minute: Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`
  };
}

function isValidEdition(value) {
  return value === "morning" || value === "midday" || value === "evening";
}

function getCurrentWindowEdition(date = new Date()) {
  const et = getETParts(date);

  if (et.hour >= 8 && et.hour < 12) return "morning";
  if (et.hour >= 12 && et.hour < 20) return "midday";
  if (et.hour >= 20 && et.hour < 24) return "evening";

  return null;
}

function getMostRecentEligibleEdition(date = new Date()) {
  const et = getETParts(date);

  if (et.hour >= 20) return "evening";
  if (et.hour >= 12) return "midday";
  if (et.hour >= 8) return "morning";

  // Before 8 AM ET, do not generate a future edition automatically.
  return null;
}

function getEditionNow(currentTodayJson = null, date = new Date()) {
  if (isValidEdition(MANUAL_EDITION)) {
    return MANUAL_EDITION;
  }

  const windowEdition = getCurrentWindowEdition(date);

  if (!windowEdition) {
    return null;
  }

  if (!hasAlreadyRun(currentTodayJson, windowEdition, date)) {
    return windowEdition;
  }

  return null;
}

function getLabel(edition) {
  if (edition === "morning") return "Updated at 8 a.m. ET";
  if (edition === "midday") return "Updated at 12 p.m. ET";
  return "Updated at 8 p.m. ET";
}

function getItemTimestamp(item) {
  const possibleValues = [
    item?.approvedAt,
    item?.approved_at,
    item?.timestamp,
    item?.createdAt,
    item?.created_at,
    item?.publishedAt,
    item?.published_at,
    item?.updatedAt,
    item?.updated_at,
    item?.date,
    item?.isoDate
  ];

  for (const value of possibleValues) {
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "number") {
      return value < 10000000000 ? value * 1000 : value;
    }

    if (typeof value === "string") {
      const numeric = Number(value);

      if (!Number.isNaN(numeric) && value.trim() !== "") {
        return numeric < 10000000000 ? numeric * 1000 : numeric;
      }

      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

function getStoryText(item) {
  return [
    item?.title,
    item?.summary,
    item?.quickRead,
    item?.quickContext,
    item?.modalSummary,
    item?.label,
    item?.category,
    item?.signal,
    item?.source,
    item?.sourceName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isTournamentFinalSafe(item) {
  const nowET = getETParts();
  const weekday = nowET.weekday;

  const status = String(item?.status || "").toLowerCase();
  const signal = String(item?.signal || "").toLowerCase();
  const resultType = String(item?.resultType || "").toLowerCase();
  const title = String(item?.title || "").toLowerCase();
  const summary = String(item?.summary || "").toLowerCase();
  const quickRead = String(item?.quickRead || "").toLowerCase();
  const text = `${status} ${signal} ${resultType} ${title} ${summary} ${quickRead}`;

  const isSundayOrMonday = weekday === "Sun" || weekday === "Mon";

  const explicitlyFinal =
    status === "final" ||
    status === "complete" ||
    status === "completed" ||
    signal.includes("final result") ||
    signal.includes("final leaderboard") ||
    text.includes("final result") ||
    text.includes("final leaderboard") ||
    text.includes("tournament is complete") ||
    text.includes("event is complete") ||
    text.includes("official final") ||
    text.includes("completed final round");

  const mondayRecapSignal =
    weekday === "Mon" &&
    (
      text.includes("on sunday") ||
      text.includes("sunday at") ||
      text.includes("final round") ||
      text.includes("closed with") ||
      text.includes("held off") ||
      text.includes("finished at") ||
      text.includes("victory")
    );

  return isSundayOrMonday && (explicitlyFinal || mondayRecapSignal);
}

function removeUnsafeWinnerLanguage(value, item) {
  let text = String(value || "");

  if (isTournamentFinalSafe(item)) return text;

return text
    .replace(/\bwins\b/gi, "leads")
    .replace(/\bwon\b/gi, "leads")
    .replace(/\bwinner\b/gi, "leader")
    .replace(/\bchampion\b/gi, "leader")
    .replace(/\bcaptured\b/gi, "leads")
    .replace(/\bsecured victory\b/gi, "moved into position")
    .replace(/\bsecured the victory\b/gi, "moved into position")
    .replace(/\bclaimed victory\b/gi, "moved into position")
    .replace(/\bclaimed the title\b/gi, "moved into the lead")
    .replace(/\bclaims the title\b/gi, "moves into the lead")
    .replace(/\bfinishing five strokes ahead\b/gi, "sitting five strokes ahead")
    .replace(/\bfinishing five shots clear\b/gi, "sitting five shots clear")
    .replace(/\bfinished five strokes ahead\b/gi, "sits five strokes ahead")
    .replace(/\bfinished five shots clear\b/gi, "sits five shots clear");
}

function isBadStory(item) {
  if (!item || !item.title) return true;

  const text = getStoryText(item);

  const blockedPatterns = [
    /\bprovided data\b/i,
    /\bprovided leaderboard\b/i,
    /\bconflicting\b/i,
    /\bconflict\b/i,
    /\bmismatch\b/i,
    /\bincorrect\b/i,
    /\bnot the winner\b/i,
    /\bdid not win\b/i,
    /\bdidn't win\b/i,
    /\bneeds review\b/i,
    /\bneeds_review\b/i,
    /\binvalid\b/i,
    /\bblocked\b/i,
    /\bhot dog\b/i,
    /\br\/golf\b/i,
    /\breddit\b/i,
    /\bmeme\b/i,
    /\bviral joke\b/i,
    /\bbunker debate\b/i,
    /\bbiggest bunker\b/i,
    /\bsand area\b/i,
    /\bwaste area\b/i,
    /\bgolf internet\b/i
  ];

  return blockedPatterns.some((pattern) => pattern.test(text));
}

function normalizeStoryKey(item) {
  const url = String(item?.sourceUrl || item?.url || "").trim().toLowerCase();
  const tournament = String(item?.tournament || "").trim().toLowerCase();
  const category = String(item?.category || item?.label || item?.signal || "").trim().toLowerCase();
  const title = String(item?.title || "").trim().toLowerCase();

  if (tournament) return `tournament:${tournament}`;
  if (url) return `url:${url}`;
  return `title:${category}:${title}`;
}

function buildStoryPool(data) {
  const today = Array.isArray(data.today) ? data.today : [];
  const liveLeaderboards = Array.isArray(data.liveLeaderboards) ? data.liveLeaderboards : [];
  const alsoMoving = Array.isArray(data.alsoMoving) ? data.alsoMoving : [];
  const weekRadar = Array.isArray(data.weekRadar || data.week_radar) ? (data.weekRadar || data.week_radar) : [];

  const pool = [
    ...today,
    ...liveLeaderboards,
    ...alsoMoving,
    ...weekRadar
  ];

  const seen = new Map();

  pool
    .filter((item) => !isBadStory(item))
    .forEach((item) => {
      const key = normalizeStoryKey(item);
      const existing = seen.get(key);

      const itemTime = getItemTimestamp(item) || 0;
      const existingTime = existing ? getItemTimestamp(existing) || 0 : 0;

      if (!existing || itemTime > existingTime) {
        seen.set(key, item);
      }
    });

  return Array.from(seen.values()).sort((a, b) => {
    const timeA = getItemTimestamp(a) || 0;
    const timeB = getItemTimestamp(b) || 0;

    if (timeA !== timeB) return timeB - timeA;

    const scoreA = Number(a.score || a.trendingScore || a.popularityScore || a.radarScore || 0);
    const scoreB = Number(b.score || b.trendingScore || b.popularityScore || b.radarScore || 0);

    return scoreB - scoreA;
  });
}

function filterStoriesForEdition(stories, edition) {
  const nowET = getETParts();

  const todaysStories = stories.filter((item) => {
    const timestamp = getItemTimestamp(item);
    if (!timestamp) return false;

    const itemET = getETParts(new Date(timestamp));
    return itemET.dateKey === nowET.dateKey;
  });

  const recentWindowStories = todaysStories.filter((item) => {
    const timestamp = getItemTimestamp(item);
    if (!timestamp) return false;

    const itemET = getETParts(new Date(timestamp));

    if (edition === "morning") {
      return itemET.hour >= 0 && itemET.hour < 12;
    }

    if (edition === "midday") {
      return itemET.hour >= 8 && itemET.hour < 20;
    }

    if (edition === "evening") {
      return itemET.hour >= 12;
    }

    return true;
  });

  const now = Date.now();
  const recentStories = stories.filter((item) => {
    const timestamp = getItemTimestamp(item);
    if (!timestamp) return false;

    const ageHours = (now - timestamp) / 3600000;
    return ageHours <= 36;
  });

  const primaryStories = recentWindowStories.length
    ? recentWindowStories
    : todaysStories.length
      ? todaysStories
      : recentStories;

  return primaryStories.slice(0, 16);
}

function hasAlreadyRun(todayJson, edition, date = new Date()) {
  if (!todayJson || !todayJson.lastUpdated || !todayJson.edition) return false;
  if (todayJson.edition !== edition) return false;

  const nowET = getETParts(date);
  const lastET = getETParts(new Date(todayJson.lastUpdated));

  return nowET.dateKey === lastET.dateKey;
}

function hasReusableBriefingItems(todayJson) {
  return Array.isArray(todayJson?.items) && todayJson.items.length >= 2;
}

function buildOutput({ edition, items, now = new Date() }) {
  return {
    active: true,
    lastUpdated: now.toISOString(),
    edition,
    label: normalizeDisplayText(getLabel(edition)),
    title: normalizeDisplayText(TODAY_IN_GOLF_TITLE),
    summary: normalizeDisplayText(TODAY_IN_GOLF_SUMMARY),
    items,
    url: "https://www.morningtee.com/search",
    cta: normalizeDisplayText(TODAY_IN_GOLF_CTA)
  };
}

function updateEditionMetadataOnly(currentTodayJson, edition, reason) {
  if (!hasReusableBriefingItems(currentTodayJson)) {
    console.log(`[Today In Golf] ${reason}. No reusable briefing items found. Keeping existing today-in-golf.json.`);
    return false;
  }

  const output = buildOutput({
    edition,
    items: currentTodayJson.items
  });

  writeJson(TODAY_PATH, output);

  console.log(`[Today In Golf] ${reason}. Updated edition metadata only for ${edition}.`);
  console.log(JSON.stringify(output, null, 2));

  return true;
}

function runEditionLabelDryRun() {
  const checks = [
    ["2026-06-23T12:01:00Z", "8:01 a.m. ET"],
    ["2026-06-23T16:01:00Z", "12:01 p.m. ET"],
    ["2026-06-24T00:01:00Z", "8:01 p.m. ET"]
  ];

  checks.forEach(([iso, label]) => {
    const date = new Date(iso);
    const edition = getCurrentWindowEdition(date);
    console.log(`${label}: ${edition || "none"} -> ${edition ? getLabel(edition) : "No eligible edition"}`);
  });
}

function simplifyLeaders(leaders) {
  if (!Array.isArray(leaders)) return [];

  return leaders.slice(0, 6).map((leader) => ({
    pos: leader.pos || "",
    name: leader.name || "",
    score: leader.score || "",
    thru: leader.thru || ""
  }));
}

function getCurrentTournamentStates(stories) {
  const states = {};

  stories.forEach((item) => {
    const tournament = String(item?.tournament || "").trim();
    if (!tournament || !Array.isArray(item?.leaders) || !item.leaders.length) return;

    const key = tournament.toLowerCase();
    const timestamp = getItemTimestamp(item) || 0;
    const existing = states[key];

    if (!existing || timestamp > existing.timestamp) {
      states[key] = {
        tournament,
        timestamp,
        leaders: simplifyLeaders(item.leaders),
        title: removeUnsafeWinnerLanguage(item.title || "", item),
        summary: removeUnsafeWinnerLanguage(item.summary || "", item),
        quickRead: removeUnsafeWinnerLanguage(item.quickRead || "", item)
      };
    }
  });

  return states;
}

function simplifyStoryForPrompt(item) {
  return {
    title: removeUnsafeWinnerLanguage(item.title || "", item),
    label: item.label || item.category || item.signal || "",
    source: item.source || item.sourceName || "",
    url: item.sourceUrl || item.url || "",
    summary: removeUnsafeWinnerLanguage(item.summary || "", item),
    quickRead: removeUnsafeWinnerLanguage(item.quickRead || item.quickContext || item.modalSummary || "", item),
    quote: item.keyQuote || item.quote || "",
    quoteAttribution: item.quoteAttribution || item.quoteByline || "",
    tournament: item.tournament || "",
    status: item.status || "",
    leaders: simplifyLeaders(item.leaders),
    publishedAt: item.publishedAt || item.timestamp || item.approvedAt || item.date || ""
  };
}

function cleanGeneratedText(value) {
  let text = String(value || "");

  const nowET = getETParts();
  const safeToSayWon = false;

  if (!safeToSayWon) {
    text = text
      .replace(/\bwins\b/gi, "leads")
      .replace(/\bwon\b/gi, "leads")
      .replace(/\bwinner\b/gi, "leader")
      .replace(/\bchampion\b/gi, "leader")
      .replace(/\bcaptured\b/gi, "leads")
      .replace(/\bsecured victory\b/gi, "moved into position")
      .replace(/\bsecured the victory\b/gi, "moved into position")
      .replace(/\bclaimed victory\b/gi, "moved into position")
      .replace(/\bclaimed the title\b/gi, "moved into the lead")
      .replace(/\bclaims the title\b/gi, "moves into the lead")
      .replace(/\bwinner\b/gi, "leader")
      .replace(/\bchampion\b/gi, "leader")
      .replace(/\bclaimed the title\b/gi, "moved into the lead")
      .replace(/\bclaims the title\b/gi, "moves into the lead")
      .replace(/\bfinishing five strokes ahead\b/gi, "sitting five strokes ahead")
      .replace(/\bfinishing five shots clear\b/gi, "sitting five shots clear")
      .replace(/\bfinished five strokes ahead\b/gi, "sits five strokes ahead")
      .replace(/\bfinished five shots clear\b/gi, "sits five shots clear");
  }

  return text
    .replace(/\bshare the lead\b/gi, "move near the lead")
    .replace(/\bshares the lead\b/gi, "moves near the lead")
    .replace(/\bshared the lead\b/gi, "moved near the lead")
    .replace(/\bsharing the lead\b/gi, "moving near the lead")
    .replace(/\btakes the lead\b/gi, "moves up the leaderboard")
    .replace(/\btook the lead\b/gi, "moved up the leaderboard")
    .replace(/\bsits one back\b/gi, "is chasing")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function isLowValueBriefingItem(item) {
  const text = `${item?.headline || ""} ${item?.text || ""}`.toLowerCase();

  const lowValuePatterns = [
    /\breddit\b/,
    /\br\/golf\b/,
    /\bhot dog\b/,
    /\bmeme\b/,
    /\bviral joke\b/,
    /\bbunker debate\b/,
    /\bbiggest bunker\b/,
    /\bsand area\b/,
    /\bwaste area\b/,
    /\bfood post\b/,
    /\bgolf internet\b/
  ];

  return lowValuePatterns.some((pattern) => pattern.test(text));
}

function getBriefingTopicKey(item) {
  const text = `${item?.headline || ""} ${item?.text || ""}`.toLowerCase();

  if (text.includes("liv") || text.includes("saudi") || text.includes("pif")) return "liv";
  if (text.includes("bryson") || text.includes("dechambeau")) return "bryson";
  if (text.includes("pga tour")) return "pga-tour";
  if (text.includes("scottie") || text.includes("scheffler")) return "scheffler";
  if (text.includes("rory") || text.includes("mcilroy")) return "rory";
  if (text.includes("rahm")) return "rahm";
  if (text.includes("lpga") || text.includes("korda")) return "lpga";
  if (text.includes("japan tour")) return "japan-tour";
  if (text.includes("dp world")) return "dp-world";
  if (text.includes("charles schwab") || text.includes("colonial")) return "charles-schwab";
  if (text.includes("byron nelson") || text.includes("cj cup")) return "byron-nelson";

  return "";
}

function cleanGeneratedItems(items) {
  if (!Array.isArray(items)) return [];

  const usedTopics = new Set();

  return items
    .filter((item) => item && item.headline && item.text)
    .filter((item) => !isLowValueBriefingItem(item))
    .map((item) => ({
      headline: cleanGeneratedText(item.headline),
      text: cleanGeneratedText(item.text)
    }))
    .filter((item) => {
      const topicKey = getBriefingTopicKey(item);

      if (!topicKey) return true;
      if (usedTopics.has(topicKey)) return false;

      usedTopics.add(topicKey);
      return true;
    })
    .slice(0, 4);
}

async function generateBriefing(stories, edition) {
  const label = getLabel(edition);
  const currentTournamentStates = getCurrentTournamentStates(stories);

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "items", "cta"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      cta: { type: "string" },
      items: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["headline", "text"],
          properties: {
            headline: { type: "string" },
            text: { type: "string" }
          }
        }
      }
    }
  };

  const systemPrompt = `
You write Morning Tee's "Today In Golf" module.

Product promise:
A reader should understand the essential golf news in under 30 seconds.

Output rules:
- Return 3 briefing items by default. Use 4 only for genuinely essential stories. If only 2 useful, specific, durable stories are available, return the 2 strongest rather than adding vague filler.
- Each item has a short headline, ideally 2 to 5 words.
- Each item has one direct sentence.
- Every sentence must give the answer, not tease the answer.
- Be specific: include scores, exact player actions, named events, quotes, consequences, tee times, named videos/projects, or named posts when available.
- Do not invent facts. Only use details found in the source stories.
- If a story lacks enough detail, skip it.
- Prefer quickRead, leaders, tournament, quotes, and source fields over generic titles.
- The module title must always be "Today In Golf". Do not rename it for a specific tournament.
- Do not include old tee-time/setup stories if a newer result or leaderboard story from the same tournament is already available.
- If a final result is genuinely available, prioritize the result and skip earlier tee-time items from that tournament.
Specificity rule:
- Never write vague phrases like “big names withdrew,” “several players,” “some players,” “major names,” or “a few golfers” unless the names are unavailable in the source.
- If a withdrawal, injury, penalty, suspension, ban, rules issue, or caddie change is included, name the person or people involved and give the reason or consequence when available.
- Bad: “Big names withdraw from Charles Schwab.”
- Good: “Jordan Spieth and [name] withdrew from the Charles Schwab Challenge; [reason/consequence if available].”
- If the source does not say who or why, skip the item unless the fact itself is unusually important.

Durability rule:
- Avoid making Today In Golf depend on live leaderboard positions that may change quickly.
- Do not use a normal “Player leads at X-under” item unless it is final, a major championship, a huge lead, or tied to a memorable event.
- Leave fast-changing scoring and normal tee-time updates to the Newest section.
- Today In Golf should prioritize durable stories that still matter later in the day.

Context rule:
- Each item should include the consequence or current-day relevance when available.
- Do not stop at what happened if the source includes what changed next.
- For caddie, injury, penalty, withdrawal, retirement, suspension, equipment, or rules stories, include the immediate consequence.
- Good: “Higgo is using a new caddie at the Byron Nelson.”
- Bad: “Higgo missed the cut by one stroke.”

Editorial priority:
- Today In Golf should highlight durable golf stories that still matter later in the day, not fast-changing live leaderboard updates.
- Newest handles normal scoring, tee times, and live leaderboard changes. Do not turn Today In Golf into a leaderboard ticker.
- Prioritize memorable or consequential stories: injuries, withdrawals, penalties, rules incidents, suspensions, bans, caddie changes, equipment/rules changes, major quotes, unusual tournament moments, golf-business news, and big-name updates involving Rory McIlroy, Tiger Woods, Scottie Scheffler, Bryson DeChambeau, Jon Rahm, Brooks Koepka, Nelly Korda, or similar names.
- Actively look for global stories from LPGA, LIV, DP World Tour, Japan Golf Tour, Asian Tour, Sunshine Tour/South Africa, amateur golf, and golf business.
- Include overseas/global golf only when the story has a concrete detail, such as a winner, leader, score, quote, withdrawal, injury, suspension, funding change, retirement, tour consequence, or unusual development readers likely missed.
- Good Today In Golf items include: a player breaking a club, getting hit by a ball, being penalized, withdrawing, changing caddies, being banned, missing a cut in a notable way, a marker being used, a rules controversy, a record round, a hole-in-one, an injury update, or a major quote.
- Avoid normal live scoring updates unless the score is part of a memorable event, such as a 59, 60, 61, course record, hole-in-one, collapse, penalty, or final result.
- Usually use this order:
  1. The biggest durable tournament story, not necessarily the current leader.
  2. The most important global golf story outside that same tournament, such as LPGA, LIV, DP World Tour, Japan Golf Tour, Asian Tour, Sunshine Tour/South Africa, amateur golf, rules, equipment, injury, retirement, or golf-business news.
  3. The best performance or moment of the day, such as a hole-in-one, 61, course record, huge comeback, penalty, rules incident, marker story, injury, or major quote.
  4. Only add a fourth item if it is genuinely important.
- Do not use three items from the same tournament unless it is a major championship, final round, playoff, injury, disqualification, rules controversy, or major breaking news.
- A hole-in-one, course record, 59/60/61, major penalty, injury, WD, ban, rules incident, marker story, or major quote usually beats a normal “player surged up the leaderboard” item.
- A normal birdie run only belongs if there is no stronger global item or if it creates a record, memorable streak, or meaningful consequence.
- If the best available item is a live tournament item, frame it around the durable angle, not just the current leader.
- If there is no meaningful global item, use the strongest remaining durable story, but avoid using three normal updates from the same tournament.
- Do not include Reddit posts, memes, viral jokes, food posts, bunker debates, or normal golf-internet items unless they become a major golf-world story with real consequences.
- Do not use vague global labels like “Global watch” unless the story itself is named and specific.
- Do not fill space. If only three stories matter, use three.
- Do not use stale tournament results from previous weeks unless there is a clear current-day reason, such as a record being broken, a player returning, a suspension, injury, quote, or consequence that is still unfolding today.
- A past winner/result should not be included just because it appears in the feed. It must connect to today’s golf news.
- Today In Golf should not simply repeat the same stories shown in the Newest section.
- If a story already appears in Newest, only include it in Today In Golf if it is clearly one of the day’s biggest stories and the briefing adds extra context, consequence, or specificity.
- Do not use more than one item that is also likely to appear in Newest unless the day has very few meaningful stories.
- If Today In Golf would mostly repeat Newest, choose fewer stronger items or pick a broader/global/durable story instead.
- A duplicated Newest item must be rewritten as a briefing, not copied as another headline. It should answer what happened, who was involved, and why it matters.

Critical accuracy rule:
- Never say a player won, wins, claimed the title, or is champion unless the source explicitly says the tournament is final and the event is complete.
- A player marked "F" means finished the round, not won the tournament.
- If it is Thursday, Friday, or Saturday, rewrite winner language as "leads," "finished the round at," or "sits at."
- If unsure, use "leads" instead of "wins."
- On Monday, yesterday’s completed PGA Tour result may be written as “won” only when the source story clearly describes a Sunday final result, victory, final round, held-off finish, or completed title.

Leaderboard consistency rule:
- Use currentTournamentStates as the source of truth for the current leaderboard.
- Never describe an older leaderboard state as current if currentTournamentStates gives a newer state from the same tournament.
- If a player made a notable move earlier, describe only the standalone action, such as an ace, eagle, 61, or penalty, and use currentTournamentStates for the current position.
- Do not write "shares the lead," "takes the lead," or "sits one back" from an older item if currentTournamentStates gives a different leader or margin.
- If the current tournament state says another player is leading by multiple shots, do not say an older highlight player shares the lead.

Headline rules:
- Name the story container, not just a vague player tease.
- Good: "CJ CUP Byron Nelson", "Bryson rumor denied", "Friday tee times", "LPGA lead", "Japan Tour winner", "Higgo penalty".
- Bad: "Bryson watch", "Round 2 is set", "Tournament update", "Next thing to know", "Golf internet".
- Use specific headlines, not category labels.
- Good: "CJ CUP Byron Nelson", "LPGA lead", "LIV funding", "Japan Tour winner", "Im’s ace", "Higgo penalty".
- Bad: "Global watch", "Around the world", "Tournament update", "Big move".

Tournament rules:
- Include tournament name, winner or leader, score, closest challenger if available, and one notable performance detail. On Monday, prioritize yesterday’s final winner over “leader” wording when the source clearly describes a completed result.
- If the story says a player won, say won only if the source clearly says the tournament is final and complete.
- If tee times are the story, include exact tee times for the leader or big names if available. Do not just say tee times are out.
- Never describe an older leaderboard state as current if a newer leaderboard item from the same tournament exists.
- If a player made a notable move earlier, describe only the standalone action, such as an ace, eagle, 61, or penalty, and update the current position using the newest leaderboard.
- Do not write “shares the lead,” “takes the lead,” or “sits one back” from an older item if a newer item gives a different leader or margin.
- For tournament items, pick the strongest angle, not every related update.
- The current leader/score should only be the main tournament item when it is final, unusually significant, tied to a record/memorable moment, or there is no stronger durable story.
- A hole-in-one, 61, 59, course record, or major rules/penalty moment can be a separate item if it is more memorable than a normal leaderboard move.
- Do not include a normal “surge” item if the same player is not near the current lead and there is a stronger global story available.
- Do not make the main tournament item a normal current-leader update unless there is no stronger durable story.
- Prefer tournament moments that remain true even if the leaderboard changes: hole-in-one, record score, penalty, WD, injury, rules issue, marker, caddie change, equipment issue, or major quote.
- If using a scoring item, explain the memorable action, not just the position. Good: “Sungjae Im made a hole-in-one on No. 7 and eagled No. 9 during a second-round 61.” Bad: “Wyndham Clark leads at 12-under.”
- Do not describe a player as defending, seeking to match a record, or chasing history unless the source explicitly says that exact current context.
- Avoid old final-result stories from completed tournaments unless the story has a new consequence today.
- For withdrawal stories, always include who withdrew and the stated reason if available.
- If the reason is not available, include the consequence, such as who moved into the field, how it affects the tournament, or why the absence matters.
- Do not publish a withdrawal item that only says “big names withdrew” without names.

Rumor/quote rules:
- Include who said it, what the rumor or claim was, and the exact answer or quote.
- Do not say "rumor picked up steam" or "rumors spread."

Creator/internet rules:
- Only include creator or internet stories if they involve a major golf figure, a major platform shift, a confirmed project, a significant quote, or real consequences.
- Do not include Reddit memes, funny posts, course food, generic viral debates, or low-stakes internet chatter.

Avoid these phrases:
- picked up steam
- worth watching
- made headlines
- generated buzz
- the bigger picture
- weekend picture
- content shift
- rumors kept spreading
- could have implications
- continues to grow
- next thing to know

The top summary must be exactly:
${TODAY_IN_GOLF_SUMMARY}

CTA must be:
${TODAY_IN_GOLF_CTA}
`.trim();

  const userPrompt = JSON.stringify({
    edition,
    label,
    currentEasternTime: getETParts(),
    currentTournamentStates,
    stories: stories.map(simplifyStoryForPrompt)
  }, null, 2);

  let response = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "today_in_golf",
            strict: true,
            schema
          }
        }
      })
    });

    if (response.ok) break;

    const errorText = await response.text();
    console.warn(`[Today In Golf] OpenAI attempt ${attempt} failed: ${response.status} ${errorText}`);

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  if (!response || !response.ok) {
    console.warn("[Today In Golf] OpenAI failed after 3 attempts. Keeping existing briefing.");
    return null;
  }

  const result = await response.json();

  const outputText =
    result.output_text ||
    result.output?.flatMap((item) => item.content || [])
      ?.find((content) => content.type === "output_text")?.text;

  if (!outputText) {
    console.warn("[Today In Golf] No output text returned from OpenAI. Keeping existing briefing.");
    return null;
  }

  return JSON.parse(outputText);
}

async function main() {
  if (DRY_RUN_EDITION_LABELS) {
    runEditionLabelDryRun();
    return;
  }

  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const radarData = readJson(RADAR_PATH, {});
  const currentTodayJson = readJson(TODAY_PATH, null);
  const et = getETParts();

  console.log(`[Today In Golf] Current ET: ${et.dateKey} ${String(et.hour).padStart(2, "0")}:${String(et.minute).padStart(2, "0")}`);
  console.log(`[Today In Golf] MANUAL_EDITION=${MANUAL_EDITION}`);
  console.log(`[Today In Golf] FORCE_RUN=${FORCE_RUN}`);

  let edition = getEditionNow(currentTodayJson);

  if (!edition && FORCE_RUN) {
    edition = isValidEdition(MANUAL_EDITION) ? MANUAL_EDITION : getMostRecentEligibleEdition();
    console.log(`[Today In Golf] Force run edition resolved to: ${edition || "none"}`);
  }

  if (!edition) {
    console.log("No eligible Today In Golf edition window found. Skipping.");
    return;
  }

  if (!FORCE_RUN && hasAlreadyRun(currentTodayJson, edition)) {
    console.log(`Today In Golf already generated for ${edition} today. Skipping.`);
    return;
  }

  const storyPool = buildStoryPool(radarData);
  console.log(`[Today In Golf] Story pool size: ${storyPool.length}`);

  const storiesForEdition = filterStoriesForEdition(storyPool, edition);
  console.log(`[Today In Golf] Stories selected for ${edition}: ${storiesForEdition.length}`);

  if (!storiesForEdition.length) {
    updateEditionMetadataOnly(currentTodayJson, edition, "No stories found");
    return;
  }

  const generated = await generateBriefing(storiesForEdition, edition);

  if (!generated) {
    updateEditionMetadataOnly(currentTodayJson, edition, "OpenAI returned no usable briefing");
    return;
  }

  const cleanedItems = cleanGeneratedItems(generated.items);

  if (cleanedItems.length < 2) {
    updateEditionMetadataOnly(currentTodayJson, edition, "Generated briefing had fewer than 2 usable items");
    return;
  }

  const now = new Date();
  const output = {
    active: true,
    lastUpdated: now.toISOString(),
    edition,
    label: normalizeDisplayText(getLabel(edition)),
    title: normalizeDisplayText(TODAY_IN_GOLF_TITLE),
    summary: normalizeDisplayText(TODAY_IN_GOLF_SUMMARY),
    items: cleanedItems,
    url: "https://www.morningtee.com/search",
    cta: normalizeDisplayText(TODAY_IN_GOLF_CTA)
  };

  writeJson(TODAY_PATH, output);

  console.log(`Updated ${TODAY_PATH} for ${edition}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
