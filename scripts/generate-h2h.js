const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DATAGOLF_API_KEY;

if (!API_KEY) {
  throw new Error("Missing DATAGOLF_API_KEY environment variable.");
}

const PLAYER_A = {
  name: "Scheffler, Scottie",
  displayName: "Scottie Scheffler",
  slug: "scottie-scheffler",
  dgId: 18417,
  country: "USA"
};

const PLAYER_B = {
  name: "McIlroy, Rory",
  displayName: "Rory McIlroy",
  slug: "rory-mcilroy",
  dgId: 10091,
  country: "NIR"
};

const TOUR = "pga";
const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR = CURRENT_YEAR - 10;

function dataGolfUrl(endpoint, params = {}) {
  const url = new URL(`https://feeds.datagolf.com/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("file_format", "json");
  url.searchParams.set("key", API_KEY);

  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);

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

function compareFinishes(playerAResult, playerBResult) {
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
    return {
      winner: PLAYER_A.slug,
      edge: `${PLAYER_A.displayName.split(" ")[0]} by ${b.rank - a.rank} spot${b.rank - a.rank === 1 ? "" : "s"}`,
      counted: true
    };
  }

  return {
    winner: PLAYER_B.slug,
    edge: `${PLAYER_B.displayName.split(" ")[0]} by ${a.rank - b.rank} spot${a.rank - b.rank === 1 ? "" : "s"}`,
    counted: true
  };
}

function sortEventsNewestFirst(events) {
  return events.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return new Date(b.date || "1900-01-01") - new Date(a.date || "1900-01-01");
  });
}

async function getEventList() {
  const url = dataGolfUrl("historical-event-data/event-list", {
    tour: TOUR
  });

  const data = await fetchJson(url);

  const rows = Array.isArray(data) ? data : data.events || data.data || [];

  return rows
    .filter((event) => {
      const year = Number(event.calendar_year || event.year);
      return year >= START_YEAR && year <= CURRENT_YEAR;
    })
    .map((event) => ({
      year: Number(event.calendar_year || event.year),
      date: event.date || "",
      eventId: event.event_id,
      eventName: event.event_name,
      tour: event.tour || TOUR
    }));
}

async function getEventResults(event) {
  const url = dataGolfUrl("historical-event-data/events", {
    tour: TOUR,
    event_id: event.eventId,
    year: event.year
  });

  const data = await fetchJson(url);

  return Array.isArray(data) ? data : data.results || data.data || [];
}

async function buildMatchup() {
  const allEvents = sortEventsNewestFirst(await getEventList());
  const sharedStarts = [];

  for (const event of allEvents) {
    try {
      const results = await getEventResults(event);

      const playerAResult = results.find((row) => Number(row.dg_id) === PLAYER_A.dgId);
      const playerBResult = results.find((row) => Number(row.dg_id) === PLAYER_B.dgId);

      if (!playerAResult || !playerBResult) {
        continue;
      }

      const comparison = compareFinishes(playerAResult, playerBResult);

      sharedStarts.push({
        year: event.year,
        date: event.date,
        eventId: event.eventId,
        eventName: event.eventName,
        tour: event.tour,
        playerA: {
          name: PLAYER_A.displayName,
          dgId: PLAYER_A.dgId,
          finish: playerAResult.fin_text,
          earnings: playerAResult.earnings ?? null,
          fedExCupPoints: playerAResult.fec_points ?? null,
          dgPoints: playerAResult.dg_points ?? null
        },
        playerB: {
          name: PLAYER_B.displayName,
          dgId: PLAYER_B.dgId,
          finish: playerBResult.fin_text,
          earnings: playerBResult.earnings ?? null,
          fedExCupPoints: playerBResult.fec_points ?? null,
          dgPoints: playerBResult.dg_points ?? null
        },
        h2hWinner: comparison.winner,
        edge: comparison.edge,
        counted: comparison.counted
      });

      await new Promise((resolve) => setTimeout(resolve, 1400));
    } catch (error) {
      console.warn(`[H2H] Skipped ${event.year} ${event.eventName}: ${error.message}`);
    }
  }

  const countedStarts = sharedStarts.filter((event) => event.counted);

  const playerAWins = countedStarts.filter((event) => event.h2hWinner === PLAYER_A.slug).length;
  const playerBWins = countedStarts.filter((event) => event.h2hWinner === PLAYER_B.slug).length;
  const ties = countedStarts.filter((event) => event.h2hWinner === "tie").length;

  const output = {
    matchupId: `${PLAYER_A.slug}-vs-${PLAYER_B.slug}`,
    updatedAt: new Date().toISOString(),
    source: "DataGolf Historical Event Data",
    rules: {
      mainStat: "shared-start wins",
      explanation: "Golf does not have tennis-style head-to-head records, so this compares tournaments where both players were in the same field.",
      counting: "Better finish wins the shared start. Tied finishes count as ties. WD and DQ are excluded by default. Missed cuts count below made cuts."
    },
    playerA: PLAYER_A,
    playerB: PLAYER_B,
    summary: {
      since: START_YEAR,
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
  console.log(`[H2H] ${PLAYER_A.displayName}: ${playerAWins}`);
  console.log(`[H2H] ${PLAYER_B.displayName}: ${playerBWins}`);
  console.log(`[H2H] Ties: ${ties}`);
  console.log(`[H2H] Shared starts: ${countedStarts.length}`);
}

buildMatchup().catch((error) => {
  console.error(error);
  process.exit(1);
});
