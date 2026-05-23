const fs = require("fs");

const RADAR_PATH = "latest-radar.json";
const TODAY_PATH = "today-in-golf.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MANUAL_EDITION = process.env.MANUAL_EDITION || "auto";
const FORCE_RUN = process.env.FORCE_RUN === "true";

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
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

  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`
  };
}

function getEditionNow() {
  if (MANUAL_EDITION === "midday" || MANUAL_EDITION === "evening") {
    return MANUAL_EDITION;
  }

  const et = getETParts();

  if (et.hour === 12) return "midday";
  if (et.hour === 20) return "evening";

  return null;
}

function getLabel(edition) {
  return edition === "midday" ? "Updated 12 PM ET" : "Updated 8 PM ET";
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
  const title = String(item?.title || "").toLowerCase();
  const summary = String(item?.summary || "").toLowerCase();
  const quickRead = String(item?.quickRead || "").toLowerCase();

  const explicitlyFinal =
    status === "final" ||
    status === "complete" ||
    status === "completed" ||
    signal.includes("final result") ||
    signal.includes("final leaderboard") ||
    title.includes("final result") ||
    title.includes("final leaderboard") ||
    summary.includes("final result") ||
    summary.includes("final leaderboard") ||
    quickRead.includes("final result") ||
    quickRead.includes("final leaderboard") ||
    quickRead.includes("tournament is complete") ||
    quickRead.includes("event is complete");

  const isSundayOrMonday = weekday === "Sun" || weekday === "Mon";

  return explicitlyFinal && isSundayOrMonday;
}

function removeUnsafeWinnerLanguage(value, item) {
  let text = String(value || "");

  if (isTournamentFinalSafe(item)) return text;

  return text
    .replace(/\bwins\b/gi, "leads")
    .replace(/\bwon\b/gi, "leads")
    .replace(/\bwinner\b/gi, "leader")
    .replace(/\bchampion\b/gi, "leader")
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
    /\bviral joke\b/i
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
    if (itemET.dateKey !== nowET.dateKey) return false;

    if (edition === "midday") return itemET.hour < 12;
    return true;
  });

  if (todaysStories.length >= 3) return todaysStories.slice(0, 14);

  return stories.slice(0, 14);
}

function hasAlreadyRun(todayJson, edition) {
  if (!todayJson || !todayJson.lastUpdated || !todayJson.edition) return false;
  if (todayJson.edition !== edition) return false;

  const nowET = getETParts();
  const lastET = getETParts(new Date(todayJson.lastUpdated));

  return nowET.dateKey === lastET.dateKey;
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
  const safeToSayWon = nowET.weekday === "Sun" || nowET.weekday === "Mon";

  if (!safeToSayWon) {
    text = text
      .replace(/\bwins\b/gi, "leads")
      .replace(/\bwon\b/gi, "leads")
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
    /\bfood post\b/,
    /\bgolf internet\b/
  ];

  return lowValuePatterns.some((pattern) => pattern.test(text));
}

function cleanGeneratedItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && item.headline && item.text)
    .filter((item) => !isLowValueBriefingItem(item))
    .slice(0, 4)
    .map((item) => ({
      headline: cleanGeneratedText(item.headline),
      text: cleanGeneratedText(item.text)
    }));
}

async function generateBriefing(stories, edition) {
  const label = getLabel(edition);

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
        minItems: 3,
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
- Return exactly 3 briefing items unless there are 4 genuinely essential stories.
- Each item has a short headline, ideally 2 to 5 words.
- Each item has one direct sentence.
- Every sentence must give the answer, not tease the answer.
- Be specific: include scores, exact player actions, named events, quotes, consequences, tee times, named videos/projects, or named posts when available.
- Do not invent facts. Only use details found in the source stories.
- If a story lacks enough detail, skip it.
- Prefer quickRead, leaders, tournament, quotes, and source fields over generic titles.
- Do not include stale duplicate leaderboard updates from the same tournament if a newer leaderboard item exists.
- The module title must always be "Today In Golf". Do not rename it for a specific tournament.
- Do not include old tee-time/setup stories if a newer result or leaderboard story from the same tournament is already available.
- If a final result is genuinely available, prioritize the result and skip earlier tee-time items from that tournament.

Editorial priority:
- Prioritize tournament leads/results, major leaderboard movement, big-name players, injuries, withdrawals, retirements, major quotes, rules/equipment changes, LIV/PGA Tour/DP World Tour/LPGA/Japan/Asia news, and major business developments.
- Include overseas/global golf only when the story is genuinely notable, such as a major win, star player movement, funding collapse, tour shutdown, injury, suspension, retirement, or unusual development most readers likely missed.
- Do not include Reddit posts, memes, viral jokes, food posts, bunker debates, or normal golf-internet items unless they become a major golf-world story with real consequences.
- Do not fill space. If only three stories matter, use three.

Critical accuracy rule:
- Never say a player won, wins, claimed the title, or is champion unless the source explicitly says the tournament is final and the event is complete.
- A player marked "F" means finished the round, not won the tournament.
- If it is Thursday, Friday, or Saturday, rewrite winner language as "leads," "finished the round at," or "sits at."
- If unsure, use "leads" instead of "wins."

Headline rules:
- Name the story container, not just a vague player tease.
- Good: "CJ CUP Byron Nelson", "Bryson rumor denied", "Friday tee times", "LPGA lead", "Japan Tour winner", "Higgo penalty".
- Bad: "Bryson watch", "Round 2 is set", "Tournament update", "Next thing to know", "Golf internet".

Tournament rules:
- Include tournament name, leader, score, closest challenger if available, and one notable performance detail.
- If the story says a player won, say won only if the source clearly says the tournament is final and complete.
- If tee times are the story, include exact tee times for the leader or big names if available. Do not just say tee times are out.

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
A 30-second briefing on today’s biggest golf stories.

CTA must be:
See all stories →
`.trim();

  const userPrompt = JSON.stringify({
    edition,
    label,
    currentEasternTime: getETParts(),
    stories: stories.map(simplifyStoryForPrompt)
  }, null, 2);

  const response = await fetch("https://api.openai.com/v1/responses", {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  const outputText =
    result.output_text ||
    result.output?.flatMap((item) => item.content || [])
      ?.find((content) => content.type === "output_text")?.text;

  if (!outputText) {
    throw new Error("No output text returned from OpenAI");
  }

  return JSON.parse(outputText);
}

async function main() {
  const edition = getEditionNow();

  if (!edition && !FORCE_RUN) {
    console.log("Not noon or 8 PM ET. Skipping.");
    return;
  }

  const finalEdition = edition || "evening";

  const radarData = readJson(RADAR_PATH, {});
  const currentTodayJson = readJson(TODAY_PATH, null);

  if (!FORCE_RUN && hasAlreadyRun(currentTodayJson, finalEdition)) {
    console.log(`Today In Golf already generated for ${finalEdition} today. Skipping.`);
    return;
  }

  const storyPool = buildStoryPool(radarData);
  const storiesForEdition = filterStoriesForEdition(storyPool, finalEdition);

  if (!storiesForEdition.length) {
    console.log("No stories found. Keeping existing today-in-golf.json.");
    return;
  }

  const generated = await generateBriefing(storiesForEdition, finalEdition);
  const cleanedItems = cleanGeneratedItems(generated.items);

  if (cleanedItems.length < 3) {
    console.log("Generated briefing had fewer than 3 usable items. Keeping existing today-in-golf.json.");
    return;
  }

  const now = new Date();
  const output = {
    active: true,
    lastUpdated: now.toISOString(),
    edition: finalEdition,
    label: getLabel(finalEdition),
    title: "Today In Golf",
    summary: "A 30-second briefing on today’s biggest golf stories.",
    items: cleanedItems,
    url: "https://www.morningtee.com/search",
    cta: "See all stories →"
  };

  writeJson(TODAY_PATH, output);

  console.log(`Updated ${TODAY_PATH} for ${finalEdition}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
