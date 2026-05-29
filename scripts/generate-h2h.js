const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DATAGOLF_API_KEY;

if (!API_KEY) {
  throw new Error("Missing DATAGOLF_API_KEY environment variable.");
}

const TOUR = "pga";
const CURRENT_YEAR = new Date().getFullYear();

const MATCHUPS = [
  {
    playerA: {
      name: "Scheffler, Scottie",
      displayName: "Scottie Scheffler",
      slug: "scottie-scheffler",
      dgId: 18417,
      country: "USA"
    },
    playerB: {
      name: "McIlroy, Rory",
      displayName: "Rory McIlroy",
      slug: "rory-mcilroy",
      dgId: 10091,
      country: "NIR"
    },
    startYear: 2020
  },
  {
    playerA: {
      name: "DeChambeau, Bryson",
      displayName: "Bryson DeChambeau",
      slug: "bryson-dechambeau",
      dgId: 19841,
      country: "USA"
    },
    playerB: {
      name: "McIlroy, Rory",
      displayName: "Rory McIlroy",
      slug: "rory-mcilroy",
      dgId: 10091,
      country: "NIR"
    },
    startYear: 2020
  },
  {
    playerA: {
      name: "Scheffler, Scottie",
      displayName: "Scottie Scheffler",
      slug: "scottie-scheffler",
      dgId: 18417,
      country: "USA"
    },
    playerB: {
      name: "Rahm, Jon",
      displayName: "Jon Rahm",
      slug: "jon-rahm",
      dgId: 19195,
      country: "ESP"
    },
    startYear: 2020
  },
  {
    playerA: {
      name: "DeChambeau, Bryson",
      displayName: "Bryson DeChambeau",
      slug: "bryson-dechambeau",
      dgId: 19841,
      country: "USA"
    },
    playerB: {
      name: "Koepka, Brooks",
      displayName: "Brooks Koepka",
      slug: "brooks-koepka",
      dgId: 16243,
      country: "USA"
    },
    startYear: 2020
  }
    {
    playerA: { name: "Woods, Tiger", displayName: "Tiger Woods", slug: "tiger-woods", dgId: 5321, country: "USA" },
    playerB: { name: "McIlroy, Rory", displayName: "Rory McIlroy", slug: "rory-mcilroy", dgId: 10091, country: "NIR" },
    startYear: 2010
  },
  {
    playerA: { name: "Woods, Tiger", displayName: "Tiger Woods", slug: "tiger-woods", dgId: 5321, country: "USA" },
    playerB: { name: "Mickelson, Phil", displayName: "Phil Mickelson", slug: "phil-mickelson", dgId: 5322, country: "USA" },
    startYear: 2000
  },
  {
    playerA: { name: "Scheffler, Scottie", displayName: "Scottie Scheffler", slug: "scottie-scheffler", dgId: 18417, country: "USA" },
    playerB: { name: "DeChambeau, Bryson", displayName: "Bryson DeChambeau", slug: "bryson-dechambeau", dgId: 19841, country: "USA" },
    startYear: 2020
  },
  {
    playerA: { name: "Scheffler, Scottie", displayName: "Scottie Scheffler", slug: "scottie-scheffler", dgId: 18417, country: "USA" },
    playerB: { name: "Schauffele, Xander", displayName: "Xander Schauffele", slug: "xander-schauffele", dgId: 15450, country: "USA" },
    startYear: 2020
  },
  {
    playerA: { name: "McIlroy, Rory", displayName: "Rory McIlroy", slug: "rory-mcilroy", dgId: 10091, country: "NIR" },
    playerB: { name: "Rahm, Jon", displayName: "Jon Rahm", slug: "jon-rahm", dgId: 19195, country: "ESP" },
    startYear: 2020
  },
  {
    playerA: { name: "Morikawa, Collin", displayName: "Collin Morikawa", slug: "collin-morikawa", dgId: 17975, country: "USA" },
    playerB: { name: "Schauffele, Xander", displayName: "Xander Schauffele", slug: "xander-schauffele", dgId: 15450, country: "USA" },
    startYear: 2020
  },
  {
    playerA: { name: "Aberg, Ludvig", displayName: "Ludvig Åberg", slug: "ludvig-aberg", dgId: 29388, country: "SWE" },
    playerB: { name: "Scheffler, Scottie", displayName: "Scottie Scheffler", slug: "scottie-scheffler", dgId: 18417, country: "USA" },
    startYear: 2023
  }
];

const REQUEST_DELAY_MS = 1700;
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
      counting: "Better finish wins the shared start. Tied finishes count as ties. WD and DQ are excluded by default. Missed cuts count below made cuts."
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
