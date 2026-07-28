const fs = require("fs");

const RADAR_PATH = "latest-radar.json";
const TODAY_PATH = "today-in-golf.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = null;

const MANUAL_EDITION = process.env.MANUAL_EDITION || "auto";
const FORCE_RUN = process.env.FORCE_RUN === "true";
const DRY_RUN_EDITION_LABELS = process.env.DRY_RUN_EDITION_LABELS === "true";
const DRY_RUN_TODAY_IN_GOLF_INPUTS = process.env.DRY_RUN_TODAY_IN_GOLF_INPUTS === "true";
const DRY_RUN_OPENAI_CONFIG = process.env.DRY_RUN_OPENAI_CONFIG === "true";
const SIMULATE_TODAY_IN_GOLF_FALLBACK = process.env.SIMULATE_TODAY_IN_GOLF_FALLBACK === "true";
const TEST_LIVE_FINAL_CONTRADICTION = process.env.TEST_LIVE_FINAL_CONTRADICTION === "true";

const TODAY_IN_GOLF_TITLE = "Today In Golf";
const TODAY_IN_GOLF_SUMMARY = "A 30-second briefing on today's biggest golf stories.";
const TODAY_IN_GOLF_CTA = "See all stories ->";

const EDITION_BY_SCHEDULE_CRON = {
  "17 12 * * *": "morning",
  "17 13 * * *": "morning",
  "17 16 * * *": "midday",
  "17 17 * * *": "midday",
  "17 0 * * *": "evening",
  "17 1 * * *": "evening"
};

const EDITION_ORDER = {
  morning: 1,
  midday: 2,
  evening: 3
};

// Eastern-time windows for each edition. Scheduled cron entries map to an
// edition, but the run only proceeds when the current ET clock is inside the
// matching window. This prevents EST fallback crons from firing the wrong
// edition during daylight saving time (for example, "17 1 * * *" is 8:17 PM ET
// in winter but 9:17 PM in summer, and 00:17 UTC is midnight ET in summer).
const EDITION_WINDOWS = {
  morning: { start: 8, end: 12 },
  midday: { start: 12, end: 20 },
  evening: { start: 20, end: 24 }
};

const GITHUB_EVENT_NAME = process.env.GITHUB_EVENT_NAME || "";

let lastGenerationFailureReason = "";
let lastGenerationFailureStage = "";
let lastRunDiagnostics = createDiagnosticMetadata();

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

function getScheduledEditionDetails() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    return {
      schedule: "",
      edition: null
    };
  }

  const event = readJson(eventPath, {});
  const schedule = String(event?.schedule || "").trim();

  return {
    schedule,
    edition: EDITION_BY_SCHEDULE_CRON[schedule] || null
  };
}

function getEditionHourFraction(date = new Date()) {
  const et = getETParts(date);
  return et.hour + et.minute / 60;
}

function isEditionInWindow(edition, date = new Date()) {
  if (!isValidEdition(edition) || !EDITION_WINDOWS[edition]) return false;

  const hours = getEditionHourFraction(date);
  const window = EDITION_WINDOWS[edition];

  return hours >= window.start && hours < window.end;
}

function getCurrentWindowEdition(date = new Date()) {
  if (isEditionInWindow("morning", date)) return "morning";
  if (isEditionInWindow("midday", date)) return "midday";
  if (isEditionInWindow("evening", date)) return "evening";

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

  const scheduledEdition = getScheduledEditionDetails().edition;

  if (scheduledEdition) {
    const windowEdition = getCurrentWindowEdition(date);

    if (windowEdition !== scheduledEdition) {
      console.log(
        `[Today In Golf] Scheduled cron maps to ${scheduledEdition}, but current ET window is ${windowEdition || "none"}. Skipping off-window scheduled run.`
      );
      return null;
    }

    return hasRunSameOrLaterEdition(currentTodayJson, scheduledEdition, date) ? null : scheduledEdition;
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

function getDisplayLabel(edition, usedFallback = false) {
  const label = getLabel(edition);
  return usedFallback ? label.replace(/^Updated at/i, "Last checked at") : label;
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

function hasRunSameOrLaterEdition(todayJson, edition, date = new Date()) {
  if (!todayJson || !todayJson.lastUpdated || !todayJson.edition) return false;
  if (!EDITION_ORDER[edition] || !EDITION_ORDER[todayJson.edition]) return false;

  const nowET = getETParts(date);
  const lastET = getETParts(new Date(todayJson.lastUpdated));

  if (nowET.dateKey !== lastET.dateKey) return false;
  if (EDITION_ORDER[todayJson.edition] < EDITION_ORDER[edition]) return false;

  // Ignore edition metadata written outside its intended ET window. This keeps a
  // mistaken off-window evening run from blocking the real morning edition.
  return isEditionInWindow(todayJson.edition, new Date(todayJson.lastUpdated));
}

function hasReusableBriefingItems(todayJson) {
  return Array.isArray(todayJson?.items) && todayJson.items.length >= 2;
}

function normalizeBriefingItemsForCompare(items) {
  if (!Array.isArray(items)) return "[]";

  return JSON.stringify(items.map((item) => ({
    headline: String(item?.headline || "").trim(),
    text: String(item?.text || "").trim()
  })));
}

function haveBriefingItemsChanged(nextItems, previousItems) {
  return normalizeBriefingItemsForCompare(nextItems) !== normalizeBriefingItemsForCompare(previousItems);
}

function getPreviousItemsLastUpdated(todayJson) {
  return todayJson?.itemsLastUpdated ||
    todayJson?.lastSuccessfulStoryUpdate ||
    todayJson?.lastUpdated ||
    null;
}

function getPreviousItemsEdition(todayJson) {
  return todayJson?.itemsEdition || todayJson?.edition || null;
}

function createDiagnosticMetadata(overrides = {}) {
  return {
    sourceItemsLoaded: null,
    candidateItemsSelected: null,
    openaiAttempted: false,
    openaiOutputLength: null,
    openaiStatusCode: null,
    openaiErrorType: "",
    openaiErrorCode: "",
    openaiErrorMessageShort: "",
    openaiResponseBodyPreview: "",
    openaiModel: OPENAI_MODEL,
    openaiEndpoint: OPENAI_ENDPOINT,
    openaiRequestId: "",
    openaiRetryable: null,
    openaiFailureAt: "",
    generatedItemsCount: null,
    cleanedItemsCount: null,
    rejectedItemsCount: null,
    rejectedReasons: [],
    diagnosticUpdatedAt: new Date().toISOString(),
    ...overrides
  };
}

function updateDiagnosticMetadata(overrides = {}) {
  lastRunDiagnostics = createDiagnosticMetadata({
    ...lastRunDiagnostics,
    ...overrides,
    diagnosticUpdatedAt: new Date().toISOString()
  });
}

function sanitizeDiagnosticText(value, maxLength = 180) {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (OPENAI_API_KEY) {
    text = text.split(OPENAI_API_KEY).join("[redacted_api_key]");
  }

  text = text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  text = text.replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]");

  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength - 3).trimEnd() + "...";
}

function parseOpenAIErrorBody(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const error = parsed?.error || {};

    return {
      type: String(error.type || ""),
      code: String(error.code || ""),
      message: String(error.message || "")
    };
  } catch (error) {
    return {
      type: "",
      code: "",
      message: bodyText
    };
  }
}

function classifyOpenAIError({ statusCode, type, code, message }) {
  const text = `${type || ""} ${code || ""} ${message || ""}`.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || text.includes("invalid_api_key") || text.includes("authentication")) {
    return "auth_error";
  }

  if (statusCode === 429 && (text.includes("insufficient_quota") || text.includes("quota"))) {
    return "quota_exceeded";
  }

  if (statusCode === 429 || text.includes("rate_limit")) {
    return "rate_limit";
  }

  if (text.includes("model_not_found") || text.includes("does not exist") || text.includes("invalid model")) {
    return "invalid_model";
  }

  if (statusCode === 400 || text.includes("invalid_request")) {
    return "invalid_request";
  }

  if (statusCode >= 500 || statusCode === 408) {
    return "unknown_openai_error";
  }

  return "unknown_openai_error";
}

function isRetryableOpenAIError(statusCode, errorType) {
  return errorType === "rate_limit" ||
    errorType === "timeout" ||
    errorType === "network_error" ||
    statusCode === 408 ||
    statusCode >= 500;
}

function recordOpenAIResponseFailure(response, bodyText, attempt) {
  const parsedError = parseOpenAIErrorBody(bodyText);
  const statusCode = response?.status || null;
  const errorType = classifyOpenAIError({
    statusCode,
    ...parsedError
  });

  updateDiagnosticMetadata({
    openaiStatusCode: statusCode,
    openaiErrorType: errorType,
    openaiErrorCode: sanitizeDiagnosticText(parsedError.code, 80),
    openaiErrorMessageShort: sanitizeDiagnosticText(parsedError.message || bodyText, 180),
    openaiResponseBodyPreview: sanitizeDiagnosticText(bodyText, 180),
    openaiModel: OPENAI_MODEL,
    openaiEndpoint: OPENAI_ENDPOINT,
    openaiRequestId: sanitizeDiagnosticText(response?.headers?.get("x-request-id") || response?.headers?.get("request-id") || "", 80),
    openaiRetryable: isRetryableOpenAIError(statusCode, errorType),
    openaiFailureAt: `attempt_${attempt}_response`
  });
}

function recordOpenAINetworkFailure(error, attempt) {
  const message = error?.name === "AbortError" ? "OpenAI request timed out." : error?.message;
  const errorType = error?.name === "AbortError" ? "timeout" : "network_error";

  updateDiagnosticMetadata({
    openaiStatusCode: null,
    openaiErrorType: errorType,
    openaiErrorCode: sanitizeDiagnosticText(error?.code || error?.name || "", 80),
    openaiErrorMessageShort: sanitizeDiagnosticText(message || "OpenAI request failed before a response was returned.", 180),
    openaiResponseBodyPreview: "",
    openaiModel: OPENAI_MODEL,
    openaiEndpoint: OPENAI_ENDPOINT,
    openaiRequestId: "",
    openaiRetryable: true,
    openaiFailureAt: `attempt_${attempt}_network`
  });
}

function summarizeRejectedReasons(rejectedItems) {
  if (!Array.isArray(rejectedItems) || !rejectedItems.length) return [];

  const counts = new Map();
  rejectedItems.forEach((item) => {
    const reason = String(item?.reason || "unknown").slice(0, 80);
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .slice(0, 5);
}

function summarizeSourceCounts(data) {
  const groups = {
    today: Array.isArray(data.today) ? data.today.length : 0,
    liveLeaderboards: Array.isArray(data.liveLeaderboards) ? data.liveLeaderboards.length : 0,
    alsoMoving: Array.isArray(data.alsoMoving) ? data.alsoMoving.length : 0,
    weekRadar: Array.isArray(data.weekRadar || data.week_radar) ? (data.weekRadar || data.week_radar).length : 0
  };

  return {
    updatedAt: data?.updatedAt || "",
    total: Object.values(groups).reduce((sum, count) => sum + count, 0),
    groups
  };
}

function summarizeStoryForLog(item) {
  const timestamp = getItemTimestamp(item);

  return {
    title: String(item?.title || "").slice(0, 140),
    source: item?.source || item?.sourceName || "",
    category: item?.category || item?.label || item?.signal || "",
    timestamp: timestamp ? new Date(timestamp).toISOString() : "",
    url: item?.sourceUrl || item?.url || ""
  };
}

function logStoryDiagnostics({ radarData, storyPool, storiesForEdition, edition }) {
  const sourceCounts = summarizeSourceCounts(radarData);

  updateDiagnosticMetadata({
    sourceItemsLoaded: sourceCounts.total,
    candidateItemsSelected: storiesForEdition.length
  });

  console.log(`[Today In Golf] Source file updatedAt: ${sourceCounts.updatedAt || "unknown"}`);
  console.log(`[Today In Golf] Source items loaded: ${sourceCounts.total} ${JSON.stringify(sourceCounts.groups)}`);
  console.log(`[Today In Golf] Story pool size after filtering/dedupe: ${storyPool.length}`);
  console.log(`[Today In Golf] Stories selected for ${edition}: ${storiesForEdition.length}`);
  console.log("[Today In Golf] Top selected candidate stories:");
  storiesForEdition.slice(0, 8).forEach((item, index) => {
    console.log(`[Today In Golf] Candidate ${index + 1}: ${JSON.stringify(summarizeStoryForLog(item))}`);
  });
}

function runTodayInGolfInputsDryRun({ radarData, edition, storyPool, storiesForEdition }) {
  const currentTournamentStates = getCurrentTournamentStates(storiesForEdition);
  const promptStories = storiesForEdition.map(simplifyStoryForPrompt);

  console.log(`[Today In Golf] DRY_RUN_TODAY_IN_GOLF_INPUTS=true. OpenAI call skipped.`);
  console.log(`[Today In Golf] Prompt story count: ${promptStories.length}`);
  console.log(JSON.stringify({
    edition,
    label: getLabel(edition),
    currentEasternTime: getETParts(),
    currentTournamentStates,
    stories: promptStories.slice(0, 8)
  }, null, 2));
}

function runOpenAIConfigDryRun({ stories, systemPrompt, userPrompt, requestBody }) {
  console.log("[Today In Golf] DRY_RUN_OPENAI_CONFIG=true. OpenAI call skipped.");
  console.log(JSON.stringify({
    openaiApiKeyPresent: Boolean(OPENAI_API_KEY),
    model: OPENAI_MODEL,
    endpoint: OPENAI_ENDPOINT,
    timeoutMs: OPENAI_TIMEOUT_MS,
    requestBodyCanBeBuilt: Boolean(requestBody),
    candidateCount: stories.length,
    promptCharacterCount: systemPrompt.length + userPrompt.length,
    systemPromptCharacterCount: systemPrompt.length,
    userPromptCharacterCount: userPrompt.length,
    requestBodyCharacterCount: JSON.stringify(requestBody).length,
    sourcePayloadCount: stories.length
  }, null, 2));
}

function buildOutput({ edition, items, now = new Date(), metadata = {} }) {
  const nowIso = now.toISOString();

  return {
    active: true,
    lastUpdated: nowIso,
    edition,
    label: normalizeDisplayText(getDisplayLabel(edition, Boolean(metadata.usedFallback))),
    title: normalizeDisplayText(TODAY_IN_GOLF_TITLE),
    summary: normalizeDisplayText(TODAY_IN_GOLF_SUMMARY),
    items,
    itemsLastUpdated: metadata.itemsLastUpdated || nowIso,
    itemsEdition: metadata.itemsEdition || edition,
    usedFallback: Boolean(metadata.usedFallback),
    fallbackReason: metadata.fallbackReason || "",
    fallbackStage: metadata.fallbackStage || "",
    lastSuccessfulStoryUpdate: metadata.lastSuccessfulStoryUpdate || nowIso,
    itemsChanged: metadata.itemsChanged !== undefined ? Boolean(metadata.itemsChanged) : true,
    sourceItemsLoaded: metadata.sourceItemsLoaded ?? null,
    candidateItemsSelected: metadata.candidateItemsSelected ?? null,
    openaiAttempted: metadata.openaiAttempted ?? false,
    openaiOutputLength: metadata.openaiOutputLength ?? null,
    openaiStatusCode: metadata.openaiStatusCode ?? null,
    openaiErrorType: metadata.openaiErrorType || "",
    openaiErrorCode: metadata.openaiErrorCode || "",
    openaiErrorMessageShort: metadata.openaiErrorMessageShort || "",
    openaiResponseBodyPreview: metadata.openaiResponseBodyPreview || "",
    openaiModel: metadata.openaiModel || OPENAI_MODEL,
    openaiEndpoint: metadata.openaiEndpoint || OPENAI_ENDPOINT,
    openaiRequestId: metadata.openaiRequestId || "",
    openaiRetryable: metadata.openaiRetryable ?? null,
    openaiFailureAt: metadata.openaiFailureAt || "",
    generatedItemsCount: metadata.generatedItemsCount ?? null,
    cleanedItemsCount: metadata.cleanedItemsCount ?? null,
    rejectedItemsCount: metadata.rejectedItemsCount ?? null,
    rejectedReasons: Array.isArray(metadata.rejectedReasons) ? metadata.rejectedReasons.slice(0, 5) : [],
    diagnosticUpdatedAt: metadata.diagnosticUpdatedAt || nowIso,
    url: "https://www.morningtee.com/search",
    cta: normalizeDisplayText(TODAY_IN_GOLF_CTA)
  };
}

function normalizeFallbackDetails(reasonOrDetails, defaultStage = "unknown") {
  if (typeof reasonOrDetails === "object" && reasonOrDetails) {
    return {
      reason: reasonOrDetails.reason || "unknown_fallback",
      stage: reasonOrDetails.stage || defaultStage
    };
  }

  return {
    reason: reasonOrDetails || "unknown_fallback",
    stage: defaultStage
  };
}

function updateEditionMetadataOnly(currentTodayJson, edition, reasonOrDetails) {
  const fallbackDetails = normalizeFallbackDetails(reasonOrDetails);

  if (!hasReusableBriefingItems(currentTodayJson)) {
    console.log(`[Today In Golf] ${fallbackDetails.reason}. No reusable briefing items found. Keeping existing today-in-golf.json.`);
    return false;
  }

  const output = buildOutput({
    edition,
    items: currentTodayJson.items,
    metadata: {
      itemsLastUpdated: getPreviousItemsLastUpdated(currentTodayJson),
      itemsEdition: getPreviousItemsEdition(currentTodayJson),
      usedFallback: true,
      fallbackReason: fallbackDetails.reason,
      fallbackStage: fallbackDetails.stage,
      lastSuccessfulStoryUpdate: currentTodayJson?.lastSuccessfulStoryUpdate || getPreviousItemsLastUpdated(currentTodayJson),
      itemsChanged: false,
      ...lastRunDiagnostics
    }
  });

  writeJson(TODAY_PATH, output);

  console.warn(`[Today In Golf] Fallback used: ${fallbackDetails.reason}. Updated edition metadata only for ${edition}.`);
  console.warn(`[Today In Golf] Fallback stage: ${fallbackDetails.stage}.`);
  console.warn(`[Today In Golf] Items carried from ${output.itemsEdition || "unknown edition"} at ${output.itemsLastUpdated || "unknown time"}.`);
  console.log("[Today In Golf] Output status: metadata_only");
  console.log("[Today In Golf] Repository change expected: yes");
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

function hasFinalResultSignal(value) {
  const text = String(value || "").toLowerCase();
  return /\b(wins?|won|victory|winner|champion|title|final result|final leaderboard|final round|official result|completed?|concluded)\b/i.test(text);
}

function hasExplicitWinSignal(value) {
  const text = String(value || "").toLowerCase();
  return /\b(wins?|won|victory|winner|champion|title)\b/i.test(text);
}

function hasLiveTournamentWording(value) {
  const text = String(value || "").toLowerCase();
  return /\b(leads?|leading|holds? the lead|holds? lead|takes? the lead|takes? lead|sits atop|currently|live|projected|through \d+ holes?|after round [123])\b/i.test(text);
}

function hasLiveFinalContradiction(item) {
  const text = `${item?.headline || ""} ${item?.text || ""}`;
  return hasLiveTournamentWording(text) && hasFinalResultSignal(text);
}

function replaceFinalResultLiveWording(value, combinedText) {
  if (!hasExplicitWinSignal(combinedText)) return String(value || "");

  return String(value || "")
    .replace(/\btakes the lead\b/gi, "wins")
    .replace(/\btakes lead\b/gi, "wins")
    .replace(/\btook the lead\b/gi, "won")
    .replace(/\bholds the lead\b/gi, "wins")
    .replace(/\bholds lead\b/gi, "wins")
    .replace(/\bheld the lead\b/gi, "won")
    .replace(/\bheld lead\b/gi, "won")
    .replace(/\bleads\b/gi, "wins")
    .replace(/\bleading\b/gi, "winning");
}

function sanitizeLiveFinalContradiction(item) {
  const combinedText = `${item?.headline || ""} ${item?.text || ""}`;
  if (!hasLiveFinalContradiction(item)) return item;
  if (!hasExplicitWinSignal(combinedText)) return null;

  const cleanedItem = {
    headline: cleanGeneratedText(replaceFinalResultLiveWording(item.headline, combinedText)),
    text: cleanGeneratedText(replaceFinalResultLiveWording(item.text, combinedText))
  };

  return hasLiveFinalContradiction(cleanedItem) ? null : cleanedItem;
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

function getLowValueBriefingReason(item) {
  const text = `${item?.headline || ""} ${item?.text || ""}`.toLowerCase();

  const lowValueReasons = [
    ["reddit", /\breddit\b/],
    ["r/golf", /\br\/golf\b/],
    ["hot dog", /\bhot dog\b/],
    ["meme", /\bmeme\b/],
    ["viral joke", /\bviral joke\b/],
    ["bunker debate", /\bbunker debate\b/],
    ["biggest bunker", /\bbiggest bunker\b/],
    ["sand area", /\bsand area\b/],
    ["waste area", /\bwaste area\b/],
    ["food post", /\bfood post\b/],
    ["golf internet", /\bgolf internet\b/]
  ];

  const match = lowValueReasons.find(([, pattern]) => pattern.test(text));
  return match ? match[0] : "";
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

function analyzeGeneratedItems(items) {
  if (!Array.isArray(items)) {
    return {
      cleanedItems: [],
      rejectedItems: [{ reason: "generated items was not an array" }]
    };
  }

  const usedTopics = new Set();
  const cleanedItems = [];
  const rejectedItems = [];

  items.forEach((item) => {
    if (!item || !item.headline || !item.text) {
      rejectedItems.push({
        reason: "missing headline or text",
        item
      });
      return;
    }

    const lowValueReason = getLowValueBriefingReason(item);
    if (lowValueReason) {
      rejectedItems.push({
        reason: `low-value briefing item: ${lowValueReason}`,
        item
      });
      return;
    }

    let cleanedItem = {
      headline: cleanGeneratedText(item.headline),
      text: cleanGeneratedText(item.text)
    };

    if (hasLiveFinalContradiction(cleanedItem)) {
      const sanitizedItem = sanitizeLiveFinalContradiction(cleanedItem);

      if (!sanitizedItem) {
        rejectedItems.push({
          reason: "live_final_contradiction",
          item: cleanedItem
        });
        return;
      }

      cleanedItem = sanitizedItem;
    }

    const topicKey = getBriefingTopicKey(cleanedItem);
    if (topicKey && usedTopics.has(topicKey)) {
      rejectedItems.push({
        reason: `duplicate topic: ${topicKey}`,
        item: cleanedItem
      });
      return;
    }

    if (topicKey) usedTopics.add(topicKey);

    if (cleanedItems.length < 4) {
      cleanedItems.push(cleanedItem);
    } else {
      rejectedItems.push({
        reason: "over max item count",
        item: cleanedItem
      });
    }
  });

  return {
    cleanedItems,
    rejectedItems
  };
}

function cleanGeneratedItems(items) {
  return analyzeGeneratedItems(items).cleanedItems;
}

function runLiveFinalContradictionTest() {
  const generatedItems = [
    {
      headline: "Koivun leads 3M Open",
      text: "Jackson Koivun leads the 3M Open with a tournament record 25-under par, shooting 5-under 66 on Sunday for his first PGA Tour victory in just his 13th start."
    }
  ];
  const analysis = analyzeGeneratedItems(generatedItems);
  const cleanedItem = analysis.cleanedItems[0];
  const combinedText = `${cleanedItem?.headline || ""} ${cleanedItem?.text || ""}`.toLowerCase();

  console.log(JSON.stringify({
    cleanedItems: analysis.cleanedItems,
    rejectedItems: analysis.rejectedItems
  }, null, 2));

  if (!cleanedItem) {
    throw new Error("Expected Koivun contradiction item to be safely cleaned.");
  }

  if (/\bleads?\b|\bleading\b/.test(combinedText)) {
    throw new Error("Expected cleaned Koivun item to avoid live lead wording.");
  }

  if (!/\bwins?\b|\bwon\b|\bvictory\b/.test(combinedText)) {
    throw new Error("Expected cleaned Koivun item to keep final-result wording.");
  }

  console.log("[Today In Golf] live/final contradiction test passed.");
}

async function generateBriefing(stories, edition) {
  const label = getLabel(edition);
  const currentTournamentStates = getCurrentTournamentStates(stories);
  lastGenerationFailureReason = "";
  lastGenerationFailureStage = "";

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
- Do not use live or in-progress phrasing for completed tournaments.
- If a source says someone won, do not write that they "lead."
- If the story contains "victory," "wins," "won," "champion," "title," or "final," use final-result language instead of live-leader language.
- Avoid contradictions like "leads" plus "victory" in the same item.
- Prefer concise final-result headlines for completed tournaments, such as "Koivun wins 3M Open" or "Koivun claims first PGA Tour win," only when the source clearly supports the win.

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

  const requestBody = {
    model: OPENAI_MODEL,
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
  };

  if (DRY_RUN_OPENAI_CONFIG) {
    runOpenAIConfigDryRun({
      stories,
      systemPrompt,
      userPrompt,
      requestBody
    });
    return null;
  }

  let response = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`[Today In Golf] OpenAI attempt ${attempt} starting. Candidate stories: ${stories.length}.`);
    updateDiagnosticMetadata({
      openaiAttempted: true,
      openaiModel: OPENAI_MODEL,
      openaiEndpoint: OPENAI_ENDPOINT
    });

    try {
      response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      lastGenerationFailureReason = "openai_request_failed";
      lastGenerationFailureStage = "openai_request";
      recordOpenAINetworkFailure(error, attempt);
      console.warn(`[Today In Golf] OpenAI attempt ${attempt} failed before response: ${sanitizeDiagnosticText(error?.message || error, 180)}`);

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }

      continue;
    }

    if (response.ok) {
      updateDiagnosticMetadata({
        openaiStatusCode: response.status,
        openaiErrorType: "",
        openaiErrorCode: "",
        openaiErrorMessageShort: "",
        openaiResponseBodyPreview: "",
        openaiRequestId: sanitizeDiagnosticText(response.headers.get("x-request-id") || response.headers.get("request-id") || "", 80),
        openaiRetryable: null,
        openaiFailureAt: ""
      });
      break;
    }

    const errorText = await response.text();
    lastGenerationFailureReason = "openai_request_failed";
    lastGenerationFailureStage = "openai_request";
    recordOpenAIResponseFailure(response, errorText, attempt);
    console.warn(`[Today In Golf] OpenAI attempt ${attempt} failed: ${response.status} ${sanitizeDiagnosticText(errorText, 180)}`);

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  if (!response || !response.ok) {
    lastGenerationFailureReason = lastGenerationFailureReason || "openai_request_failed";
    lastGenerationFailureStage = lastGenerationFailureStage || "openai_request";
    console.warn("[Today In Golf] OpenAI failed after 3 attempts. Keeping existing briefing.");
    return null;
  }

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    lastGenerationFailureReason = "openai_json_parse_failed";
    lastGenerationFailureStage = "openai_response";
    console.warn(`[Today In Golf] OpenAI response JSON parse failed: ${error.message}`);
    return null;
  }

  const outputText =
    result.output_text ||
    result.output?.flatMap((item) => item.content || [])
      ?.find((content) => content.type === "output_text")?.text;

  if (!outputText) {
    lastGenerationFailureReason = "openai_empty_output";
    lastGenerationFailureStage = "openai_response";
    updateDiagnosticMetadata({ openaiOutputLength: 0 });
    console.warn("[Today In Golf] No output text returned from OpenAI. Keeping existing briefing.");
    return null;
  }

  updateDiagnosticMetadata({ openaiOutputLength: outputText.length });
  console.log(`[Today In Golf] OpenAI output text length: ${outputText.length}`);

  try {
    return JSON.parse(outputText);
  } catch (error) {
    lastGenerationFailureReason = "openai_json_parse_failed";
    lastGenerationFailureStage = "openai_parse";
    console.warn(`[Today In Golf] OpenAI output JSON parse failed: ${error.message}`);
    console.warn(`[Today In Golf] Output preview: ${outputText.slice(0, 500)}`);
    return null;
  }
}

async function main() {
  if (TEST_LIVE_FINAL_CONTRADICTION) {
    runLiveFinalContradictionTest();
    return;
  }

  if (DRY_RUN_EDITION_LABELS) {
    runEditionLabelDryRun();
    return;
  }

  const radarData = readJson(RADAR_PATH, {});
  const currentTodayJson = readJson(TODAY_PATH, null);
  const et = getETParts();
  const scheduledEditionDetails = getScheduledEditionDetails();

  console.log(`[Today In Golf] Trigger: ${GITHUB_EVENT_NAME || "local"}`);
  console.log(`[Today In Golf] UTC run time: ${new Date().toISOString()}`);
  console.log(`[Today In Golf] Current ET: ${et.dateKey} ${String(et.hour).padStart(2, "0")}:${String(et.minute).padStart(2, "0")}`);
  console.log(`[Today In Golf] Current ET window edition: ${getCurrentWindowEdition() || "none"}`);
  console.log(`[Today In Golf] MANUAL_EDITION=${MANUAL_EDITION}`);
  console.log(`[Today In Golf] FORCE_RUN=${FORCE_RUN}`);
  console.log(`[Today In Golf] OPENAI_API_KEY present: ${OPENAI_API_KEY ? "yes" : "no"}`);
  if (scheduledEditionDetails.schedule) {
    console.log(`[Today In Golf] GitHub schedule: ${scheduledEditionDetails.schedule}`);
    console.log(`[Today In Golf] Scheduled edition: ${scheduledEditionDetails.edition || "unmapped"}`);
  }

  let edition = getEditionNow(currentTodayJson);

  if (!edition && FORCE_RUN) {
    edition = isValidEdition(MANUAL_EDITION) ? MANUAL_EDITION : getMostRecentEligibleEdition();
    console.log(`[Today In Golf] Force run edition resolved to: ${edition || "none"}`);
  }

  if (!edition) {
    console.log("No eligible Today In Golf edition window found. Skipping.");
    console.log("[Today In Golf] Output status: skipped");
    console.log("[Today In Golf] Repository change expected: no");
    return;
  }

  if (!FORCE_RUN && hasAlreadyRun(currentTodayJson, edition)) {
    console.log(`Today In Golf already generated for ${edition} today. Skipping.`);
    console.log("[Today In Golf] Output status: skipped_duplicate");
    console.log("[Today In Golf] Repository change expected: no");
    return;
  }

  const storyPool = buildStoryPool(radarData);
  const storiesForEdition = filterStoriesForEdition(storyPool, edition);
  logStoryDiagnostics({ radarData, storyPool, storiesForEdition, edition });

  if (DRY_RUN_TODAY_IN_GOLF_INPUTS) {
    runTodayInGolfInputsDryRun({ radarData, edition, storyPool, storiesForEdition });
    return;
  }

  if (DRY_RUN_OPENAI_CONFIG) {
    await generateBriefing(storiesForEdition, edition);
    return;
  }

  if (!OPENAI_API_KEY) {
    updateEditionMetadataOnly(currentTodayJson, edition, {
      reason: "missing_openai_api_key",
      stage: "configuration"
    });
    return;
  }

  if (SIMULATE_TODAY_IN_GOLF_FALLBACK) {
    updateEditionMetadataOnly(currentTodayJson, edition, {
      reason: "simulated_fallback",
      stage: "simulation"
    });
    return;
  }

  if (!storiesForEdition.length) {
    updateEditionMetadataOnly(currentTodayJson, edition, {
      reason: "no_source_candidates",
      stage: "source_selection"
    });
    return;
  }

  const generated = await generateBriefing(storiesForEdition, edition);

  if (!generated) {
    updateEditionMetadataOnly(currentTodayJson, edition, {
      reason: lastGenerationFailureReason || "unknown_fallback",
      stage: lastGenerationFailureStage || "generation"
    });
    return;
  }

  const generatedAnalysis = analyzeGeneratedItems(generated.items);
  const cleanedItems = generatedAnalysis.cleanedItems;
  const generatedItemsCount = Array.isArray(generated.items) ? generated.items.length : 0;
  const rejectedReasons = summarizeRejectedReasons(generatedAnalysis.rejectedItems);
  updateDiagnosticMetadata({
    generatedItemsCount,
    cleanedItemsCount: cleanedItems.length,
    rejectedItemsCount: generatedAnalysis.rejectedItems.length,
    rejectedReasons
  });
  console.log(`[Today In Golf] Generated item count before cleaning: ${Array.isArray(generated.items) ? generated.items.length : 0}`);
  console.log(`[Today In Golf] Cleaned usable item count: ${cleanedItems.length}`);
  console.log(`[Today In Golf] Cleaned items match existing exactly: ${haveBriefingItemsChanged(cleanedItems, currentTodayJson?.items) ? "no" : "yes"}`);
  console.log(`[Today In Golf] Generated item headlines: ${JSON.stringify(Array.isArray(generated.items) ? generated.items.map((item) => item?.headline || "") : [])}`);
  console.log(`[Today In Golf] Cleaned item headlines: ${JSON.stringify(cleanedItems.map((item) => item.headline))}`);

  if (generatedAnalysis.rejectedItems.length) {
    console.log(`[Today In Golf] Rejected generated items: ${JSON.stringify(generatedAnalysis.rejectedItems)}`);
  }

  if (cleanedItems.length < 2) {
    let fallbackReason = "generated_items_rejected";

    if (generatedItemsCount === 0) {
      fallbackReason = "generated_items_empty";
    } else if (cleanedItems.length === 0) {
      fallbackReason = "cleaned_items_empty";
    }

    updateEditionMetadataOnly(currentTodayJson, edition, {
      reason: fallbackReason,
      stage: "item_cleaning"
    });
    return;
  }

  const now = new Date();
  const itemsChanged = haveBriefingItemsChanged(cleanedItems, currentTodayJson?.items);

  if (!itemsChanged) {
    updateEditionMetadataOnly(currentTodayJson, edition, {
      reason: "generated_items_same_as_existing",
      stage: "item_compare"
    });
    return;
  }

  const output = buildOutput({
    edition,
    items: cleanedItems,
    now,
    metadata: {
      itemsLastUpdated: itemsChanged ? now.toISOString() : getPreviousItemsLastUpdated(currentTodayJson),
      itemsEdition: itemsChanged ? edition : getPreviousItemsEdition(currentTodayJson),
      usedFallback: false,
      fallbackReason: "",
      fallbackStage: "",
      lastSuccessfulStoryUpdate: now.toISOString(),
      itemsChanged,
      ...lastRunDiagnostics
    }
  });

  writeJson(TODAY_PATH, output);

  console.log(`Updated ${TODAY_PATH} for ${edition}`);
  console.log(`[Today In Golf] Items changed: ${itemsChanged ? "yes" : "no"}`);
  console.log("[Today In Golf] Output status: updated");
  console.log("[Today In Golf] Repository change expected: yes");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
