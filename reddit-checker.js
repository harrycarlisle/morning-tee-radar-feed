const fs = require("fs");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const AUTO_PUBLISH = process.env.AUTO_PUBLISH === "true";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_RADAR_PATH = process.env.GITHUB_RADAR_PATH || "latest-radar.json";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const RAPIDAPI_HOST = "live-golf-data.p.rapidapi.com";
const PGA_ORG_ID = "1";
const LIVE_GOLF_YEAR = new Date().getFullYear().toString();

const SEEN_FILE = "seen-posts.json";
const FEED_BASE_URL = "https://morningteeradarfeed.netlify.app";

const GOLF_INTERNET_SEEN_FILE = "golf-internet-seen.json";

const MANUAL_GOLF_INTERNET_FILE = "manual-golf-internet.json";
const GOLF_INTERNET_ARCHIVE_FILE = "golf-internet-archive.json";

const GOLF_INTERNET_REDDIT_SOURCES = [
  {
    name: "r/golf",
    subreddit: "golf"
  }
];

const GOLF_INTERNET_POSITIVE_TERMS = [
  "video",
  "clip",
  "photo",
  "pic",
  "image",
  "bunker",
  "backyard",
  "range",
  "course",
  "green",
  "cart",
  "cart path",
  "crazy",
  "wild",
  "funny",
  "meme",
  "joke",
  "hole-in-one",
  "ace",
  "rules question",
  "weird",
  "insane",
  "beautiful",
  "worst",
  "best"
];

const GOLF_INTERNET_IGNORE_TERMS = [
  "rate my swing",
  "swing advice",
  "what club",
  "new clubs",
  "beginner clubs",
  "bag setup",
  "handicap question",
  "odds",
  "picks",
  "predictions",
  "betting",
  "wager",
  "sportsbook"
];

/*
  Reddit is temporarily disabled because GitHub Actions is getting 403s
  from Reddit. Turn this back on later once Reddit access is fixed.
*/
const REDDIT_SOURCES = [];

const RSS_FEEDS = [
  {
    name: "Yahoo Golf",
    url: "https://sports.yahoo.com/golf/rss/"
  }
];

const PLAYER_IMAGE_MAP = [
  {
    terms: ["akshay bhatia", "bhatia"],
    images: [
      "/images/akshay-bhatia.png",
      "/images/akshay-bhatia-1.png"
    ]
  },
  {
    terms: ["brooks koepka", "koepka"],
    images: [
      "/images/brooks-koepka.png"
    ]
  },
  {
    terms: ["bryson dechambeau", "bryson", "dechambeau"],
    images: [
      "/images/bryson-dechambeau.png",
      "/images/bryson-dechambeau-1.png",
      "/images/bryson-dechambeau-2.png",
      "/images/bryson-dechambeau-3.png",
      "/images/bryson-dechambeau-4.png",
      "/images/bryson-dechambeau-5.png",
      "/images/bryson-dechambeau-6.png"
    ]
  },
  {
    terms: ["cameron young", "cam young"],
    images: [
      "/images/cameron-young.png"
    ]
  },
  {
    terms: ["charley hull", "hull"],
    images: [
      "/images/charley-hull.png"
    ]
  },
  {
    terms: ["charlie woods"],
    images: [
      "/images/charlie-woods.png"
    ]
  },
  {
    terms: ["collin morikawa", "morikawa"],
    images: [
      "/images/collin-morikawa.png"
    ]
  },
  {
    terms: ["corey conners", "conners"],
    images: [
      "/images/corey-conners-1.png"
    ]
  },
  {
    terms: ["dan rapaport", "rapaport"],
    images: [
      "/images/dan-rapaport.png"
    ]
  },
  {
    terms: ["jack nicklaus", "nicklaus"],
    images: [
      "/images/jack-nicklaus.png"
    ]
  },
  {
    terms: ["jj spaun", "j.j. spaun", "spaun"],
    images: [
      "/images/jj-spaun.png"
    ]
  },
  {
    terms: ["jon rahm bryson dechambeau cam smith", "rahm bryson cam smith", "cam smith"],
    images: [
      "/images/jon-rahm-bryson-dechambeau-cam-smith.png"
    ]
  },
  {
    terms: ["jon rahm", "rahm"],
    images: [
      "/images/jon-rahm.png"
    ]
  },
  {
    terms: ["jordan spieth", "spieth"],
    images: [
      "/images/jordan-spieth.png"
    ]
  },
  {
    terms: ["justin rose", "rose"],
    images: [
      "/images/justin-rose.png",
      "/images/justin-rose-1.png"
    ]
  },
  {
    terms: ["justin thomas"],
    images: [
      "/images/justin-thomas-1.png"
    ]
  },
  {
    terms: ["keegan bradley", "keaghan bradley", "bradley"],
    images: [
      "/images/keaghan-bradley-1.png"
    ]
  },
  {
    terms: ["kristoffer reitan", "reitan"],
    images: [
      "/images/kristoffer-reitan-1.png",
      "/images/kristoffer-reitan-2.png",
      "/images/kristoffer-reitan-3.png"
    ]
  },
  {
    terms: ["lando norris"],
    images: [
      "/images/lando-norris.png"
    ]
  },
  {
    terms: ["ludvig aberg", "ludvig åberg", "aberg", "åberg"],
    images: [
      "/images/ludvig-aberg-1.png",
      "/images/ludvig-aberg-2.png",
      "/images/ludvig-aberg-3.png",
      "/images/ludvig-aberg-4.png"
    ]
  },
  {
    terms: ["matt fitzpatrick", "fitzpatrick"],
    images: [
      "/images/matt-fitzpatrick.png"
    ]
  },
  {
    terms: ["matt mccarty", "mccarty"],
    images: [
      "/images/matt-mccarty.png"
    ]
  },
  {
    terms: ["min woo lee", "min-woo lee"],
    images: [
      "/images/min-woo-lee-2.png"
    ]
  },
  {
    terms: ["nelly korda", "korda"],
    images: [
      "/images/nelly-korda-2.png"
    ]
  },
  {
    terms: ["nick taylor"],
    images: [
      "/images/nick-taylor.png",
      "/images/nick-taylor-2.png"
    ]
  },
  {
    terms: ["patrick cantlay", "cantlay"],
    images: [
      "/images/patrick-cantlay-1.png"
    ]
  },
  {
    terms: ["phil mickelson", "mickelson"],
    images: [
      "/images/phil-mickelson.png"
    ]
  },
  {
    terms: ["rory mcilroy", "rory", "mcilroy"],
    images: [
      "/images/rory-mcilroy.png",
      "/images/rory-mcilroy-1.png",
      "/images/rory-mcilroy-2.png",
      "/images/rory-mcilroy-3.png"
    ]
  },
  {
    terms: ["russell henley", "henley"],
    images: [
      "/images/russell-henley.png"
    ]
  },
  {
    terms: ["sahith theegala", "theegala"],
    images: [
      "/images/sahith-theegala-1.png"
    ]
  },
  {
    terms: ["scottie scheffler", "scheffler"],
    images: [
      "/images/scottie-scheffler.png",
      "/images/scottie-scheffler-1.png",
      "/images/scottie-scheffler-2.png",
      "/images/scottie-scheffler-3.png",
      "/images/scottie-scheffler-4.png",
      "/images/scottie-scheffler-5.png"
    ]
  },
  {
    terms: ["sepp straka", "straka"],
    images: [
      "/images/sepp-straka.png",
      "/images/sepp-straka-1.png",
      "/images/sepp-straka-2.png"
    ]
  },
  {
    terms: ["seve ballesteros", "ballesteros", "seve"],
    images: [
      "/images/seve-ballesteros.png"
    ]
  },
  {
    terms: ["sungjae im"],
    images: [
      "/images/sungjae-im.png"
    ]
  },
  {
    terms: ["ted scott", "tedd scott", "scheffler caddie", "scottie scheffler's caddie"],
    images: [
      "/images/ted-scott.png"
    ]
  },
  {
    terms: ["thomas pieters", "pieters"],
    images: [
      "/images/thomas-pieters.png"
    ]
  },
  {
    terms: ["tiger woods", "tiger"],
    images: [
      "/images/tiger-woods-1.png",
      "/images/tiger-woods-2.png",
      "/images/tiger-woods-3.png",
      "/images/tiger-woods-4.png",
      "/images/tiger-woods-5.png"
    ]
  },
  {
    terms: ["tommy fleetwood and scottie scheffler", "fleetwood scheffler"],
    images: [
      "/images/tommy-fleetwood-and-scottie-scheffler.png"
    ]
  },
  {
    terms: ["tommy fleetwood", "fleetwood"],
    images: [
      "/images/tommy-fleetwood.png"
    ]
  },
  {
    terms: ["viktor hovland", "hovland"],
    images: [
      "/images/viktor-hovland-3.png",
      "/images/viktor-hovland-5.png",
      "/images/viktor-hovland-6.png"
    ]
  },
  {
    terms: ["xander schauffele", "schauffele", "xander"],
    images: [
      "/images/xander-schauffele-1.png"
    ]
  }
];

const PLACEHOLDER_IMAGES = [
  "/images/golf-placeholder-1.png",
  "/images/golf-placeholder-2.png",
  "/images/golf-placeholder-3.png",
  "/images/golf-placeholder-4.png"
];

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
  "mcilroy",
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

function loadSeenSet(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return new Set(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error(`Could not read ${filePath}. Starting fresh.`, error);
    return new Set();
  }
}

function saveSeenSet(filePath, seenSet) {
  fs.writeFileSync(filePath, JSON.stringify([...seenSet].slice(-500), null, 2));
}

function readJsonFileSafe(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`[Manual Golf Internet] Could not read ${filePath}.`, error);
    return fallbackValue;
  }
}

function writeJsonFileSafe(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function buildManualGolfInternetItem(item, index) {
  const timestamp = getSourceTimestampIso(item, index * 37);

  return {
    id: item.id || `manual-golf-internet:${item.url || item.title || index}`,
    time: formatTimeLabel(timestamp),
    timestamp,
    status: item.status || "Trending",
    signal: item.signal || "Reddit find",
    category: item.category || "GOLF INTERNET",
    title: cleanGolfInternetTitle(item.title || "Golf internet find"),
    summary: item.summary || "A golf post is picking up attention online.",
    url: item.url || "#",
    source: item.source || "r/golf",
    image: item.image || ""
  };
}

function getManualGolfInternetItems() {
  const items = readJsonFileSafe(MANUAL_GOLF_INTERNET_FILE, []);

  if (!Array.isArray(items) || !items.length) {
    console.log("[Manual Golf Internet] No manual posts found.");
    return [];
  }

  const imageUsage = {};

  return items
    .filter((item) => item && item.title && item.url)
    .slice(0, 2)
    .map((item, index) => {
      const builtItem = buildManualGolfInternetItem(item, index);
      return attachImageIfMissing(builtItem, imageUsage);
    });
}

function mergeArchiveItems(existingArchive, oldItems) {
  const seen = new Set();
  const merged = [];

  const addItem = (item) => {
    if (!item) return;

    const key = String(item.url || item.id || item.title || "").toLowerCase();
    if (!key || seen.has(key)) return;

    seen.add(key);
    merged.push({
      ...item,
      archivedAt: item.archivedAt || new Date().toISOString()
    });
  };

  oldItems.forEach(addItem);
  existingArchive.forEach(addItem);

  return merged.slice(0, 100);
}

function updateGolfInternetArchive(oldItems) {
  const archive = readJsonFileSafe(GOLF_INTERNET_ARCHIVE_FILE, []);
  const nextArchive = mergeArchiveItems(Array.isArray(archive) ? archive : [], oldItems || []);

  writeJsonFileSafe(GOLF_INTERNET_ARCHIVE_FILE, nextArchive);

  return nextArchive;
}

function shouldCheckGolfInternetNow() {
  if (process.env.FORCE_GOLF_INTERNET_CHECK === "true") return true;
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") return true;

  const minute = new Date().getMinutes();
  return minute === 0;
}

function isProbablyImagePost(post) {
  const url = String(post.url || "").toLowerCase();
  const hint = String(post.post_hint || "").toLowerCase();

  return (
    hint.includes("image") ||
    hint.includes("video") ||
    url.includes("i.redd.it") ||
    url.includes("v.redd.it") ||
    url.includes("imgur.com") ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
  );
}

function getRedditPreviewImage(post) {
  if (post.thumbnail && String(post.thumbnail).startsWith("http")) {
    return post.thumbnail;
  }

  if (post.url && /\.(jpg|jpeg|png|webp)$/i.test(post.url)) {
    return post.url;
  }

  const previewImage = post.preview &&
    post.preview.images &&
    post.preview.images[0] &&
    post.preview.images[0].source &&
    post.preview.images[0].source.url;

  if (previewImage) {
    return decodeHtml(previewImage);
  }

  return "";
}

function cleanGolfInternetTitle(title) {
  const raw = String(title || "Golf internet find").trim();

  if (raw.length <= 70) return raw;

  return raw
    .slice(0, 67)
    .trim()
    .replace(/[,:;.!?]+$/, "") + "...";
}

function getGolfInternetSummary(post, upvotesPerHour) {
  const ups = Number(post.ups || 0);
  const comments = Number(post.num_comments || 0);

  if (isProbablyImagePost(post)) {
    return `${ups} upvotes, ${comments} comments, and moving fast on r/golf.`;
  }

  return `${ups} upvotes and ${comments} comments on r/golf.`;
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

function getAgeHoursFromDate(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return (Date.now() - date.getTime()) / 3600000;
}

function isTournamentWindow() {
  const day = new Date().getDay();
  return day === 0 || day === 4 || day === 5 || day === 6;
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
    "mcilroy",
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

function getLeaderboardPriority(item) {
  const { weekday, hour } = getEasternNowParts();

  if (item.resultType === "Winner") return 1200;

  if (weekday === "Sun" && hour >= 17 && hour <= 20) return 1100;

  if (weekday === "Sun" && hour >= 14) return 850;

  if (["Thu", "Fri", "Sat"].includes(weekday)) return 500;

  return 0;
}

function scoreNewsItem(item) {
  if (item.sourceType === "Leaderboard") {
    return {
      score: getLeaderboardPriority(item),
      matchedTerms: item.resultType === "Winner"
        ? ["winner", "leaderboard"]
        : ["leaderboard"],
      tournamentBoost: 45
    };
  }

  const text = `${item.title} ${item.summary || ""}`;
  const matchedTerms = getMatchedTerms(text);

  let score = matchedTerms.length * 10;
  const title = String(item.title || "").toLowerCase();

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
  const raw = String(title || "Untitled radar item").trim();

  const replacements = [
    {
      test: /what happened in the first round of the truist championship.*seven years/i,
      title: "Truist opened with a rare PGA Tour first"
    },
    {
      test: /luke donald says how seve ballesteros has helped him.*ryder cup/i,
      title: "Luke Donald says Seve still shapes his Ryder Cup thinking"
    },
    {
      test: /2026 truist championship friday tee times/i,
      title: "Truist Friday tee times are set"
    },
    {
      test: /bryson dechambeau.*pga tour.*liv/i,
      title: "Bryson keeps the PGA Tour return question alive"
    }
  ];

  const match = replacements.find((item) => item.test.test(raw));
  if (match) return match.title;

  if (raw.length <= 82) return raw;

  return raw
    .replace(/^what happened in /i, "")
    .replace(/^how /i, "")
    .replace(/\s+amid\s+/i, " as ")
    .replace(/\s+which has not been seen.*$/i, "")
    .replace(/\s+which hasn't been seen.*$/i, "")
    .replace(/\s+as he\s+/i, " ")
    .replace(/\s+after he\s+/i, " after ")
    .slice(0, 79)
    .trim()
    .replace(/[,:;.!?]+$/, "") + "...";
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

function isLeaderboardRadarItem(item) {
  const signal = String(item && item.signal || "").toLowerCase();
  const status = String(item && item.status || "").toLowerCase();
  const sourceType = String(item && item.sourceType || "").toLowerCase();

  return (
    sourceType === "leaderboard" ||
    signal.includes("leaderboard") ||
    status === "live" ||
    Array.isArray(item && item.leaders)
  );
}

function getImageMatchForItem(item) {
  if (!item) return null;

  const haystack = [
    item.title,
    item.summary,
    item.category,
    item.source,
    item.sourceName,
    item.signal
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const match = PLAYER_IMAGE_MAP.find((entry) => {
    return entry.terms.some((term) => haystack.includes(term.toLowerCase()));
  });

  if (!match || !Array.isArray(match.images) || !match.images.length) {
    return null;
  }

  return match;
}

function attachImageIfMissing(item, imageUsage = {}) {
  if (!item || item.image) return item;

  if (isLeaderboardRadarItem(item)) {
    return item;
  }

  const match = getImageMatchForItem(item);

  if (match) {
    const key = match.terms[0];
    const usageCount = imageUsage[key] || 0;
    const imagePath = match.images[usageCount % match.images.length];

    imageUsage[key] = usageCount + 1;

    return {
      ...item,
      image: FEED_BASE_URL + imagePath
    };
  }

  const placeholderKey = "placeholder";
  const placeholderUsage = imageUsage[placeholderKey] || 0;
  const placeholderPath = PLACEHOLDER_IMAGES[placeholderUsage % PLACEHOLDER_IMAGES.length];

  imageUsage[placeholderKey] = placeholderUsage + 1;

  return {
    ...item,
    image: FEED_BASE_URL + placeholderPath
  };
}

function attachImagesToRadarArray(items, imageUsage = {}) {
  return Array.isArray(items)
    ? items.map((item) => attachImageIfMissing(item, imageUsage))
    : [];
}

function formatTimeLabel(value) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "Earlier";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (diffMinutes < 2) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return "Earlier";
}

function getSourceTimestampIso(item, fallbackMinutesAgo) {
  if (!item) {
    return new Date().toISOString();
  }

  const possibleValues = [
    item.timestamp,
    item.createdAt,
    item.created_at,
    item.publishedAt,
    item.published_at,
    item.approvedAt,
    item.approved_at,
    item.updatedAt,
    item.updated_at,
    item.date,
    item.isoDate
  ];

  for (const value of possibleValues) {
    if (value === null || value === undefined || value === "") continue;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    if (typeof value === "number") {
      const asMs = value < 10000000000 ? value * 1000 : value;
      const date = new Date(asMs);

      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    if (typeof value === "string") {
      const numericValue = Number(value);

      if (!Number.isNaN(numericValue) && value.trim() !== "") {
        const asMs = numericValue < 10000000000 ? numericValue * 1000 : numericValue;
        const date = new Date(asMs);

        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }

      const parsed = Date.parse(value);

      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
  }

  if (typeof item.ageHours === "number" && !Number.isNaN(item.ageHours)) {
    return new Date(Date.now() - item.ageHours * 3600000).toISOString();
  }

  const fallback = typeof fallbackMinutesAgo === "number" && fallbackMinutesAgo > 0
    ? fallbackMinutesAgo
    : 0;

  return new Date(Date.now() - fallback * 60000).toISOString();
}

function addDisplayTime(item, fallbackMinutesAgo) {
  if (!item) return item;

  const timestamp = getSourceTimestampIso(item, fallbackMinutesAgo);

  return {
    ...item,
    timestamp,
    time: formatTimeLabel(timestamp)
  };
}

function addDisplayTimesToRadarArray(items, startOffsetMinutes) {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => {
    const fallbackMinutesAgo = (startOffsetMinutes || 0) + index * 37;
    return addDisplayTime(item, fallbackMinutesAgo);
  });
}
function extractOpenAIText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .map((content) => content.text || "")
      .join("")
      .trim();
  }

  return "";
}

function fallbackQuickRead(item) {
  const summary = cleanSummary(item);
  const title = cleanTitle(item.title);

  if (item.sourceType === "Leaderboard") {
    return summary;
  }

  if (!summary || summary.length < 35) {
    return `${title} is moving on the Morning Tee radar, but the available feed details are limited. The source has enough signal to track, though the full context may need a click-through.`;
  }

  return `${summary} More context may come from the original source, but this is on the radar because it connects to a current tournament, notable player, or bigger golf storyline.`;
}

function normalizeQuickRead(value, item) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (!text) return fallbackQuickRead(item);

  const sentences = text.match(/[^.!?]+[.!?]+/g);

  if (sentences && sentences.length >= 2) {
    return sentences.slice(0, 2).join(" ").trim();
  }

  return fallbackQuickRead(item);
}

async function generateQuickRead(item) {
  if (!OPENAI_API_KEY) {
    return fallbackQuickRead(item);
  }

  const title = cleanTitle(item.title);
  const summary = cleanSummary(item);
  const source = item.sourceName || item.source || "";
  const url = item.url || "";

  const prompt = `Write a Morning Tee quickRead for this golf story.

Goal:
Answer the curiosity created by the headline. Give the reader the actual payoff, not a vague teaser.

Rules:
- 2 sentences only.
- 35 to 55 words total.
- Sentence 1 answers what happened or why it happened.
- Sentence 2 gives the best detail, context, quote, consequence, or why it matters.
- Do not repeat the headline.
- Do not say "the article says."
- Do not overstate facts.
- If the reason is unknown, say what is known instead.

Title:
${title}

Current summary:
${summary}

Source:
${source}

URL:
${url}

Return JSON only:
{
  "quickRead": ""
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt
      })
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[QuickRead] OpenAI request failed: ${response.status} ${body}`);
      return fallbackQuickRead(item);
    }

    const data = await response.json();
    const rawText = extractOpenAIText(data);
    const parsed = JSON.parse(rawText);

    return normalizeQuickRead(parsed.quickRead, item);
  } catch (error) {
    console.error("[QuickRead] Failed to generate quickRead.", error);
    return fallbackQuickRead(item);
  }
}

async function withQuickRead(item) {
  if (!item) return item;

  if (item.quickRead || item.quickContext || item.modalSummary) {
    return item;
  }

  const quickRead = await generateQuickRead(item);

  return {
    ...item,
    quickRead
  };
}

function buildRadarItem(item) {
  const timestamp = getSourceTimestampIso(item, 0);

  const radarItem = {
  time: formatTimeLabel(timestamp),
  timestamp,
  approvedAt: new Date().toISOString(),
  status: item.sourceType === "Leaderboard" ? "Live" : item.sourceType === "RSS" ? "Confirmed" : "Trending",
  signal: item.sourceType,
  category: inferCategory(item),
  title: cleanTitle(item.title),
  summary: cleanSummary(item),
  quickRead: item.quickRead || item.quickContext || item.modalSummary || cleanSummary(item),
  quickContext: item.quickContext || "",
  modalSummary: item.modalSummary || "",
  keyQuote: item.keyQuote || item.quote || "",
  quoteAttribution: item.quoteAttribution || item.quoteByline || item.author || item.byline || "",
  url: item.url,
  sourceUrl: item.sourceUrl || item.url,
  source: item.sourceName
};

  if (item.sourceType === "Leaderboard") {
    return {
      ...radarItem,
      tournament: item.tournament || item.tournamentName || "PGA TOUR",
      liveLabel: "Live coverage",
      visualSubtitle: "Live coverage",
      leaders: Array.isArray(item.leaders) ? item.leaders : []
    };
  }

  return attachImageIfMissing(radarItem);
}

function buildCheckingItem(item) {
  return attachImageIfMissing({
    status: "Verifying",
    signal: item.sourceType || "Radar",
    category: inferCategory(item),
    title: cleanTitle(item.title),
    summary: cleanSummary(item),
    url: item.url,
    source: item.sourceName
  });
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
    content: `Morning Tee Radar

${item.title}

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
          image: post.thumbnail && String(post.thumbnail).startsWith("http") ? post.thumbnail : "",
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

async function fetchGolfInternetItems() {
  if (!shouldCheckGolfInternetNow()) {
    console.log("[Golf Internet] Skipped. Outside hourly check window.");
    return [];
  }

  const seenGolfInternet = loadSeenSet(GOLF_INTERNET_SEEN_FILE);
  const allItems = [];

  for (const source of GOLF_INTERNET_REDDIT_SOURCES) {
    try {
      const response = await fetch(`https://www.reddit.com/r/${source.subreddit}/hot.json?limit=50`, {
        headers: {
          "User-Agent": "MorningTeeRadar/0.3 by Morning Tee"
        }
      });

      if (!response.ok) {
        throw new Error(`${source.name} request failed: ${response.status}`);
      }

      const data = await response.json();
      const posts = data.data.children.map((item) => item.data);

      for (const post of posts) {
        const id = `golf-internet:${source.subreddit}:${post.id}`;
        if (seenGolfInternet.has(id)) continue;

        const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
        const upvotesPerHour = post.ups / Math.max(ageHours, 0.25);
        const titleText = String(post.title || "").toLowerCase();
        const combinedText = `${titleText} ${post.selftext || ""}`.toLowerCase();

        const ignored = GOLF_INTERNET_IGNORE_TERMS.some((term) => {
          return combinedText.includes(term);
        });

        if (ignored) continue;

        const hasPositiveSignal = GOLF_INTERNET_POSITIVE_TERMS.some((term) => {
          return combinedText.includes(term);
        });

        const visualPost = isProbablyImagePost(post);

        const strongPost =
          ageHours <= 24 &&
          post.ups >= 100 &&
          post.num_comments >= 15 &&
          upvotesPerHour >= 8;

        const veryStrongPost =
          ageHours <= 48 &&
          post.ups >= 250 &&
          post.num_comments >= 25;

        if (!strongPost && !veryStrongPost) continue;
        if (!visualPost && !hasPositiveSignal && !veryStrongPost) continue;

        const image = getRedditPreviewImage(post);

        allItems.push({
          id,
          time: formatTimeLabel(new Date(post.created_utc * 1000).toISOString()),
          timestamp: new Date(post.created_utc * 1000).toISOString(),
          status: "Trending",
          signal: "Reddit find",
          category: "GOLF INTERNET",
          title: cleanGolfInternetTitle(post.title),
          summary: getGolfInternetSummary(post, upvotesPerHour),
          url: `https://reddit.com${post.permalink}`,
          source: source.name,
          image,
          reddit: {
            ups: post.ups,
            comments: post.num_comments,
            upvotesPerHour: Math.round(upvotesPerHour),
            subreddit: source.subreddit
          },
          score:
            post.ups +
            post.num_comments * 4 +
            Math.round(upvotesPerHour * 10) +
            (visualPost ? 75 : 0) +
            (hasPositiveSignal ? 50 : 0)
        });
      }
    } catch (error) {
      console.error(`[Golf Internet] ${source.name} failed`, error);
    }
  }

  const winners = allItems
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  winners.forEach((item) => seenGolfInternet.add(item.id));
  saveSeenSet(GOLF_INTERNET_SEEN_FILE, seenGolfInternet);

  console.log(`[Golf Internet] Found ${winners.length} publishable posts.`);

  return winners;
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

function parseApiDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value.$date && value.$date.$numberLong) {
    const date = new Date(Number(value.$date.$numberLong));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value.$numberLong) {
    const date = new Date(Number(value.$numberLong));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function parseApiNumber(value) {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (value.$numberInt) {
    const parsed = Number(value.$numberInt);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (value.$numberLong) {
    const parsed = Number(value.$numberLong);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getLeaderboardRows(leaderboardData) {
  if (!leaderboardData) return [];

  if (Array.isArray(leaderboardData.leaderboardRows)) {
    return leaderboardData.leaderboardRows;
  }

  if (leaderboardData.leaderboard && Array.isArray(leaderboardData.leaderboard.leaderboardRows)) {
    return leaderboardData.leaderboard.leaderboardRows;
  }

  if (leaderboardData.data && Array.isArray(leaderboardData.data.leaderboardRows)) {
    return leaderboardData.data.leaderboardRows;
  }

  if (
    leaderboardData.data &&
    leaderboardData.data.leaderboard &&
    Array.isArray(leaderboardData.data.leaderboard.leaderboardRows)
  ) {
    return leaderboardData.data.leaderboard.leaderboardRows;
  }

  return [];
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

  if (process.env.FORCE_LEADERBOARD_CHECK === "true") return true;
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") return true;

  const { weekday, hour } = getEasternNowParts();

  if (["Thu", "Fri", "Sat"].includes(weekday)) return true;

  if (weekday === "Sun") {
    return hour <= 23;
  }

  return false;
}

function rapidApiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-rapidapi-host": RAPIDAPI_HOST,
    "x-rapidapi-key": RAPIDAPI_KEY
  };
}

async function fetchCurrentTournaments() {
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

  console.log("[Leaderboard] Schedule response keys:", Object.keys(data));

  const schedule =
    Array.isArray(data.schedule) ? data.schedule :
    Array.isArray(data.tournaments) ? data.tournaments :
    Array.isArray(data.events) ? data.events :
    Array.isArray(data.data) ? data.data :
    [];

  console.log("[Leaderboard] Schedule count:", schedule.length);

  const now = new Date();

  const currentEvents = schedule.filter((event) => {
    const start = parseApiDate(event.date && event.date.start);
    const end = parseApiDate(event.date && event.date.end);

    if (!start || !end) {
      return false;
    }

    const endPlusOneDay = new Date(end);
    endPlusOneDay.setUTCDate(endPlusOneDay.getUTCDate() + 1);

    return now >= start && now < endPlusOneDay;
  });

  console.log("[Leaderboard] Current event candidates:", currentEvents.length);

  currentEvents.forEach((event) => {
    console.log(JSON.stringify({
      name: event.name,
      tournamentName: event.tournamentName,
      tournId: event.tournId,
      id: event.id,
      start: parseApiDate(event.date && event.date.start),
      end: parseApiDate(event.date && event.date.end),
      purse: parseApiNumber(event.purse),
      fedexCupPoints: parseApiNumber(event.fedexCupPoints),
      format: event.format
    }, null, 2));
  });

  if (!currentEvents.length) {
  const recentlyEndedEvents = schedule.filter((event) => {
    const end = parseApiDate(event.date && event.date.end);

    if (!end) return false;

    const { weekday, hour } = getEasternNowParts();

    return weekday === "Sun" && hour <= 23 && now >= end;
  });

  console.log("[Leaderboard] Recently ended Sunday event candidates:", recentlyEndedEvents.length);

  if (!recentlyEndedEvents.length) return [];

  const recentStrokeEvents = recentlyEndedEvents.filter((event) => event.format === "stroke");
  const recentCandidates = recentStrokeEvents.length ? recentStrokeEvents : recentlyEndedEvents;

  return recentCandidates.sort((a, b) => {
    const purseA = parseApiNumber(a.purse);
    const purseB = parseApiNumber(b.purse);
    const fedexA = parseApiNumber(a.fedexCupPoints);
    const fedexB = parseApiNumber(b.fedexCupPoints);

    return (purseB + fedexB * 10000) - (purseA + fedexA * 10000);
  });
}

  const strokeEvents = currentEvents.filter((event) => event.format === "stroke");
  const candidates = strokeEvents.length ? strokeEvents : currentEvents;

  return candidates.sort((a, b) => {
    const purseA = parseApiNumber(a.purse);
    const purseB = parseApiNumber(b.purse);
    const fedexA = parseApiNumber(a.fedexCupPoints);
    const fedexB = parseApiNumber(b.fedexCupPoints);

    return (purseB + fedexB * 10000) - (purseA + fedexA * 10000);
  });
}

async function fetchCurrentTournament() {
  const tournaments = await fetchCurrentTournaments();
  return tournaments[0] || null;
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

function cleanLeaderboardValue(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    if (value.$numberInt) return String(value.$numberInt);
    if (value.$numberLong) return String(value.$numberLong);
    if (value.displayValue) return String(value.displayValue);
    if (value.value) return String(value.value);
    if (value.thru) return String(value.thru);
    if (value.currentHole) return String(value.currentHole);
  }

  return "";
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

function leaderboardRowIsFinished(row) {
  const thru = cleanLeaderboardValue(row.thru || row.currentHole).toLowerCase();
  const status = String(row.status || "").toLowerCase();

  return (
    thru === "f" ||
    thru === "final" ||
    thru === "finished" ||
    status.includes("complete") ||
    status.includes("final") ||
    status.includes("finished")
  );
}

function leaderboardLooksFinal(tournament, sortedRows, leaderboardData) {
  if (!Array.isArray(sortedRows) || !sortedRows.length) return false;

  const statusText = JSON.stringify({
    tournamentStatus: tournament.status,
    roundStatus: leaderboardData && leaderboardData.roundStatus,
    status: leaderboardData && leaderboardData.status,
    currentRoundStatus: leaderboardData && leaderboardData.currentRoundStatus
  }).toLowerCase();

  if (
    statusText.includes("complete") ||
    statusText.includes("official") ||
    statusText.includes("final")
  ) {
    return true;
  }

  const topRows = sortedRows.slice(0, 5);

  return topRows.length > 0 && topRows.every(leaderboardRowIsFinished);
}

function hasSoloWinner(sortedRows) {
  if (!Array.isArray(sortedRows) || sortedRows.length < 2) return true;

  const firstPosition = String(sortedRows[0].position || "").toLowerCase();
  const secondPosition = String(sortedRows[1].position || "").toLowerCase();

  if (firstPosition.startsWith("t")) return false;
  if (secondPosition === "1" || secondPosition === "t1") return false;

  return true;
}

function buildLeaderboardItem(tournament, leaderboardData) {
  const rows = getLeaderboardRows(leaderboardData).filter(isActiveLeaderboardRow);

  if (!rows.length) return null;

  const sorted = rows.slice().sort((a, b) => {
    return positionNumber(a.position) - positionNumber(b.position);
  });

  const leader = sorted[0];
  const chasers = sorted.slice(1, 4);

  const leaderName = playerName(leader);
  const leaderScore = leader.total || "";
  const leaderThruValue = cleanLeaderboardValue(leader.thru || leader.currentHole);
  const thru = leaderThruValue && leaderThruValue !== "-" ? leaderThruValue : "the course";
  const today = leader.currentRoundScore && leader.currentRoundScore !== "-"
    ? leader.currentRoundScore
    : null;

  const finalBoard = leaderboardLooksFinal(tournament, sorted, leaderboardData);
  const soloWinner = finalBoard && hasSoloWinner(sorted);

  const leaders = sorted.slice(0, 5).map((row) => {
    const rowThruValue = cleanLeaderboardValue(row.thru || row.currentHole);
    const rowThru = rowThruValue && rowThruValue !== "-" ? rowThruValue : "";

    return {
      pos: String(row.position || ""),
      name: playerName(row),
      score: String(row.total || ""),
      thru: String(rowThru || "")
    };
  });

  const chasersText = chasers.length
    ? `Closest chasers: ${chasers.map((row) => `${playerName(row)} (${row.total})`).join(", ")}.`
    : "";

  const todayText = today
    ? `${leaderName} is ${today} today and ${leaderScore} overall through ${thru}.`
    : `${leaderName} is ${leaderScore} overall through ${thru}.`;

  const winnerSummary = chasers.length
    ? `${leaderName} wins ${tournament.name} at ${leaderScore}. Nearest finishers: ${chasers.map((row) => `${playerName(row)} (${row.total})`).join(", ")}.`
    : `${leaderName} wins ${tournament.name} at ${leaderScore}.`;

  return {
    id: soloWinner
      ? `winner:${tournament.tournId}:${leader.playerId}:${leader.total}:${leader.currentRound || "final"}`
      : `leaderboard:${tournament.tournId}:${leader.playerId}:${leader.total}:${leader.thru}:${leader.currentRound}`,
    sourceType: "Leaderboard",
    sourceName: "Live Golf Data",
    tournament: tournament.name || "PGA TOUR",
    title: soloWinner
      ? `${leaderName} wins ${tournament.name} at ${leaderScore}`
      : `${leaderName} leads ${tournament.name} at ${leaderScore}`,
    summary: soloWinner
      ? winnerSummary
      : `${todayText} ${chasersText}`.trim(),
    url: "https://www.pgatour.com/leaderboard",
    leaders,
    ageHours: 0,
    score: soloWinner ? 1100 : 999,
    matchedTerms: soloWinner
      ? ["winner", "leaderboard", tournament.name]
      : ["leaderboard", tournament.name],
    tournamentBoost: 45,
    resultType: soloWinner ? "Winner" : "Leaderboard"
  };
}

async function fetchLeaderboardItems() {
  if (!shouldCheckLeaderboardNow()) {
    console.log("[Leaderboard] Skipped. Outside leaderboard check window.");
    return [];
  }

  try {
    const tournaments = await fetchCurrentTournaments();

    if (!tournaments.length) {
      console.log("[Leaderboard] No current tournament found.");
      return [];
    }

    const items = [];

    for (const tournament of tournaments) {
      try {
        console.log(`[Leaderboard] Current tournament: ${tournament.name} (${tournament.tournId})`);

        const leaderboard = await fetchLeaderboardForTournament(tournament);
        const leaderboardRows = getLeaderboardRows(leaderboard);

        console.log("[Leaderboard] Response keys:", Object.keys(leaderboard || {}));
        console.log(`[Leaderboard] Row count for ${tournament.name}:`, leaderboardRows.length);

        const item = buildLeaderboardItem(tournament, leaderboard);

        if (!item) {
          console.log(`[Leaderboard] No publishable leaderboard item found for ${tournament.name}.`);
          continue;
        }

        items.push(item);
      } catch (error) {
        console.error(`[Leaderboard] Failed for ${tournament.name || tournament.tournId}`, error);
      }
    }

    console.log(`[Leaderboard] Publishable leaderboard items: ${items.length}`);

    return items;
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
    ...(Array.isArray(radarJson.liveLeaderboards) ? radarJson.liveLeaderboards : []),
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

function mergeGolfInternetItems(currentItems, newItems) {
  const imageUsage = {};
  const seen = new Set();
  const merged = [];

  const addItem = (item) => {
    if (!item) return;

    const key = String(item.url || item.id || item.title || "").toLowerCase();
    if (!key || seen.has(key)) return;

    seen.add(key);
    merged.push(item);
  };

  newItems.forEach(addItem);
  currentItems.forEach(addItem);

  return attachImagesToRadarArray(merged.slice(0, 2), imageUsage);
}

function buildLiveLeaderboardsFromItems(leaderboardItems) {
  if (!Array.isArray(leaderboardItems) || !leaderboardItems.length) {
    return [];
  }

  const newestByTournament = new Map();

  leaderboardItems.forEach((item) => {
    if (!item || item.sourceType !== "Leaderboard") return;

    const radarItem = buildRadarItem(item);
    if (!radarItem || !Array.isArray(radarItem.leaders) || !radarItem.leaders.length) return;

    const tournamentKey = String(radarItem.tournament || "PGA TOUR").trim().toLowerCase();
    newestByTournament.set(tournamentKey, radarItem);
  });

  return Array.from(newestByTournament.values());
}

function isLeaderboardLikeItem(item) {
  if (!item) return false;

  const signal = String(item.signal || item.sourceType || "").toLowerCase();
  const status = String(item.status || "").toLowerCase();

  return (
    signal.includes("leaderboard") ||
    status === "live" ||
    Array.isArray(item.leaders)
  );
}

function getWeekRadarAgeHours(item) {
  const timestamp = getSourceTimestampIso(item, 0);
  const parsed = Date.parse(timestamp);

  if (Number.isNaN(parsed)) return 999;

  return Math.max(0, (Date.now() - parsed) / 3600000);
}

function getWeekRadarGroupKey(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();

  if (text.includes("quail hollow") || text.includes("pga championship")) return "pga-championship";
  if (text.includes("rory") || text.includes("mcilroy")) return "rory-mcilroy";
  if (text.includes("scottie") || text.includes("scheffler")) return "scottie-scheffler";
  if (text.includes("liv")) return "liv";
  if (text.includes("tiger")) return "tiger";
  if (text.includes("ryder cup")) return "ryder-cup";
  if (text.includes("lpga") || text.includes("nelly korda")) return "lpga";
  if (text.includes("japan")) return "japan-tour";
  if (text.includes("youtube") || text.includes("good good") || text.includes("grant horvat") || text.includes("bob does sports")) return "creator-golf";

  const normalizedTitle = String(item.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 5)
    .join("-");

  return normalizedTitle || String(item.url || item.id || Math.random());
}

function scoreWeekRadarItem(item) {
  if (!item || isLeaderboardLikeItem(item)) return -999;

  const title = String(item.title || "");
  const summary = String(item.summary || "");
  const text = `${title} ${summary}`.toLowerCase();
  const ageHours = getWeekRadarAgeHours(item);

  if (!title || !item.url) return -999;
  if (ageHours > 96) return -999;

  let score = 0;

  if (ageHours <= 12) score += 20;
  else if (ageHours <= 24) score += 16;
  else if (ageHours <= 48) score += 10;
  else if (ageHours <= 72) score += 6;

  const lastingTerms = [
    "pga championship",
    "quail hollow",
    "major",
    "major championship",
    "what's next",
    "what’s next",
    "future",
    "decision",
    "return",
    "re-signing",
    "resigning",
    "challenge",
    "can anyone",
    "warning",
    "scared",
    "rules",
    "change",
    "schedule",
    "ryder cup",
    "liv",
    "pga tour",
    "tiger",
    "rory",
    "mcilroy",
    "scottie",
    "scheffler",
    "bryson",
    "dechambeau",
    "rahm",
    "korda",
    "lpga",
    "japan",
    "youtube",
    "creator",
    "viral"
  ];

  lastingTerms.forEach((term) => {
    if (text.includes(term)) score += 8;
  });

  const weekLongPhrases = [
    "at the pga championship",
    "before the pga championship",
    "ahead of the pga championship",
    "this week",
    "next week",
    "field",
    "course",
    "setup",
    "odds",
    "favorite",
    "watch",
    "contender",
    "domination",
    "stars",
    "significant",
    "bigger",
    "future in flux"
  ];

  weekLongPhrases.forEach((phrase) => {
    if (text.includes(phrase)) score += 6;
  });

    if (item.quickRead || item.quickContext || item.modalSummary) score += 18;

  if (!hasUsefulWeekRadarSummary(item)) score -= 30;

  if (title.length > 95) score -= 4;
  if (summary.length < 35) score -= 14;
  if (text.includes("tee time") || text.includes("tee times")) score -= 10;
  if (text.includes("round 1") || text.includes("round 2")) score -= 7;

  const categoryText = String(item.category || item.label || item.signal || item.source || "").toLowerCase();

  const isGolfInternet =
    categoryText.includes("internet") ||
    categoryText.includes("reddit") ||
    text.includes("reddit") ||
    text.includes("bunker") ||
    text.includes("backyard") ||
    text.includes("meme") ||
    text.includes("viral clip");

  const isPlayerOrTournamentStory =
    text.includes("rory") ||
    text.includes("mcilroy") ||
    text.includes("scottie") ||
    text.includes("scheffler") ||
    text.includes("bryson") ||
    text.includes("rahm") ||
    text.includes("tiger") ||
    text.includes("pga championship") ||
    text.includes("major") ||
    text.includes("quail hollow") ||
    text.includes("injury") ||
    text.includes("limping") ||
    text.includes("withdraw") ||
    text.includes("field") ||
    text.includes("contender");

  if (isGolfInternet && !isPlayerOrTournamentStory) {
    score -= 45;
  }

  if (text.includes("limping") || text.includes("injury") || text.includes("health")) {
    score += 28;
  }

  if (text.includes("before the pga championship") || text.includes("ahead of the pga championship")) {
    score += 22;
  }

  return score;
}

function getWeekRadarLabel(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();

  if (text.includes("pga championship") || text.includes("quail hollow") || text.includes("major")) return "MAJOR WATCH";
  if (text.includes("liv")) return "LIV WATCH";
  if (text.includes("rory") || text.includes("mcilroy") || text.includes("scottie") || text.includes("scheffler")) return "STAR WATCH";
  if (text.includes("ryder cup")) return "RYDER CUP";
  if (text.includes("lpga") || text.includes("nelly korda")) return "LPGA WATCH";
  if (text.includes("japan")) return "JAPAN TOUR";
  if (text.includes("youtube") || text.includes("creator") || text.includes("good good") || text.includes("grant horvat")) return "CREATOR GOLF";

  return "STORY TO WATCH";
}

function cleanWeekRadarTitle(item) {
  const title = cleanTitle(item.title || "Story to watch");

  if (title.length <= 72) return title;

  return title
    .slice(0, 69)
    .trim()
    .replace(/[,:;.!?]+$/, "") + "...";
}

function buildWeekRadarSummary(item) {
  const quickRead = String(item.quickRead || item.quickContext || item.modalSummary || "").trim();
  const summary = String(item.summary || "").trim();

  const sourceText = quickRead || summary;

  if (!sourceText) {
    return "This is a golf storyline worth tracking as more details come in this week.";
  }

  const firstSentence = sourceText.match(/^.*?[.!?](\s|$)/);
  const sentence = firstSentence ? firstSentence[0].trim() : sourceText;

  if (sentence.length <= 150) return sentence;

  return sentence
    .slice(0, 147)
    .trim()
    .replace(/[,:;.!?]+$/, "") + "...";
}

function buildWeekRadarItem(item) {
  return {
    label: getWeekRadarLabel(item),
    title: cleanWeekRadarTitle(item),
    summary: buildWeekRadarSummary(item),
    url: item.sourceUrl || item.url || "#",
    source: item.source || item.sourceName || "",
    timestamp: getSourceTimestampIso(item, 0)
  };
}

function buildWeekRadarFromStories(stories, existingWeekRadar) {
  const candidates = Array.isArray(stories) ? stories.filter(Boolean) : [];
  const existing = Array.isArray(existingWeekRadar) ? existingWeekRadar : [];

  const existingAsStories = existing.map((item) => ({
    ...item,
    title: item.title,
    summary: item.summary,
    url: item.url,
    source: item.source || "Morning Tee",
    timestamp: item.timestamp || item.updatedAt || item.createdAt || new Date(Date.now() - 48 * 3600000).toISOString()
  }));

  const allCandidates = candidates.concat(existingAsStories);

  const scored = allCandidates
    .map((item) => ({
      item,
      score: scoreWeekRadarItem(item),
      groupKey: getWeekRadarGroupKey(item)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const usedGroups = new Set();

  scored.forEach((entry) => {
    if (picked.length >= 3) return;
    if (usedGroups.has(entry.groupKey)) return;

    usedGroups.add(entry.groupKey);
    picked.push(buildWeekRadarItem(entry.item));
  });

  return picked;
}

function shouldHideOldLeaderboardStoriesNow() {
  const { weekday } = getEasternNowParts();
  return ["Mon", "Tue", "Wed"].includes(weekday);
}

function removeOldLeaderboardStories(items) {
  if (!Array.isArray(items)) return [];

  if (!shouldHideOldLeaderboardStoriesNow()) {
    return items;
  }

  return items.filter((item) => {
    return !isLeaderboardLikeItem(item);
  });
}

function hasUsefulWeekRadarSummary(item) {
  const text = String(item.quickRead || item.quickContext || item.modalSummary || item.summary || "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 60) return false;

  const weakPhrases = [
    "finished what has been a poor week",
    "golf story is picking up attention",
    "available feed details are limited",
    "more context may come from the original source",
    "the u.s."
  ];

  const lower = text.toLowerCase();

  return !weakPhrases.some((phrase) => lower.includes(phrase));
}

function buildNextRadarJson(currentJson, item) {
  const nextLive = buildRadarItem(item);

  const existingToday = Array.isArray(currentJson.today) ? currentJson.today : [];
  const existingAlsoMoving = Array.isArray(currentJson.alsoMoving) ? currentJson.alsoMoving : [];

  const oldLive = existingToday[0] || null;
  const restToday = existingToday.slice(1);

  const imageUsage = {};

  const nextToday = addDisplayTimesToRadarArray(
    attachImagesToRadarArray([nextLive, ...restToday].slice(0, 3), imageUsage),
    0
  );

    const nextAlsoMoving = addDisplayTimesToRadarArray(
    removeOldLeaderboardStories(
      attachImagesToRadarArray([
        ...(oldLive ? [oldLive] : []),
        ...existingAlsoMoving
      ], imageUsage)
    ).slice(0, 8),
    35
  );

  const nextWeekRadar = buildWeekRadarFromStories(
  [nextLive, ...nextToday, ...nextAlsoMoving],
  currentJson.weekRadar || currentJson.week_radar || []
);

return {
  ...currentJson,
  active: true,
  updatedAt: new Date().toISOString(),
  today: nextToday,
  liveLeaderboards: item.sourceType === "Leaderboard"
    ? buildLiveLeaderboardsFromItems([item])
    : (Array.isArray(currentJson.liveLeaderboards) ? currentJson.liveLeaderboards : []),
  alsoMoving: nextAlsoMoving,
  weekRadar: nextWeekRadar,
  checking: currentJson.checking || buildCheckingItem(item),
  golfInternet: addDisplayTimesToRadarArray(
    attachImagesToRadarArray(currentJson.golfInternet || [], imageUsage),
    90
  )
};
}

function backfillRadarImages(radarJson) {
  const imageUsage = {};

  return {
    ...radarJson,
    today: addDisplayTimesToRadarArray(
      attachImagesToRadarArray(radarJson.today || [], imageUsage),
      0
    ),
    alsoMoving: addDisplayTimesToRadarArray(
      attachImagesToRadarArray(radarJson.alsoMoving || [], imageUsage),
      35
    ),
    golfInternet: addDisplayTimesToRadarArray(
      attachImagesToRadarArray(radarJson.golfInternet || [], imageUsage),
      90
    ),
    checking: radarJson.checking ? attachImageIfMissing(radarJson.checking, imageUsage) : radarJson.checking
  };
}

function radarJsonChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function autoPublishToGitHub(item) {
  const current = await getRadarFileFromGitHub();

  if (storyAlreadyOnRadar(current.json, item)) {
    const backfilledJson = backfillRadarImages(current.json);

    if (radarJsonChanged(current.json, backfilledJson)) {
      await updateRadarFileOnGitHub(backfilledJson, current.sha, "Backfill radar images");
      console.log("[Publish] Story already on radar, but missing images were backfilled.");
      return true;
    }

    console.log("[Publish] Story is already on radar. Skipping GitHub update.");
    return false;
  }

  const nextJson = buildNextRadarJson(current.json, item);
  await updateRadarFileOnGitHub(nextJson, current.sha, item.title);

  console.log(`[Publish] Updated GitHub radar JSON with: ${item.title}`);
  return true;
}

async function clearLiveLeaderboardsIfNeeded() {
  if (!AUTO_PUBLISH) return false;

  const { weekday } = getEasternNowParts();

  if (["Thu", "Fri", "Sat", "Sun"].includes(weekday)) {
    return false;
  }

  const current = await getRadarFileFromGitHub();

  const currentLive = Array.isArray(current.json.liveLeaderboards)
    ? current.json.liveLeaderboards
    : [];

  const currentAlsoMoving = Array.isArray(current.json.alsoMoving)
    ? current.json.alsoMoving
    : [];

  const nextAlsoMoving = removeOldLeaderboardStories(currentAlsoMoving);

  const nextWeekRadar = buildWeekRadarFromStories(
    [
      ...(Array.isArray(current.json.today) ? current.json.today : []),
      ...nextAlsoMoving,
      ...(Array.isArray(current.json.golfInternet) ? current.json.golfInternet : [])
    ],
    current.json.weekRadar || current.json.week_radar || []
  );

  const liveChanged = currentLive.length > 0;
  const alsoMovingChanged = JSON.stringify(currentAlsoMoving) !== JSON.stringify(nextAlsoMoving);
  const weekRadarChanged = JSON.stringify(current.json.weekRadar || []) !== JSON.stringify(nextWeekRadar);

  if (!liveChanged && !alsoMovingChanged && !weekRadarChanged) {
    return false;
  }

  const nextJson = {
    ...current.json,
    active: true,
    updatedAt: new Date().toISOString(),
    liveLeaderboards: [],
    alsoMoving: nextAlsoMoving,
    weekRadar: nextWeekRadar
  };

  await updateRadarFileOnGitHub(nextJson, current.sha, "Clear stale live leaderboards");
  console.log("[Leaderboard] Cleared stale liveLeaderboards and old leaderboard stories outside tournament window.");

  return true;
}

async function autoPublishLiveLeaderboardsToGitHub(leaderboardItems) {
  if (!AUTO_PUBLISH || !Array.isArray(leaderboardItems) || !leaderboardItems.length) {
    return false;
  }

  const liveLeaderboards = buildLiveLeaderboardsFromItems(leaderboardItems);

  if (!liveLeaderboards.length) {
    console.log("[Leaderboard] No live leaderboards to publish.");
    return false;
  }

  const current = await getRadarFileFromGitHub();

  const nextWeekRadar = buildWeekRadarFromStories(
  [
    ...(Array.isArray(current.json.today) ? current.json.today : []),
    ...(Array.isArray(current.json.alsoMoving) ? current.json.alsoMoving : []),
    ...(Array.isArray(current.json.golfInternet) ? current.json.golfInternet : [])
  ],
  current.json.weekRadar || current.json.week_radar || []
);

const nextJson = {
  ...current.json,
  active: true,
  updatedAt: new Date().toISOString(),
  liveLeaderboards,
  weekRadar: nextWeekRadar
};

  if (!radarJsonChanged(current.json, nextJson)) {
    console.log("[Leaderboard] liveLeaderboards already up to date.");
    return false;
  }

  const title = liveLeaderboards.length > 1
    ? `Update ${liveLeaderboards.length} live leaderboards`
    : `Update live leaderboard: ${liveLeaderboards[0].tournament || "PGA TOUR"}`;

  await updateRadarFileOnGitHub(nextJson, current.sha, title);
  console.log(`[Leaderboard] Updated liveLeaderboards with ${liveLeaderboards.length} tournament(s).`);

  return true;
}

async function autoPublishGolfInternetToGitHub(items) {
  if (!AUTO_PUBLISH || !items.length) return false;

  const current = await getRadarFileFromGitHub();
  const oldGolfInternet = Array.isArray(current.json.golfInternet) ? current.json.golfInternet : [];

  updateGolfInternetArchive(oldGolfInternet);

  const imageUsage = {};

 const nextGolfInternet = addDisplayTimesToRadarArray(
  attachImagesToRadarArray(items.slice(0, 2), imageUsage),
  0
);

const nextWeekRadar = buildWeekRadarFromStories(
  [
    ...(Array.isArray(current.json.today) ? current.json.today : []),
    ...(Array.isArray(current.json.alsoMoving) ? current.json.alsoMoving : []),
    ...nextGolfInternet
  ],
  current.json.weekRadar || current.json.week_radar || []
);

const nextJson = {
  ...current.json,
  active: true,
  updatedAt: new Date().toISOString(),
  weekRadar: nextWeekRadar,
  golfInternet: nextGolfInternet
};

  if (!radarJsonChanged(current.json, nextJson)) {
    console.log("[Golf Internet] No GitHub update needed.");
    return false;
  }

  await updateRadarFileOnGitHub(nextJson, current.sha, "Update Golf Internet");
  console.log("[Golf Internet] Updated GitHub radar JSON.");

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

  let leaderboardItems = await fetchLeaderboardItems();

if (leaderboardItems.length) {
  leaderboardItems = await Promise.all(leaderboardItems.map(withQuickRead));
}
  const redditItems = await fetchRedditItems();
  const rssItems = await fetchRssItems();
  const manualGolfInternetItems = getManualGolfInternetItems();
const redditGolfInternetItems = manualGolfInternetItems.length
  ? []
  : await fetchGolfInternetItems();

let golfInternetItems = manualGolfInternetItems.length
  ? manualGolfInternetItems
  : redditGolfInternetItems;

  const allItems = [...leaderboardItems, ...redditItems, ...rssItems];
  const candidates = filterCandidates(allItems, seenPosts);

const weekRadarSourceItems = [...candidates, ...rssItems, ...golfInternetItems]
  .filter((item) => item && !isLeaderboardLikeItem(item))
  .sort((a, b) => {
    return scoreWeekRadarItem(b) - scoreWeekRadarItem(a);
  })
  .slice(0, 20);

  console.log(`[Radar] Checked ${leaderboardItems.length} leaderboard items, ${redditItems.length} Reddit posts, ${rssItems.length} RSS items, and ${golfInternetItems.length} Golf Internet items.`);
  console.log(`[Radar] Candidates found: ${candidates.length}`);

  let bestCandidate = candidates[0] || null;

if (bestCandidate) {
  bestCandidate = await withQuickRead(bestCandidate);
}

if (golfInternetItems.length) {
  golfInternetItems = await Promise.all(golfInternetItems.map(withQuickRead));
}

let published = false;

    if (AUTO_PUBLISH) {
    if (bestCandidate) {
      published = await autoPublishToGitHub(bestCandidate);
    }

    await clearLiveLeaderboardsIfNeeded();

   if (weekRadarSourceItems.length) {
  const current = await getRadarFileFromGitHub();

  const nextWeekRadar = buildWeekRadarFromStories(
    [
      ...(Array.isArray(current.json.today) ? current.json.today : []),
      ...(Array.isArray(current.json.alsoMoving) ? current.json.alsoMoving : []),
      ...(Array.isArray(current.json.golfInternet) ? current.json.golfInternet : []),
      ...weekRadarSourceItems
    ],
    current.json.weekRadar || current.json.week_radar || []
  );

  const nextJson = {
    ...current.json,
    active: true,
    updatedAt: new Date().toISOString(),
    weekRadar: nextWeekRadar
  };

  if (radarJsonChanged(current.json, nextJson)) {
    await updateRadarFileOnGitHub(nextJson, current.sha, "Update week radar");
    console.log("[Week Radar] Updated automatic week radar.");
  }
}   

    if (leaderboardItems.length) {
      await autoPublishLiveLeaderboardsToGitHub(leaderboardItems);
    }

    if (golfInternetItems.length) {
      await autoPublishGolfInternetToGitHub(golfInternetItems);
    }
  }

  if (bestCandidate) {
    await sendDiscordAlert(bestCandidate, published);

    seenPosts.add(bestCandidate.id);
    saveSeenPosts(seenPosts);

    console.log(`[Radar] Sent alert: ${bestCandidate.title}`);
  } else {
    console.log("No new trending stories found.");
  }
}
checkRadar().catch((error) => {
  console.error(error);
});
