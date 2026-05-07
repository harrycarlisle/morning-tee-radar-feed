const fs = require("fs");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const AUTO_PUBLISH = process.env.AUTO_PUBLISH === "true";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_RADAR_PATH = process.env.GITHUB_RADAR_PATH || "latest-radar.json";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "live-golf-data.p.rapidapi.com";
const PGA_ORG_ID = "1";
const LIVE_GOLF_YEAR = new Date().getFullYear().toString();

const SEEN_FILE = "seen-posts.json";

const REDDIT_SOURCES = [
  { name: "r/golf", subreddit: "golf" },
  { name: "r/progolf", subreddit: "progolf" }
];

const RSS_FEEDS = [
  {
    name: "Yahoo Golf",
    url: "https://sports.yahoo.com/golf/rss/"
  }
];

function isTournamentWindow() {
  const day = new Date().getDay();
  return day === 0 || day === 4 || day === 5 || day === 6;
}

const TOURNAMENT_TERMS = [
  "leaderboard",
  "leads",
  "lead",
  "tee time",
  "tee times",
  "round 1",
  "round 2",
  "round 3",
  "final round",
  "featured group",
  "featured groups",
  "withdraw",
  "withdrawal",
  "injury",
  "penalty",
  "rules",
  "ace",
  "hole-in-one",
  "eagle",
  "birdie",
  "playoff",
  "cut line",
  "missed cut",
  "wins",
  "winner",
  "truist",
  "pga championship",
  "us open",
  "u.s. open",
  "the open",
  "masters",
  "players championship",
  "lpga",
  "dp world tour",
  "liv golf"
];

const IMPORTANT_TERMS = [
  "tiger",
  "woods",
  "rory",
  "mcIlroy",
  "scheffler",
  "bryson",
  "dechambeau",
  "rahm",
  "spieth",
  "morikawa",
  "hovland",
  "koepka",
  "mickelson",
  "nelly korda",
  "charley hull",
  "liv",
  "pga tour",
  "dp world tour",
  "ryder cup",
  "presidents cup",
  "masters",
  "us open",
  "u.s. open",
  "the open",
  "open championship",
  "pga championship",
  "players championship",
  "truist",
  "genesis",
  "pebble beach",
  "waste management",
  "wm phoenix",
  "netflix",
  "full swing",
  "youtube",
  "good good",
  "bob does sports",
  "grant horvat",
  "rick shiels",
  "viral",
  "controversy",
  "rules",
  "penalty",
  "suspended",
  "lawsuit",
  "merger",
  "deal",
  "contract",
  "retire",
  "retirement",
  "injury",
  "withdraw",
  "withdrawal",
  "ace",
  "hole-in-one",
  "record",
  "wins",
  "winner",
  "odds",
  "tee times",
  "featured group"
];

const IGNORE_TERMS = [
  "rate my",
  "what club",
  "swing advice",
  "new clubs",
  "bag setup",
  "beginner clubs",
  "handicap question",
  "odds",
  "picks",
  "predictions",
  "betting",
  "wager",
  "sportsbook",
  "favorite",
  "favorites"
];

function loadSeenPosts() {
  if (!fs.existsSync(SEEN_FILE)) {
    return new Set();
  }

  try {
    const data = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
    return new Set(data);
  } catch (error) {
    console.error("Could not read seen-posts.json. Starting fresh.", error);
    return new Set();
  }
}

function saveSeenPosts(seenPosts) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenPosts], null, 2));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtml(value).replace(/<[^>]*>/g, "").trim();
}

function getTag(itemXml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = itemXml.match(regex);
  return match ? decodeHtml(match[1]).trim() : "";
}

function parseRss(xml, sourceName) {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return itemMatches.map((itemXml) => {
    const title = stripHtml(getTag(itemXml, "title"));
    const link = stripHtml(getTag(itemXml, "link"));
    const description = stripHtml(getTag(itemXml, "description"));
    const pubDate = stripHtml(getTag(itemXml, "pubDate"));
    const guid = stripHtml(getTag(itemXml, "guid")) || link || title;

    return {
      id: `rss:${sourceName}:${guid}`,
      sourceType: "RSS",
      sourceName,
      title,
      summary: description,
      url: link,
      publishedAt: pubDate ? new Date(pubDate) : null
    };
  });
}

function includesAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function getMatchedTerms(text) {
  const lower = String(text || "").toLowerCase();

  return IMPORTANT_TERMS.filter((term) => {
    return lower.includes(term.toLowerCase());
  }).slice(0, 5);
}

function isIgnored(text) {
  return includesAny(text, IGNORE_TERMS);
}

function getTournamentScoreBoost(item) {
  if (!isTournamentWindow()) return 0;

  const text = `${item.title} ${item.summary || ""}`.toLowerCase();
  let boost = 0;

  TOURNAMENT_TERMS.forEach((term) => {
    if (text.includes(term.toLowerCase())) {
      boost += 8;
    }
  });

  const bigNames = [
    "rory",
    "mcIlroy",
    "scheffler",
    "bryson",
    "dechambeau",
    "rahm",
    "koepka",
    "morikawa",
    "spieth",
    "hovland",
    "xander",
    "schauffele",
    "justin thomas",
    "tiger",
    "nelly korda"
  ];

  bigNames.forEach((name) => {
    if (text.includes(name.toLowerCase())) {
      boost += 8;
    }
  });

  return Math.min(boost, 45);
}

function scoreNewsItem(item) {
  if (item.sourceType === "Leaderboard") {
    return {
      score: 999,
      matchedTerms: ["leaderboard"],
      tournamentBoost: 45
    };
  }

  const text = `${item.title} ${item.summary || ""}`;
  const matchedTerms = getMatchedTerms(text);

  let score = matchedTerms.length * 10;
  const title = item.title.toLowerCase();

  if (title.includes("liv")) score += 15;
  if (title.includes("rory")) score += 12;
  if (title.includes("tiger")) score += 12;
  if (title.includes("bryson")) score += 12;
  if (title.includes("scheffler")) score += 12;
  if (title.includes("rahm")) score += 12;
  if (title.includes("breaking")) score += 10;
  if (title.includes("retire") || title.includes("retirement")) score += 10;
  if (title.includes("withdraw") || title.includes("injury")) score += 10;
  if (title.includes("tee time") || title.includes("featured group")) score += 6;

  if (item.sourceType === "Reddit" && item.reddit) {
    if (item.reddit.upvotesPerHour >= 100) score += 20;
    if (item.reddit.upvotesPerHour >= 50) score += 12;
    if (item.reddit.comments >= 50) score += 10;
    if (item.reddit.ups >= 250) score += 10;
  }

  const tournamentBoost = getTournamentScoreBoost(item);
  score += tournamentBoost;

  return {
    score,
    matchedTerms,
    tournamentBoost
  };
}

function getAgeHoursFromDate(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return (Date.now() - date.getTime()) / 3600000;
}

function inferCategory(item) {
  const text = `${item.title} ${item.summary || ""} ${item.sourceName || ""}`.toLowerCase();

  if (item.sourceType === "Leaderboard") return "PGA TOUR";

  if (
    text.includes("youtube") ||
    text.includes("rick shiels") ||
    text.includes("bob does sports") ||
    text.includes("grant horvat")
  ) {
    return "YOUTUBE";
  }

  if (text.includes("liv")) return "LIV";
  if (text.includes("dp world")) return "DP TOUR";
  if (text.includes("japan")) return "JAPAN TOUR";
  if (text.includes("lpga") || text.includes("nelly korda")) return "LPGA";

  if (
    text.includes("pga tour") ||
    text.includes("truist") ||
    text.includes("rory") ||
    text.includes("scheffler") ||
    text.includes("brooks koepka")
  ) {
    return "PGA TOUR";
  }

  if (item.sourceType === "Reddit") return "GOLF INTERNET";

  return "GOLF";
}

function cleanTitle(title) {
  return String(title || "Untitled radar item").trim();
}

function cleanSummary(item) {
  const title = String(item.title || "");
  const summary = String(item.summary || "");

  if (item.sourceType === "Leaderboard") {
    return summary || "The live leaderboard is moving.";
  }

  if (item.sourceType === "Reddit") {
    return summary || "A golf post is picking up attention online.";
  }

  const clean = summary
    .replace(/\s+/g, " ")
    .replace(/^with\s+\d+\.?$/i, "")
    .replace(/^watch:?$/i, "")
    .replace(/^read more\.?$/i, "")
    .replace(/^click here.*$/i, "")
    .replace(/^subscribe.*$/i, "")
    .trim();

  const badSummary =
    !clean ||
    clean.length < 40 ||
    clean.toLowerCase() === title.toLowerCase() ||
    /^with\s+\d+\.?$/i.test(clean);

  if (badSummary) {
    return isTournamentWindow()
      ? "A tournament-week golf story is moving across the radar."
      : "A golf story is picking up attention across the golf news cycle.";
  }

  const firstSentence = clean.match(/^.*?[.!?](\s|$)/);
  const sentence = firstSentence ? firstSentence[0].trim() : clean;

  return sentence.length > 190 ? `${sentence.slice(0, 187)}...` : sentence;
}

function buildRadarItem(item) {
  return {
    time: "Just now",
    status: item.sourceType === "Leaderboard" ? "Live" : item.sourceType === "RSS" ? "Confirmed" : "Trending",
    signal: item.sourceType,
    category: inferCategory(item),
    title: cleanTitle(item.title),
    summary: cleanSummary(item),
    url: item.url,
    source: item.sourceName
  };
}

function buildCheckingItem(item) {
  return {
    status: "Verifying",
    signal: item.sourceType || "Radar",
    category: inferCategory(item),
    title: cleanTitle(item.title),
    summary: cleanSummary(item),
    url: item.url,
    source: item.sourceName
  };
}

async function sendDiscordAlert(item, published) {
  const matchedTermsText = item.matchedTerms && item.matchedTerms.length
    ? item.matchedTerms.join(", ")
    : "General golf signal";

  const ageText = item.ageHours !== null && item.ageHours !== undefined
    ? `${item.ageHours.toFixed(1)} hours old`
    : "Age unknown";

  const tournamentLabel = isTournamentWindow()
    ? `Tournament window: Yes, boost +${item.tournamentBoost || 0}`
    : "Tournament window: No";

  const publishLabel = published
    ? "Published to site: Yes"
    : `Published to site: ${AUTO_PUBLISH ? "Attempted but failed/skipped" : "No, alert only"}`;

  const message = {
    username: "Morning Tee Radar",
    content: `🚨 Morning Tee Radar

**${item.title}**

Source: ${item.sourceName}
Type: ${item.sourceType}
Age: ${ageText}
Score: ${item.score}
${tournamentLabel}
${publishLabel}
Signal: ${matchedTermsText}

${item.summary ? item.summary.slice(0, 280) : ""}

Link:
${item.url}`
  };

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}

async function fetchRedditItems() {
  const allItems = [];

  for (const source of REDDIT_SOURCES) {
    try {
      const response = await fetch(`https://www.reddit.com/r/${source.subreddit}/hot.json?limit=25`, {
        headers: {
          "User-Agent": "MorningTeeRadar/0.2 by Morning Tee"
        }
      });

      if (!response.ok) {
        throw new Error(`${source.name} request failed: ${response.status}`);
      }

      const data = await response.json();
      const posts = data.data.children.map((item) => item.data);

      const mappedPosts = posts.map((post) => {
        const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
        const upvotesPerHour = post.ups / Math.max(ageHours, 0.25);

        return {
          id: `reddit:${source.subreddit}:${post.id}`,
          sourceType: "Reddit",
          sourceName: source.name,
          title: post.title,
          summary: `${post.ups} upvotes · ${post.num_comments} comments · ${Math.round(upvotesPerHour)} upvotes/hour`,
          url: `https://reddit.com${post.permalink}`,
          ageHours,
          reddit: {
            ups: post.ups,
            comments: post.num_comments,
            upvotesPerHour
          }
        };
      });

      allItems.push(...mappedPosts);
    } catch (error) {
      console.error(`[Reddit] ${source.name} failed`, error);
    }
  }

  return allItems;
}

async function fetchRssItems() {
  const allItems = [];

  for (const feed of RSS_FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          "User-Agent": "MorningTeeRadar/0.2 by Morning Tee"
        }
      });

      if (!response.ok) {
        throw new Error(`${feed.name} RSS failed: ${response.status}`);
      }

      const xml = await response.text();
      const items = parseRss(xml, feed.name);

      for (const item of items) {
        const ageHours = getAgeHoursFromDate(item.publishedAt);

        allItems.push({
          ...item,
          ageHours
        });
      }
    } catch (error) {
      console.error(`[RSS] ${feed.name} failed`, error);
    }
  }

  return allItems;
}

function getEasternNowParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

function shouldCheckLeaderboardNow() {
  if (!RAPIDAPI_KEY) return false;

  const { weekday, minute } = getEasternNowParts();

  if (minute !== 0) return false;

  return ["Thu", "Fri", "Sat", "Sun"].includes(weekday);
}

function rapidApiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-rapidapi-host": RAPIDAPI_HOST,
    "x-rapidapi-key": RAPIDAPI_KEY
  };
}

async function fetchCurrentTournament() {
  const url = `https://${RAPIDAPI_HOST}/schedule?orgId=${PGA_ORG_ID}&year=${LIVE_GOLF_YEAR}`;

  const response = await fetch(url, {
    method: "GET",
    headers: rapidApiHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Schedule request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const schedule = Array.isArray(data.schedule) ? data.schedule : [];
  const now = new Date();

  const currentEvents = schedule.filter((event) => {
    const start = new Date(event.date?.start);
    const end = new Date(event.date?.end);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }

    const endPlusOneDay = new Date(end);
    endPlusOneDay.setUTCDate(endPlusOneDay.getUTCDate() + 1);

    return now >= start && now < endPlusOneDay;
  });

  if (!currentEvents.length) return null;

  const strokeEvents = currentEvents.filter((event) => event.format === "stroke");
  const candidates = strokeEvents.length ? strokeEvents : currentEvents;

  return candidates.sort((a, b) => {
    const purseA = Number(a.purse || 0);
    const purseB = Number(b.purse || 0);
    const fedexA = Number(a.fedexCupPoints || 0);
    const fedexB = Number(b.fedexCupPoints || 0);

    return (purseB + fedexB * 10000) - (purseA + fedexA * 10000);
  })[0];
}

async function fetchLeaderboardForTournament(tournament) {
  const url = `https://${RAPIDAPI_HOST}/leaderboard?orgId=${PGA_ORG_ID}&tournId=${tournament.tournId}&year=${LIVE_GOLF_YEAR}`;

  const response = await fetch(url, {
    method: "GET",
    headers: rapidApiHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Leaderboard request failed: ${response.status} ${body}`);
  }

  return response.json();
}

function playerName(row) {
  return `${row.firstName || ""} ${row.lastName || ""}`.trim();
}

function isActiveLeaderboardRow(row) {
  const status = String(row.status || "").toLowerCase();
  const position = String(row.position || "").toLowerCase();

  return (
    status !== "cut" &&
    status !== "wd" &&
    position !== "cut" &&
    position !== "wd" &&
    row.total &&
    row.position
  );
}

function positionNumber(position) {
  const value = Number(String(position || "").replace("T", ""));
  return Number.isNaN(value) ? 999 : value;
}

function buildLeaderboardItem(tournament, leaderboardData) {
  const rows = Array.isArray(leaderboardData.leaderboardRows)
    ? leaderboardData.leaderboardRows.filter(isActiveLeaderboardRow)
    : [];

  if (!rows.length) return null;

  const sorted = rows.slice().sort((a, b) => {
    return positionNumber(a.position) - positionNumber(b.position);
  });

  const leader = sorted[0];
  const chasers = sorted.slice(1, 4);

  const leaderName = playerName(leader);
  const leaderScore = leader.total || "";
  const thru = leader.thru && leader.thru !== "-" ? leader.thru : "the course";
  const today = leader.currentRoundScore && leader.currentRoundScore !== "-"
    ? leader.currentRoundScore
    : null;

  const chasersText = chasers.length
    ? `Closest chasers: ${chasers.map((row) => `${playerName(row)} (${row.total})`).join(", ")}.`
    : "";

  const todayText = today
    ? `${leaderName} is ${today} today and ${leaderScore} overall through ${thru}.`
    : `${leaderName} is ${leaderScore} overall through ${thru}.`;

  return {
    id: `leaderboard:${tournament.tournId}:${leader.playerId}:${leader.total}:${leader.thru}:${leader.currentRound}`,
    sourceType: "Leaderboard",
    sourceName: "Live Golf Data",
    title: `${leaderName} leads ${tournament.name} at ${leaderScore}`,
    summary: `${todayText} ${chasersText}`.trim(),
    url: "https://www.pgatour.com/leaderboard",
    ageHours: 0,
    score: 999,
    matchedTerms: ["leaderboard", tournament.name],
    tournamentBoost: 45
  };
}

async function fetchLeaderboardItems() {
  if (!shouldCheckLeaderboardNow()) {
    console.log("[Leaderboard] Skipped. Outside leaderboard check window.");
    return [];
  }

  try {
    const tournament = await fetchCurrentTournament();

    if (!tournament) {
      console.log("[Leaderboard] No current tournament found.");
      return [];
    }

    console.log(`[Leaderboard] Current tournament: ${tournament.name} (${tournament.tournId})`);

    const leaderboard = await fetchLeaderboardForTournament(tournament);
    const item = buildLeaderboardItem(tournament, leaderboard);

    return item ? [item] : [];
  } catch (error) {
    console.error("[Leaderboard] Failed", error);
    return [];
  }
}

function filterCandidates(items, seenPosts) {
  return items
    .map((item) => {
      const text = `${item.title} ${item.summary || ""}`;
      const scoring = scoreNewsItem(item);

      return {
        ...item,
        score: scoring.score,
        matchedTerms: scoring.matchedTerms,
        tournamentBoost: scoring.tournamentBoost,
        ignored: isIgnored(text)
      };
    })
    .filter((item) => {
      if (seenPosts.has(item.id)) return false;
      if (item.ignored) return false;

      if (item.sourceType === "Leaderboard") {
        return true;
      }

      if (item.sourceType === "Reddit") {
        const text = `${item.title} ${item.summary || ""}`.toLowerCase();

        const isVisualOrViral =
          text.includes("video") ||
          text.includes("clip") ||
          text.includes("photo") ||
          text.includes("pic") ||
          text.includes("image") ||
          text.includes("crazy") ||
          text.includes("insane") ||
          text.includes("wild");

        const strongGolfInternetPost =
          item.ageHours <= 8 &&
          item.reddit.ups >= 75 &&
          item.reddit.comments >= 10 &&
          item.reddit.upvotesPerHour >= 20;

        const veryStrongGeneralPost =
          item.ageHours <= 12 &&
          item.reddit.ups >= 250 &&
          item.reddit.comments >= 25 &&
          item.reddit.upvotesPerHour >= 25;

        return strongGolfInternetPost || (isVisualOrViral && veryStrongGeneralPost);
      }

      if (item.sourceType === "RSS") {
        const recentEnough = item.ageHours !== null && item.ageHours <= 12;
        const text = `${item.title} ${item.summary || ""}`.toLowerCase();

        const hasTournamentSignal = TOURNAMENT_TERMS.some((term) => {
          return text.includes(term.toLowerCase());
        });

        const hasBigBreakingSignal =
          text.includes("withdraw") ||
          text.includes("injury") ||
          text.includes("penalty") ||
          text.includes("rules") ||
          text.includes("breaking") ||
          text.includes("wins") ||
          text.includes("winner") ||
          text.includes("leads") ||
          text.includes("leaderboard");

        const isLivFutureTalk =
          text.includes("liv folds") ||
          text.includes("liv does fold") ||
          text.includes("if liv folds") ||
          text.includes("if liv golf folds") ||
          text.includes("liv folded") ||
          text.includes("liv future") ||
          text.includes("rejoin pga tour") ||
          text.includes("re-joining the pga tour") ||
          text.includes("rejoining the pga tour") ||
          text.includes("go back to the pga tour") ||
          text.includes("back to the pga tour") ||
          text.includes("return to the pga tour") ||
          text.includes("returning to the pga tour") ||
          text.includes("pga tour return") ||
          text.includes("pga tour comeback") ||
          text.includes("one big issue stopping him");

        const hasLivAndPgaReturnTalk =
          text.includes("liv") &&
          text.includes("pga tour") &&
          (
            text.includes("return") ||
            text.includes("rejoin") ||
            text.includes("re-join") ||
            text.includes("go back") ||
            text.includes("welcomed back") ||
            text.includes("welcome back") ||
            text.includes("fold")
          );

        if (isTournamentWindow()) {
          if ((isLivFutureTalk || hasLivAndPgaReturnTalk) && !hasBigBreakingSignal) {
            return false;
          }

          return recentEnough && item.score >= 45 && (hasTournamentSignal || hasBigBreakingSignal);
        }

        return recentEnough && item.score >= 55;
      }

      return false;
    })
    .sort((a, b) => b.score - a.score);
}

function githubHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

function requireGitHubConfig() {
  const missing = [];

  if (!GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!GITHUB_OWNER) missing.push("GITHUB_OWNER");
  if (!GITHUB_REPO) missing.push("GITHUB_REPO");

  if (missing.length) {
    throw new Error(`Missing GitHub config: ${missing.join(", ")}`);
  }
}

function encodeBase64Utf8(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64Utf8(value) {
  return Buffer.from(value, "base64").toString("utf8");
}

async function getRadarFileFromGitHub() {
  requireGitHubConfig();

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_RADAR_PATH}?ref=${GITHUB_BRANCH}`;
  const response = await fetch(url, {
    method: "GET",
    headers: githubHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub read failed: ${response.status} ${body}`);
  }

  const data = await response.json();

  return {
    sha: data.sha,
    json: JSON.parse(decodeBase64Utf8(data.content))
  };
}

async function updateRadarFileOnGitHub(nextJson, sha, title) {
  requireGitHubConfig();

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_RADAR_PATH}`;
  const content = JSON.stringify(nextJson, null, 2) + "\n";

  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify({
      message: `Update radar: ${title}`.slice(0, 72),
      content: encodeBase64Utf8(content),
      sha,
      branch: GITHUB_BRANCH
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub update failed: ${response.status} ${body}`);
  }

  return response.json();
}

function storyAlreadyOnRadar(radarJson, item) {
  const allStories = [
    ...(Array.isArray(radarJson.today) ? radarJson.today : []),
    ...(Array.isArray(radarJson.alsoMoving) ? radarJson.alsoMoving : []),
    ...(Array.isArray(radarJson.golfInternet) ? radarJson.golfInternet : []),
    radarJson.checking
  ].filter(Boolean);

  return allStories.some((story) => {
    if (item.sourceType === "Leaderboard" && story.signal === "Leaderboard") {
      return story.title === item.title && story.summary === item.summary;
    }

    return story.url && item.url && story.url === item.url;
  });
}

function buildNextRadarJson(currentJson, item) {
  const nextLive = buildRadarItem(item);

  const existingToday = Array.isArray(currentJson.today) ? currentJson.today : [];
  const existingAlsoMoving = Array.isArray(currentJson.alsoMoving) ? currentJson.alsoMoving : [];

  const oldLive = existingToday[0] || null;
  const restToday = existingToday.slice(1);

  const nextToday = [nextLive, ...restToday].slice(0, 3);

  const nextAlsoMoving = [
    ...(oldLive ? [oldLive] : []),
    ...existingAlsoMoving
  ].slice(0, 8);

  return {
    ...currentJson,
    active: true,
    updatedAt: new Date().toISOString(),
    today: nextToday,
    alsoMoving: nextAlsoMoving,
    checking: currentJson.checking || buildCheckingItem(item)
  };
}

async function autoPublishToGitHub(item) {
  const current = await getRadarFileFromGitHub();

  if (storyAlreadyOnRadar(current.json, item)) {
    console.log("[Publish] Story is already on radar. Skipping GitHub update.");
    return false;
  }

  const nextJson = buildNextRadarJson(current.json, item);
  await updateRadarFileOnGitHub(nextJson, current.sha, item.title);

  console.log(`[Publish] Updated GitHub radar JSON with: ${item.title}`);
  return true;
}

async function checkRadar() {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error("Missing DISCORD_WEBHOOK_URL");
  }

  console.log(`[Radar] Run started at ${new Date().toISOString()}`);
  console.log(`[Radar] Tournament window: ${isTournamentWindow() ? "Yes" : "No"}`);
  console.log(`[Radar] Auto publish: ${AUTO_PUBLISH ? "On" : "Off"}`);

  const seenPosts = loadSeenPosts();

  const leaderboardItems = await fetchLeaderboardItems();
  const redditItems = await fetchRedditItems();
  const rssItems = await fetchRssItems();

  const allItems = [...leaderboardItems, ...redditItems, ...rssItems];
  const candidates = filterCandidates(allItems, seenPosts);

  console.log(`[Radar] Checked ${leaderboardItems.length} leaderboard items, ${redditItems.length} Reddit posts and ${rssItems.length} RSS items.`);
  console.log(`[Radar] Candidates found: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("No new trending stories found.");
    return;
  }

  const bestCandidate = candidates[0];
  let published = false;

  if (AUTO_PUBLISH) {
    published = await autoPublishToGitHub(bestCandidate);
  }

  await sendDiscordAlert(bestCandidate, published);

  seenPosts.add(bestCandidate.id);
  saveSeenPosts(seenPosts);

  console.log(`[Radar] Sent alert: ${bestCandidate.title}`);
}

checkRadar().catch((error) => {
  console.error(error);
});
