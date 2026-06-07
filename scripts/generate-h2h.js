const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DATAGOLF_API_KEY;

if (!API_KEY) {
  throw new Error("Missing DATAGOLF_API_KEY environment variable.");
}

const TOUR = "pga";
const CURRENT_YEAR = new Date().getFullYear();
const TEST_ONLY_TIGER_RORY = false;

function loadManualResults(slug) {
  try {
    const file = path.join(
      process.cwd(),
      "data",
      "h2h",
      "manual",
      `${slug}-results.json`
    );

    if (!fs.existsSync(file)) return null;

    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function normalizeEventName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bthe\b/g, "")
    .replace(/\bpresented by\b/g, "")
    .replace(/\bsponsored by\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findManualResult(manualData, event) {
  if (!manualData?.seasons) return null;

  const eventYear = Number(event.year);
  const eventName = normalizeEventName(event.eventName);

  const seasonKeysToCheck = [
    String(eventYear),
    `${eventYear - 1}-${String(eventYear).slice(-2)}`,
    `${eventYear}-${String(eventYear + 1).slice(-2)}`
  ];

  for (const key of seasonKeysToCheck) {
    const season = manualData.seasons[key];
    if (!season?.events) continue;

    const match = season.events.find((manualEvent) => {
      if (manualEvent.officialStart === false) return false;

      const manualName = normalizeEventName(manualEvent.tournament);

      return (
        manualName === eventName ||
        manualName.includes(eventName) ||
        eventName.includes(manualName)
      );
    });

    if (match) return match;
  }

  return null;
}

function getManualEventsForRange(manualData, startYear) {
  if (!manualData?.seasons) return [];

  const events = [];

  for (const season of Object.values(manualData.seasons)) {
    if (!season?.events) continue;

    season.events.forEach((manualEvent) => {
      const year = Number(String(manualEvent.date || "").slice(0, 4));

      if (!year || year < startYear || year > CURRENT_YEAR) return;
      if (manualEvent.officialStart === false) return;

      events.push({
        year,
        date: manualEvent.date || "",
        eventId: `manual-${normalizeEventName(manualEvent.tournament)}-${year}`,
        eventName: manualEvent.tournament,
        tour: TOUR,
        manualEvent: true
      });
    });
  }

  return events;
}

const PLAYERS = {
  scottie: { name: "Scheffler, Scottie", displayName: "Scottie Scheffler", slug: "scottie-scheffler", dgId: 18417, country: "USA" },
  rory: { name: "McIlroy, Rory", displayName: "Rory McIlroy", slug: "rory-mcilroy", dgId: 10091, country: "NIR" },
  bryson: { name: "DeChambeau, Bryson", displayName: "Bryson DeChambeau", slug: "bryson-dechambeau", dgId: 19841, country: "USA" },
  brooks: { name: "Koepka, Brooks", displayName: "Brooks Koepka", slug: "brooks-koepka", dgId: 16243, country: "USA" },
  rahm: { name: "Rahm, Jon", displayName: "Jon Rahm", slug: "jon-rahm", dgId: 19195, country: "ESP" },
  xander: { name: "Schauffele, Xander", displayName: "Xander Schauffele", slug: "xander-schauffele", dgId: 19895, country: "USA" },
  collin: { name: "Morikawa, Collin", displayName: "Collin Morikawa", slug: "collin-morikawa", dgId: 22085, country: "USA" },
  ludvig: { name: "Aberg, Ludvig", displayName: "Ludvig Åberg", slug: "ludvig-aberg", dgId: 23950, country: "SWE" },
  viktor: { name: "Hovland, Viktor", displayName: "Viktor Hovland", slug: "viktor-hovland", dgId: 18841, country: "NOR" },
  tommy: { name: "Fleetwood, Tommy", displayName: "Tommy Fleetwood", slug: "tommy-fleetwood", dgId: 12294, country: "ENG" },
  phil: { name: "Mickelson, Phil", displayName: "Phil Mickelson", slug: "phil-mickelson", dgId: 1547, country: "USA" },
  tiger: { name: "Woods, Tiger", displayName: "Tiger Woods", slug: "tiger-woods", dgId: 5321, country: "USA" },

  jack: {
    name: "Nicklaus, Jack",
    displayName: "Jack Nicklaus",
    slug: "jack-nicklaus",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  nickFaldo: {
  name: "Faldo, Nick",
  displayName: "Nick Faldo",
  slug: "nick-faldo",
  dgId: null,
  country: "ENG",
  manualOnly: true
},

  byron: {
    name: "Nelson, Byron",
    displayName: "Byron Nelson",
    slug: "byron-nelson",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  samSnead: {
    name: "Snead, Sam",
    displayName: "Sam Snead",
    slug: "sam-snead",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  rickie: {
    name: "Fowler, Rickie",
    displayName: "Rickie Fowler",
    slug: "rickie-fowler",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  jt: { name: "Thomas, Justin", displayName: "Justin Thomas", slug: "justin-thomas", dgId: 14139, country: "USA" },
  spieth: { name: "Spieth, Jordan", displayName: "Jordan Spieth", slug: "jordan-spieth", dgId: 14636, country: "USA" },
  cantlay: { name: "Cantlay, Patrick", displayName: "Patrick Cantlay", slug: "patrick-cantlay", dgId: 15466, country: "USA" },
  hideki: { name: "Matsuyama, Hideki", displayName: "Hideki Matsuyama", slug: "hideki-matsuyama", dgId: 13562, country: "JPN" },
  shane: { name: "Lowry, Shane", displayName: "Shane Lowry", slug: "shane-lowry", dgId: 13900, country: "IRL" },
  camSmith: { name: "Smith, Cameron", displayName: "Cameron Smith", slug: "cameron-smith", dgId: 15856, country: "AUS" },
  dj: { name: "Johnson, Dustin", displayName: "Dustin Johnson", slug: "dustin-johnson", dgId: 12422, country: "USA" },
  reed: { name: "Reed, Patrick", displayName: "Patrick Reed", slug: "patrick-reed", dgId: 14838, country: "USA" },
  sam: { name: "Burns, Sam", displayName: "Sam Burns", slug: "sam-burns", dgId: 19483, country: "USA" },
  max: { name: "Homa, Max", displayName: "Max Homa", slug: "max-homa", dgId: 17538, country: "USA" },
  wyndham: { name: "Clark, Wyndham", displayName: "Wyndham Clark", slug: "wyndham-clark", dgId: 23604, country: "USA" },
  tony: { name: "Finau, Tony", displayName: "Tony Finau", slug: "tony-finau", dgId: 11676, country: "USA" },
  sahith: { name: "Theegala, Sahith", displayName: "Sahith Theegala", slug: "sahith-theegala", dgId: 23014, country: "USA" },
  corey: { name: "Conners, Corey", displayName: "Corey Conners", slug: "corey-conners", dgId: 17576, country: "CAN" },
  fitz: { name: "Fitzpatrick, Matt", displayName: "Matt Fitzpatrick", slug: "matt-fitzpatrick", dgId: 17646, country: "ENG" }
};

function p(key) {
  return PLAYERS[key];
}

function m(playerA, playerB, startYear = 2020, dataNote = null) {
  return {
    playerA: p(playerA),
    playerB: p(playerB),
    startYear,
    ...(dataNote ? { dataNote } : {})
  };
}

const PRIME_SEASONS = {
  "byron-nelson": {
    year: "1945",
    label: "1945, 18-win season"
  },
  "nick-faldo": {
  year: "1990",
  label: "1990, Masters and Open season"
  },
  "sam-snead": {
    year: "1950",
    label: "1950, 11-win season"
  },
  "jack-nicklaus": {
    year: "1972",
    label: "1972, Masters and U.S. Open season"
  },
  "tiger-woods": {
    year: "2000",
    label: "2000, peak Tiger"
  },
  "phil-mickelson": {
    year: "2005",
    label: "2005, major-winning prime"
  },
  "rory-mcilroy": {
    year: "2014",
    label: "2014, two-major season"
  },
  "scottie-scheffler": {
    year: "2024",
    label: "2024, dominant modern season"
  },
  "bryson-dechambeau": {
    year: "2024",
    label: "2024, U.S. Open season"
  },
  "patrick-reed": {
    year: "2018",
    label: "2018, Masters season"
  },
  "rickie-fowler": {
    year: "2015",
    label: "2015, peak Rickie"
  }
};

/*
  Prime vs Prime only generates when both players have manual files
  and the selected season exists inside those files.

  Safe to add players to PLAYERS and PRIME_SEASONS before their files exist.
  Do not add them to PRIME_MATCHUPS until the manual JSON is uploaded.
*/
const PRIME_MATCHUPS = [
  { playerA: p("scottie"), playerB: p("rory") },
  { playerA: p("scottie"), playerB: p("jack") },
  { playerA: p("scottie"), playerB: p("nickFaldo") },

  { playerA: p("jack"), playerB: p("tiger") },
  { playerA: p("tiger"), playerB: p("scottie") },

  { playerA: p("byron"), playerB: p("jack") },
  { playerA: p("byron"), playerB: p("tiger") },
  { playerA: p("byron"), playerB: p("nickFaldo") },

  { playerA: p("nickFaldo"), playerB: p("jack") },
  { playerA: p("nickFaldo"), playerB: p("tiger") }

  // Add these only after Bryson's manual file has seasons["2024"]:
  // { playerA: p("scottie"), playerB: p("bryson") },
  // { playerA: p("rory"), playerB: p("bryson") },

  // Add these after Rickie Fowler's manual file exists with seasons["2015"]:
  // { playerA: p("rickie"), playerB: p("reed") },
  // { playerA: p("rickie"), playerB: p("rory") },

  // Add these after Patrick Reed's manual file exists with seasons["2018"]:
  // { playerA: p("reed"), playerB: p("rory") },
  // { playerA: p("reed"), playerB: p("bryson") }
];
const MATCHUPS = [
  m("scottie", "rory", 2020),
  m("scottie", "bryson", 2020),
  m("scottie", "xander", 2020),
  m("scottie", "rahm", 2020),
  m("scottie", "collin", 2020),
  m("scottie", "viktor", 2020),
  m("scottie", "tommy", 2020),
  m("scottie", "brooks", 2020),
  m("scottie", "jt", 2020),
  m("scottie", "spieth", 2020),
  m("scottie", "cantlay", 2020),
  m("scottie", "hideki", 2020),
  m("scottie", "sam", 2020),
  m("scottie", "max", 2020),
  m("scottie", "wyndham", 2020),
  m("scottie", "tony", 2020),

  m("rory", "bryson", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "rahm", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "brooks", 2012, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "xander", 2015, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "collin", 2019),
  m("rory", "ludvig", 2023),
  m("rory", "viktor", 2019),
  m("rory", "tommy", 2010, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "jt", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "spieth", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "cantlay", 2012, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "hideki", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "shane", 2009, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "camSmith", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "dj", 2008, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rory", "reed", 2011, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),

  m("bryson", "brooks", 2016, "Uses manual Brooks Koepka results before 2017 where available, then automatic results from 2017 onward."),
  m("bryson", "rahm", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("bryson", "xander", 2015, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("bryson", "collin", 2019),
  m("bryson", "jt", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("bryson", "spieth", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("bryson", "camSmith", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("bryson", "dj", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),

  m("rahm", "xander", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rahm", "collin", 2019),
  m("rahm", "brooks", 2016, "Uses manual Brooks Koepka results before 2017 where available, then automatic results from 2017 onward."),
  m("rahm", "viktor", 2019),
  m("rahm", "jt", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("rahm", "spieth", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),

  m("xander", "collin", 2019),
  m("xander", "viktor", 2019),
  m("xander", "ludvig", 2023),
  m("xander", "jt", 2015, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("xander", "spieth", 2015, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("xander", "cantlay", 2015, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("xander", "hideki", 2015, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),

  m("collin", "viktor", 2019),
  m("collin", "ludvig", 2023),
  m("collin", "jt", 2019),
  m("collin", "spieth", 2019),
  m("collin", "cantlay", 2019),
  m("collin", "hideki", 2019),

  m("jt", "spieth", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("jt", "hideki", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("jt", "cantlay", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("spieth", "hideki", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("spieth", "cantlay", 2013, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("sam", "sahith", 2020),
  m("max", "wyndham", 2020),
  m("corey", "fitz", 2020),
  m("corey", "tommy", 2010, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),
  m("fitz", "tommy", 2014, "Uses manual results before 2017 where available, then automatic results from 2017 onward."),

  m("tiger", "rory", 2007, "Uses manual Tiger Woods and Rory McIlroy results before 2017 where available, then automatic results from 2017 onward."),
  m("tiger", "scottie", 2020, "Limited to shared starts during Scottie Scheffler's PGA Tour era."),
  m("tiger", "bryson", 2016, "Uses manual Tiger Woods and Bryson DeChambeau results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "scottie", 2020, "Limited to shared starts during Scottie Scheffler's PGA Tour era."),
  m("tiger", "rahm", 2016, "Uses manual Tiger Woods and Jon Rahm results before 2017 where available, then automatic results from 2017 onward."),
  m("tiger", "xander", 2015, "Uses manual Tiger Woods and Xander Schauffele results before 2017 where available, then automatic results from 2017 onward."),
  m("tiger", "collin", 2019, "Limited to shared starts during Collin Morikawa's PGA Tour era."),

  m("tiger", "phil", 1996, "Uses manual Tiger Woods and Phil Mickelson results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "rory", 2007, "Uses manual Phil Mickelson and Rory McIlroy results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "brooks", 2012, "Uses manual Phil Mickelson and Brooks Koepka results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "rahm", 2016, "Uses manual Phil Mickelson and Jon Rahm results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "bryson", 2016, "Uses manual Phil Mickelson and Bryson DeChambeau results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "xander", 2015, "Uses manual Phil Mickelson and Xander Schauffele results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "jt", 2013, "Uses manual Phil Mickelson and Justin Thomas results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "spieth", 2013, "Uses manual Phil Mickelson and Jordan Spieth results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "hideki", 2013, "Uses manual Phil Mickelson and Hideki Matsuyama results before 2017 where available, then automatic results from 2017 onward."),
  m("phil", "dj", 2008, "Uses manual Phil Mickelson and Dustin Johnson results before 2017 where available, then automatic results from 2017 onward."),

  m("jack", "tiger", 1996, "Uses manual Jack Nicklaus results where available, plus Tiger Woods results from manual and automatic sources."),
  m("jack", "phil", 1992, "Uses manual Jack Nicklaus results where available, plus Phil Mickelson results from manual and automatic sources."),
  m("jack", "rory", 2007, "Uses manual Jack Nicklaus results where available, plus Rory McIlroy results from manual and automatic sources."),

  m("ludvig", "rahm", 2023),
  m("ludvig", "scottie", 2023),
  m("ludvig", "bryson", 2023),
  m("ludvig", "brooks", 2023),

  m("brooks", "xander", 2015, "Uses manual Brooks Koepka and Xander Schauffele results before 2017 where available, then automatic results from 2017 onward."),
  m("brooks", "collin", 2019),
  m("brooks", "viktor", 2019),

  m("rahm", "camSmith", 2016, "Uses manual results before 2017 where available, then automatic results from 2017 onward.")
];

const REQUEST_DELAY_MS = 500;
const RATE_LIMIT_WAIT_MS = 5 * 60 * 1000 + 15000;

const eventResultsCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataGolfUrl(endpoint, params = {}) {
  const url = new URL(`https://feeds.datagolf.com/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("file_format", "json");
  url.searchParams.set("key", API_KEY);

  return url.toString();
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url);

  if (response.status === 429 && attempt <= 2) {
    console.warn(`[H2H] Rate limited. Waiting 5 minutes before retry ${attempt}...`);
    await sleep(RATE_LIMIT_WAIT_MS);
    return fetchJson(url, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DataGolf request failed: ${response.status} ${text}`);
  }

  return response.json();
}

function normalizeFinishValue(finText) {
  if (!finText) return null;

  const raw = String(finText).trim().toUpperCase();

  if (!raw || raw === "-" || raw === "NA") return null;

  if (raw === "CUT" || raw === "MC") {
    return { type: "missed_cut", rank: 999 };
  }

  if (raw === "WD" || raw === "DQ") {
    return { type: raw.toLowerCase(), rank: null };
  }

  const numeric = Number(raw.replace(/^P/i, "").replace(/^T/i, ""));

  if (Number.isFinite(numeric)) {
    return {
      type: "finish",
      rank: numeric
    };
  }

  return {
    type: "unknown",
    rank: null
  };
}

function compareFinishes(playerAResult, playerBResult, playerA, playerB) {
  const a = normalizeFinishValue(playerAResult.fin_text);
  const b = normalizeFinishValue(playerBResult.fin_text);

  if (!a || !b) {
    return {
      winner: "unknown",
      edge: "Unknown result",
      counted: false
    };
  }

  if (a.type === "wd" || a.type === "dq" || b.type === "wd" || b.type === "dq") {
    return {
      winner: "excluded",
      edge: "Excluded due to WD/DQ",
      counted: false
    };
  }

  if (a.rank === b.rank) {
    return {
      winner: "tie",
      edge: "Tie",
      counted: true
    };
  }

  if (a.rank < b.rank) {
    const diff = b.rank - a.rank;

    return {
      winner: playerA.slug,
      edge: `${playerA.displayName.split(" ")[0]} by ${diff} spot${diff === 1 ? "" : "s"}`,
      counted: true
    };
  }

  const diff = a.rank - b.rank;

  return {
    winner: playerB.slug,
    edge: `${playerB.displayName.split(" ")[0]} by ${diff} spot${diff === 1 ? "" : "s"}`,
    counted: true
  };
}

function sortEventsNewestFirst(events) {
  return events.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return new Date(b.date || "1900-01-01") - new Date(a.date || "1900-01-01");
  });
}

async function getEventList(startYear) {
  const url = dataGolfUrl("historical-raw-data/event-list", {
    tour: TOUR
  });

  const data = await fetchJson(url);

  const rows = Array.isArray(data) ? data : data.events || data.data || [];

  console.log("[H2H] Historical event-list returned:", rows.length, "events");

  return sortEventsNewestFirst(
    rows
      .filter((event) => {
        const year = Number(event.calendar_year || event.year);
        return year >= startYear && year <= CURRENT_YEAR;
      })
      .map((event) => ({
        year: Number(event.calendar_year || event.year),
        date: event.date || "",
        eventId: event.event_id,
        eventName: event.event_name,
        tour: event.tour || TOUR
      }))
  );
}

async function getEventResults(event) {
  const cacheKey = `${event.tour || TOUR}:${event.year}:${event.eventId}`;

  if (eventResultsCache.has(cacheKey)) {
    return eventResultsCache.get(cacheKey);
  }

  const url = dataGolfUrl("historical-raw-data/rounds", {
    tour: event.tour || TOUR,
    event_id: event.eventId,
    year: event.year
  });

  await sleep(REQUEST_DELAY_MS);

  const data = await fetchJson(url);

  const rows = Array.isArray(data)
    ? data
    : data.scores ||
      data.event_stats ||
      data.results ||
      data.data ||
      data.event_results ||
      data.players ||
      data.event_data ||
      data.finishes ||
      [];

  eventResultsCache.set(cacheKey, rows);
  return rows;
}

function matchupId(playerA, playerB) {
  return `${playerA.slug}-vs-${playerB.slug}`;
}

function validateMatchup(matchup) {
  const missing = [];

  if (!matchup.playerA?.dgId && !matchup.playerA?.manualOnly) {
    missing.push(matchup.playerA?.displayName || "Player A");
  }

  if (!matchup.playerB?.dgId && !matchup.playerB?.manualOnly) {
    missing.push(matchup.playerB?.displayName || "Player B");
  }

  if (missing.length) {
    throw new Error(`Missing DataGolf ID for ${missing.join(" and ")}`);
  }
}

function getFinish(event) {
  return event?.finish ?? event?.position ?? "";
}

function getToPar(event) {
  return event?.toPar ?? event?.overall ?? null;
}

function isWinValue(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "1" || raw === "P1";
}

function isWdOrDqValue(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "W/D" || raw === "WD" || raw === "DQ" || raw === "DNS";
}

function isMissedCutValue(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "CUT" || raw === "MC";
}

function isCountableStartValue(value) {
  const raw = String(value || "").trim().toUpperCase();

  if (!raw || raw === "-") return false;
  if (isWdOrDqValue(raw)) return false;

  return true;
}

function isMadeCutValue(value) {
  if (!isCountableStartValue(value)) return false;
  return !isMissedCutValue(value);
}

function finishNumber(value) {
  if (!value) return null;

  const raw = String(value).trim().toUpperCase();

  if (raw === "CUT" || raw === "MC") return 999;
  if (raw === "W/D" || raw === "WD" || raw === "DQ" || raw === "DNS" || raw === "-") return null;

  const cleaned = raw.replace(/^P/, "").replace(/^T/, "");
  const match = cleaned.match(/\d+/);

  return match ? Number(match[0]) : null;
}

function parseToPar(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  if (!text || text === "-") return null;
  if (text.toUpperCase() === "E") return 0;

  const number = Number(text.replace("+", ""));

  if (!Number.isFinite(number)) return null;

  if (Math.abs(number) > 60) return null;

  return number;
}

function isMajorSeasonEvent(event) {
  const name = String(event?.tournament || event?.eventName || "").toLowerCase();

  return (
    name.includes("masters") ||
    name.includes("u.s. open") ||
    name.includes("us open") ||
    name.includes("pga championship") ||
    name.includes("the open championship")
  );
}

function getPrimeSeason(player) {
  const manual = loadManualResults(player.slug);
  const prime = PRIME_SEASONS[player.slug];

  if (!manual) {
    throw new Error(`Missing manual results file for ${player.displayName}`);
  }

  if (!prime) {
    throw new Error(`Missing prime season config for ${player.displayName}`);
  }

  const season = manual.seasons?.[prime.year];

  if (!season || !Array.isArray(season.events)) {
    throw new Error(`Missing ${prime.year} season for ${player.displayName}`);
  }

  return {
    player,
    year: prime.year,
    label: prime.label,
    events: season.events
  };
}

function summarizePrimeSeason(primeSeason) {
  const allEvents = primeSeason.events || [];

  const officialEvents = allEvents.filter((event) => {
    return event.official !== false && event.officialStart !== false && event.unofficial !== true;
  });

  const countableEvents = officialEvents.filter((event) => {
    return isCountableStartValue(getFinish(event));
  });

  const madeCuts = countableEvents.filter((event) => {
    return isMadeCutValue(getFinish(event));
  });

  const wins = countableEvents.filter((event) => {
    return isWinValue(getFinish(event));
  }).length;

  const majors = countableEvents.filter((event) => {
    return isMajorSeasonEvent(event) && isWinValue(getFinish(event));
  }).length;

  const top5s = countableEvents.filter((event) => {
    const finish = finishNumber(getFinish(event));
    return finish !== null && finish <= 5;
  }).length;

  const top10s = countableEvents.filter((event) => {
    const finish = finishNumber(getFinish(event));
    return finish !== null && finish <= 10;
  }).length;

  const finishValues = madeCuts
    .map((event) => finishNumber(getFinish(event)))
    .filter((value) => value !== null && value < 999);

  const toParValues = madeCuts
    .map((event) => parseToPar(getToPar(event)))
    .filter((value) => value !== null);

  const averageFinish = finishValues.length
    ? finishValues.reduce((sum, value) => sum + value, 0) / finishValues.length
    : null;

  const averageScoreToPar = toParValues.length
    ? toParValues.reduce((sum, value) => sum + value, 0) / toParValues.length
    : null;

  return {
    player: primeSeason.player,
    year: primeSeason.year,
    label: primeSeason.label,

    eventsPlayed: countableEvents.length,
    officialEvents: officialEvents.length,

    wins,
    majors,
    top5s,
    top10s,

    madeCuts: madeCuts.length,
    missedCuts: countableEvents.length - madeCuts.length,

    cutRate: countableEvents.length ? madeCuts.length / countableEvents.length : null,
    winRate: countableEvents.length ? wins / countableEvents.length : null,
    top10Rate: countableEvents.length ? top10s / countableEvents.length : null,

    averageFinish,
    averageScoreToPar,

    events: allEvents
  };
}

function roundMetric(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function comparePrimeMetric(playerAValue, playerBValue, lowerIsBetter = false) {
  if (playerAValue === null || playerAValue === undefined) return "playerB";
  if (playerBValue === null || playerBValue === undefined) return "playerA";

  if (playerAValue === playerBValue) return "tie";

  if (lowerIsBetter) {
    return playerAValue < playerBValue ? "playerA" : "playerB";
  }

  return playerAValue > playerBValue ? "playerA" : "playerB";
}

async function buildMatchup(matchup) {
  const { playerA, playerB, startYear } = matchup;
  const manualA = loadManualResults(playerA.slug);
  const manualB = loadManualResults(playerB.slug);

  console.log(
    "[H2H] Manual data:",
    playerA.slug,
    !!manualA,
    playerB.slug,
    !!manualB
  );

  validateMatchup(matchup);

  const dataGolfEvents = await getEventList(startYear);

  const manualEvents = [
    ...getManualEventsForRange(manualA, startYear),
    ...getManualEventsForRange(manualB, startYear)
  ];

  const eventMap = new Map();

  [...dataGolfEvents, ...manualEvents].forEach((event) => {
    const key = `${event.year}:${normalizeEventName(event.eventName)}`;
    const existing = eventMap.get(key);

    if (!existing) {
      eventMap.set(key, event);
      return;
    }

    if (!existing.date && event.date) {
      eventMap.set(key, event);
    }
  });

  const allEvents = sortEventsNewestFirst(Array.from(eventMap.values()));
  const sharedStarts = [];

  console.log("");
  console.log(`[H2H] Building ${playerA.displayName} vs ${playerB.displayName}`);
  console.log(`[H2H] Checking ${allEvents.length} ${TOUR.toUpperCase()} events from ${startYear}-${CURRENT_YEAR}...`);

  for (let i = 0; i < allEvents.length; i += 1) {
    const event = allEvents[i];

    try {
      console.log(`[H2H] ${i + 1}/${allEvents.length}: ${event.year} ${event.eventName}`);

      const results = event.manualEvent ? [] : await getEventResults(event);

      let playerAResult = playerA.dgId
        ? results.find((row) => Number(row.dg_id) === playerA.dgId)
        : null;

      let playerBResult = playerB.dgId
        ? results.find((row) => Number(row.dg_id) === playerB.dgId)
        : null;

      if ((!playerAResult || event.year < 2017) && manualA) {
        const manualEvent = findManualResult(manualA, event);

        if (manualEvent) {
          console.log(
            "[H2H] Manual match found:",
            playerA.slug,
            event.year,
            event.eventName,
            manualEvent.tournament,
            manualEvent.finish
          );

          playerAResult = {
            fin_text: manualEvent.finish,
            earnings: manualEvent.earnings ?? null,
            fec_points: null,
            dg_points: null,
            manual: true
          };
        }
      }

      if ((!playerBResult || event.year < 2017) && manualB) {
        const manualEvent = findManualResult(manualB, event);

        if (manualEvent) {
          console.log(
            "[H2H] Manual match found:",
            playerB.slug,
            event.year,
            event.eventName,
            manualEvent.tournament,
            manualEvent.finish
          );

          playerBResult = {
            fin_text: manualEvent.finish,
            earnings: manualEvent.earnings ?? null,
            fec_points: null,
            dg_points: null,
            manual: true
          };
        }
      }

      if (!playerAResult || !playerBResult) {
        continue;
      }

      const comparison = compareFinishes(playerAResult, playerBResult, playerA, playerB);

      sharedStarts.push({
        year: event.year,
        date: event.date,
        eventId: event.eventId,
        eventName: event.eventName,
        tour: event.tour,
        playerA: {
          name: playerA.displayName,
          dgId: playerA.dgId,
          finish: playerAResult.fin_text,
          earnings: playerAResult.earnings ?? null,
          fedExCupPoints: playerAResult.fec_points ?? null,
          dgPoints: playerAResult.dg_points ?? null,
          manual: !!playerAResult.manual
        },
        playerB: {
          name: playerB.displayName,
          dgId: playerB.dgId,
          finish: playerBResult.fin_text,
          earnings: playerBResult.earnings ?? null,
          fedExCupPoints: playerBResult.fec_points ?? null,
          dgPoints: playerBResult.dg_points ?? null,
          manual: !!playerBResult.manual
        },
        h2hWinner: comparison.winner,
        edge: comparison.edge,
        counted: comparison.counted
      });
    } catch (error) {
      console.warn(`[H2H] Skipped ${event.year} ${event.eventName}: ${error.message}`);
    }
  }

  const countedStarts = sharedStarts.filter((event) => event.counted);

  const playerAWins = countedStarts.filter((event) => event.h2hWinner === playerA.slug).length;
  const playerBWins = countedStarts.filter((event) => event.h2hWinner === playerB.slug).length;
  const ties = countedStarts.filter((event) => event.h2hWinner === "tie").length;

  const output = {
    matchupId: matchupId(playerA, playerB),
    updatedAt: new Date().toISOString(),
    source: "DataGolf Historical Event Data plus manual player results where needed",
    rules: {
      mainStat: "shared-start wins",
      explanation: "This compares tournaments where both players were in the same field.",
      counting: "Better finish wins the shared start. Tied finishes count as ties. WD and DQ are excluded by default. Missed cuts count below made cuts.",
      dataNote: matchup.dataNote || null
    },
    playerA,
    playerB,
    summary: {
      since: startYear,
      sharedStarts: countedStarts.length,
      playerAWins,
      playerBWins,
      ties
    },
    events: sharedStarts
  };

  const outputDir = path.join(process.cwd(), "data", "h2h", "matchups");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${output.matchupId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`[H2H] Wrote ${outputPath}`);
  console.log(`[H2H] ${playerA.displayName}: ${playerAWins}`);
  console.log(`[H2H] ${playerB.displayName}: ${playerBWins}`);
  console.log(`[H2H] Ties: ${ties}`);
  console.log(`[H2H] Shared starts: ${countedStarts.length}`);
}

async function buildPrimeMatchup(matchup) {
  const { playerA, playerB } = matchup;

  console.log("");
  console.log(`[H2H] Building Prime vs Prime: ${playerA.displayName} vs ${playerB.displayName}`);

  const primeA = summarizePrimeSeason(getPrimeSeason(playerA));
  const primeB = summarizePrimeSeason(getPrimeSeason(playerB));

  const metrics = [
    {
      key: "wins",
      label: "Wins",
      playerA: primeA.wins,
      playerB: primeB.wins,
      winner: comparePrimeMetric(primeA.wins, primeB.wins)
    },
    {
      key: "majors",
      label: "Majors",
      playerA: primeA.majors,
      playerB: primeB.majors,
      winner: comparePrimeMetric(primeA.majors, primeB.majors)
    },
    {
      key: "top5s",
      label: "Top 5s",
      playerA: primeA.top5s,
      playerB: primeB.top5s,
      winner: comparePrimeMetric(primeA.top5s, primeB.top5s)
    },
    {
      key: "top10s",
      label: "Top 10s",
      playerA: primeA.top10s,
      playerB: primeB.top10s,
      winner: comparePrimeMetric(primeA.top10s, primeB.top10s)
    },
    {
      key: "eventsPlayed",
      label: "Events played",
      playerA: primeA.eventsPlayed,
      playerB: primeB.eventsPlayed,
      winner: "neutral"
    },
    {
      key: "cutRate",
      label: "Cut rate",
      playerA: roundMetric(primeA.cutRate === null ? null : primeA.cutRate * 100, 1),
      playerB: roundMetric(primeB.cutRate === null ? null : primeB.cutRate * 100, 1),
      suffix: "%",
      winner: comparePrimeMetric(primeA.cutRate, primeB.cutRate)
    },
    {
      key: "averageFinish",
      label: "Average finish",
      playerA: roundMetric(primeA.averageFinish, 1),
      playerB: roundMetric(primeB.averageFinish, 1),
      winner: comparePrimeMetric(primeA.averageFinish, primeB.averageFinish, true)
    },
    {
      key: "averageScoreToPar",
      label: "Average score to par",
      playerA: roundMetric(primeA.averageScoreToPar, 1),
      playerB: roundMetric(primeB.averageScoreToPar, 1),
      winner: comparePrimeMetric(primeA.averageScoreToPar, primeB.averageScoreToPar, true)
    },
    {
      key: "winRate",
      label: "Win rate",
      playerA: roundMetric(primeA.winRate === null ? null : primeA.winRate * 100, 1),
      playerB: roundMetric(primeB.winRate === null ? null : primeB.winRate * 100, 1),
      suffix: "%",
      winner: comparePrimeMetric(primeA.winRate, primeB.winRate)
    },
    {
      key: "top10Rate",
      label: "Top 10 rate",
      playerA: roundMetric(primeA.top10Rate === null ? null : primeA.top10Rate * 100, 1),
      playerB: roundMetric(primeB.top10Rate === null ? null : primeB.top10Rate * 100, 1),
      suffix: "%",
      winner: comparePrimeMetric(primeA.top10Rate, primeB.top10Rate)
    }
  ];

  const playerAMetricWins = metrics.filter((metric) => metric.winner === "playerA").length;
  const playerBMetricWins = metrics.filter((metric) => metric.winner === "playerB").length;
  const metricTies = metrics.filter((metric) => metric.winner === "tie").length;

  const output = {
    matchupId: `${playerA.slug}-vs-${playerB.slug}-prime`,
    type: "prime-scorecard",
    updatedAt: new Date().toISOString(),
    source: "Manual player results",
    rules: {
      mainStat: "Prime vs Prime",
      explanation: "This compares each player's best selected year of their career. It is not based on shared starts.",
      counting: "Metrics compare season dominance: wins, majors, top finishes, rates, average finish, and average score to par.",
      dataNote: "Historical score-to-par values above 60 or below -60 are ignored to avoid bad scraped total-score values."
    },
    playerA,
    playerB,
    primeA,
    primeB,
    summary: {
      playerAMetricWins,
      playerBMetricWins,
      metricTies,
      totalMetrics: metrics.filter((metric) => metric.winner !== "neutral").length
    },
    metrics
  };

  const outputDir = path.join(process.cwd(), "data", "h2h", "prime-matchups");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${output.matchupId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`[H2H] Wrote ${outputPath}`);
  console.log(`[H2H] ${playerA.displayName} metric wins: ${playerAMetricWins}`);
  console.log(`[H2H] ${playerB.displayName} metric wins: ${playerBMetricWins}`);
  console.log(`[H2H] Metric ties: ${metricTies}`);
}

async function main() {
  console.log(`[H2H] Starting ${MATCHUPS.length} shared-start matchups...`);

  const matchupsToRun = TEST_ONLY_TIGER_RORY
    ? MATCHUPS.filter(
        (matchup) =>
          matchup.playerA.slug === "tiger-woods" &&
          matchup.playerB.slug === "rory-mcilroy"
      )
    : MATCHUPS;

  for (const matchup of matchupsToRun) {
    await buildMatchup(matchup);
  }

  console.log(`[H2H] Starting ${PRIME_MATCHUPS.length} Prime vs Prime matchups...`);

  for (const matchup of PRIME_MATCHUPS) {
    try {
      await buildPrimeMatchup(matchup);
    } catch (error) {
      console.warn(
        `[H2H] Skipped Prime vs Prime ${matchup.playerA.displayName} vs ${matchup.playerB.displayName}: ${error.message}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
