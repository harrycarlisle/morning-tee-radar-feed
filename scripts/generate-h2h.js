const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DATAGOLF_API_KEY;

if (!API_KEY) {
  throw new Error("Missing DATAGOLF_API_KEY environment variable.");
}

const TOUR = "pga";
const CURRENT_YEAR = new Date().getFullYear();

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

  m("rory", "bryson", 2020),
  m("rory", "rahm", 2020),
  m("rory", "brooks", 2020),
  m("rory", "xander", 2020),
  m("rory", "collin", 2020),
  m("rory", "ludvig", 2023),
  m("rory", "viktor", 2020),
  m("rory", "tommy", 2020),
  m("rory", "jt", 2020),
  m("rory", "spieth", 2020),
  m("rory", "cantlay", 2020),
  m("rory", "hideki", 2020),
  m("rory", "shane", 2020),
  m("rory", "camSmith", 2020),
  m("rory", "dj", 2020),
  m("rory", "reed", 2020),

  m("bryson", "brooks", 2020),
  m("bryson", "rahm", 2020),
  m("bryson", "xander", 2020),
  m("bryson", "collin", 2020),
  m("bryson", "jt", 2020),
  m("bryson", "spieth", 2020),
  m("bryson", "camSmith", 2020),
  m("bryson", "dj", 2020),

  m("rahm", "xander", 2020),
  m("rahm", "collin", 2020),
  m("rahm", "brooks", 2020),
  m("rahm", "viktor", 2020),
  m("rahm", "jt", 2020),
  m("rahm", "spieth", 2020),

  m("xander", "collin", 2020),
  m("xander", "viktor", 2020),
  m("xander", "ludvig", 2023),
  m("xander", "jt", 2020),
  m("xander", "spieth", 2020),
  m("xander", "cantlay", 2020),
  m("xander", "hideki", 2020),

  m("collin", "viktor", 2020),
  m("collin", "ludvig", 2023),
  m("collin", "jt", 2020),
  m("collin", "spieth", 2020),
  m("collin", "cantlay", 2020),
  m("collin", "hideki", 2020),

  m("jt", "spieth", 2020),
  m("jt", "hideki", 2020),
  m("jt", "cantlay", 2020),
  m("spieth", "hideki", 2020),
  m("spieth", "cantlay", 2020),
  m("sam", "sahith", 2020),
  m("max", "wyndham", 2020),
  m("corey", "fitz", 2020),
  m("corey", "tommy", 2020),
  m("fitz", "tommy", 2020),

  m("tiger", "rory", 2017, "Limited to available DataGolf event data from 2017 onward, so this does not capture Tiger's full prime."),
  m("tiger", "phil", 2017, "Limited to available DataGolf event data from 2017 onward, so this does not capture the full Tiger vs Phil era."),
  m("tiger", "scottie", 2020, "Limited to shared starts during Scottie Scheffler's PGA Tour era."),
  m("tiger", "bryson", 2017, "Limited to available DataGolf event data from 2017 onward."),
  m("phil", "rory", 2017, "Limited to available DataGolf event data from 2017 onward."),
  m("phil", "scottie", 2020, "Limited to shared starts during Scottie Scheffler's PGA Tour era."),
  m("phil", "brooks", 2017, "Limited to available DataGolf event data from 2017 onward."),
  m("tiger", "rahm", 2017, "Limited to available DataGolf event data from 2017 onward."),
  m("tiger", "xander", 2017, "Limited to available DataGolf event data from 2017 onward."),
  m("tiger", "collin", 2020, "Limited to available DataGolf event data from 2020 onward."),

  m("phil", "rahm", 2017, "Limited to available DataGolf event data from 2017 onward."),
  m("phil", "bryson", 2017, "Limited to available DataGolf event data from 2017 onward."),

  m("ludvig", "rahm", 2023),
  m("ludvig", "scottie", 2023),
  m("ludvig", "bryson", 2023),
  m("ludvig", "brooks", 2023),

  m("brooks", "xander", 2020),
  m("brooks", "collin", 2020),
  m("brooks", "viktor", 2020),

  m("rahm", "camSmith", 2020)
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

  const numeric = Number(raw.replace(/^T/i, ""));

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
  const url = dataGolfUrl("historical-event-data/event-list", {
    tour: TOUR
  });

  const data = await fetchJson(url);

  const rows = Array.isArray(data) ? data : data.events || data.data || [];

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

  const url = dataGolfUrl("historical-event-data/events", {
    tour: event.tour || TOUR,
    event_id: event.eventId,
    year: event.year
  });

  await sleep(REQUEST_DELAY_MS);

  const data = await fetchJson(url);

  const rows = Array.isArray(data)
    ? data
    : data.event_stats ||
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

  if (!matchup.playerA?.dgId) missing.push(matchup.playerA?.displayName || "Player A");
  if (!matchup.playerB?.dgId) missing.push(matchup.playerB?.displayName || "Player B");

  if (missing.length) {
    throw new Error(`Missing DataGolf ID for ${missing.join(" and ")}`);
  }
}

async function buildMatchup(matchup) {
  const { playerA, playerB, startYear } = matchup;

  validateMatchup(matchup);

  const allEvents = await getEventList(startYear);
  const sharedStarts = [];

  console.log("");
  console.log(`[H2H] Building ${playerA.displayName} vs ${playerB.displayName}`);
  console.log(`[H2H] Checking ${allEvents.length} ${TOUR.toUpperCase()} events from ${startYear}-${CURRENT_YEAR}...`);

  for (let i = 0; i < allEvents.length; i += 1) {
    const event = allEvents[i];

    try {
      console.log(`[H2H] ${i + 1}/${allEvents.length}: ${event.year} ${event.eventName}`);

      const results = await getEventResults(event);

      const playerAResult = results.find((row) => Number(row.dg_id) === playerA.dgId);
      const playerBResult = results.find((row) => Number(row.dg_id) === playerB.dgId);

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
          dgPoints: playerAResult.dg_points ?? null
        },
        playerB: {
          name: playerB.displayName,
          dgId: playerB.dgId,
          finish: playerBResult.fin_text,
          earnings: playerBResult.earnings ?? null,
          fedExCupPoints: playerBResult.fec_points ?? null,
          dgPoints: playerBResult.dg_points ?? null
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
    source: "DataGolf Historical Event Data",
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

async function main() {
  console.log(`[H2H] Starting ${MATCHUPS.length} matchups...`);

  for (const matchup of MATCHUPS) {
    await buildMatchup(matchup);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
