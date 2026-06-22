const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DATAGOLF_API_KEY;

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

function manualEventToResult(manualEvent) {
  return {
    fin_text: manualEvent.finish ?? manualEvent.position ?? null,
    earnings: manualEvent.earnings ?? manualEvent.winnings ?? manualEvent.money ?? null,
    fec_points: manualEvent.fedExCupPoints ?? manualEvent.fedexcup_points ?? null,
    dg_points: null,
    manual: true,
    dataSource: "manual"
  };
}

function resolvePlayerResult(player, manualData, event, apiResults) {
  const manualEvent = findManualResult(manualData, event);

  if (manualEvent) {
    return manualEventToResult(manualEvent);
  }

  if (Number(event.year) < 2017 && manualData?.seasons) {
    return null;
  }

  if (!player.dgId) return null;

  const apiResult = apiResults.find((row) => Number(row.dg_id) === player.dgId);

  if (!apiResult) return null;

  return {
    ...apiResult,
    manual: false,
    dataSource: "api"
  };
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

  vijay: {
    name: "Singh, Vijay",
    displayName: "Vijay Singh",
    slug: "vijay-singh",
    dgId: null,
    country: "FIJ",
    manualOnly: true
  },

  arnoldPalmer: {
    name: "Palmer, Arnold",
    displayName: "Arnold Palmer",
    slug: "arnold-palmer",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  ernieEls: {
    name: "Els, Ernie",
    displayName: "Ernie Els",
    slug: "ernie-els",
    dgId: null,
    country: "RSA",
    manualOnly: true
  },

  fredCouples: {
    name: "Couples, Fred",
    displayName: "Fred Couples",
    slug: "fred-couples",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  davisLoveIII: {
    name: "Love III, Davis",
    displayName: "Davis Love III",
    slug: "davis-love-iii",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  jasonDay: {
    name: "Day, Jason",
    displayName: "Jason Day",
    slug: "jason-day",
    dgId: null,
    country: "AUS",
    manualOnly: true
  },

  adamScott: {
    name: "Scott, Adam",
    displayName: "Adam Scott",
    slug: "adam-scott",
    dgId: null,
    country: "AUS",
    manualOnly: true
  },

  benHogan: {
    name: "Hogan, Ben",
    displayName: "Ben Hogan",
    slug: "ben-hogan",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  bubbaWatson: {
    name: "Watson, Bubba",
    displayName: "Bubba Watson",
    slug: "bubba-watson",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  jimFuryk: {
    name: "Furyk, Jim",
    displayName: "Jim Furyk",
    slug: "jim-furyk",
    dgId: null,
    country: "USA",
    manualOnly: true
  },

  justinRose: {
    name: "Rose, Justin",
    displayName: "Justin Rose",
    slug: "justin-rose",
    dgId: null,
    country: "ENG",
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

function playerNameToLastFirst(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/);
  if (parts.length < 2) return displayName;

  const last = parts.pop();
  return `${last}, ${parts.join(" ")}`;
}

function manualPlayerFromData(slug, data) {
  const existing = Object.values(PLAYERS).find((player) => player.slug === slug);

  if (existing) return existing;

  const displayName = data.player || slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    name: playerNameToLastFirst(displayName),
    displayName,
    slug,
    dgId: null,
    country: data.country || null,
    manualOnly: true
  };
}

function loadManualPrimePlayers() {
  const manualDir = path.join(process.cwd(), "data", "h2h", "manual");

  if (!fs.existsSync(manualDir)) return [];

  return fs.readdirSync(manualDir)
    .filter((file) => file.endsWith("-results.json"))
    .sort()
    .map((file) => {
      const slug = file.replace(/-results\.json$/, "");
      const data = loadManualResults(slug);
      return data ? manualPlayerFromData(slug, data) : null;
    })
    .filter(Boolean);
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
    label: "1972, Year of the Golden Bear"
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
    year: "2013-2014",
    displayYear: "2014",
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
  "jon-rahm": {
    year: "2021",
    label: "2021, U.S. Open season"
  },
  "patrick-reed": {
    year: "2018",
    label: "2018, Masters season"
  },
  "rickie-fowler": {
    year: "2015",
    label: "2015, peak Rickie"
  },
  "vijay-singh": {
    year: "2004",
    label: "2004, nine-win season"
  },
  "arnold-palmer": {
    year: "1960",
    label: "1960, Masters and U.S. Open season"
  },
  "ernie-els": {
    year: "1994",
    label: "1994, U.S. Open breakthrough season"
  },

  "fred-couples": {
    year: "1992",
    label: "1992, Masters season"
  },

  "davis-love-iii": {
    year: "1997",
    label: "1997, PGA Championship season"
  },

  "jason-day": {
    year: "2015",
    label: "2015, PGA Championship season"
  },
};

const PRIME_MATCHUPS = [
  // Scottie Scheffler
  { playerA: p("scottie"), playerB: p("rory") },
  { playerA: p("scottie"), playerB: p("tiger") },
  { playerA: p("scottie"), playerB: p("phil") },
  { playerA: p("scottie"), playerB: p("jack") },
  { playerA: p("scottie"), playerB: p("vijay") },
  { playerA: p("scottie"), playerB: p("arnoldPalmer") },
  { playerA: p("scottie"), playerB: p("benHogan") },
  { playerA: p("scottie"), playerB: p("byron") },
  { playerA: p("scottie"), playerB: p("samSnead") },
  { playerA: p("scottie"), playerB: p("nickFaldo") },
  { playerA: p("scottie"), playerB: p("ernieEls") },
  { playerA: p("scottie"), playerB: p("fredCouples") },
  { playerA: p("scottie"), playerB: p("davisLoveIII") },
  { playerA: p("scottie"), playerB: p("jasonDay") },
  { playerA: p("scottie"), playerB: p("adamScott") },
  { playerA: p("scottie"), playerB: p("bubbaWatson") },
  { playerA: p("scottie"), playerB: p("jimFuryk") },
  { playerA: p("scottie"), playerB: p("justinRose") },
  { playerA: p("scottie"), playerB: p("brooks") },
  { playerA: p("scottie"), playerB: p("bryson") },
  { playerA: p("scottie"), playerB: p("rahm") },
  { playerA: p("scottie"), playerB: p("rickie") },
  { playerA: p("scottie"), playerB: p("reed") },

  // Rory McIlroy
  { playerA: p("rory"), playerB: p("tiger") },
  { playerA: p("rory"), playerB: p("phil") },
  { playerA: p("rory"), playerB: p("jack") },
  { playerA: p("rory"), playerB: p("vijay") },
  { playerA: p("rory"), playerB: p("arnoldPalmer") },
  { playerA: p("rory"), playerB: p("benHogan") },
  { playerA: p("rory"), playerB: p("byron") },
  { playerA: p("rory"), playerB: p("samSnead") },
  { playerA: p("rory"), playerB: p("nickFaldo") },
  { playerA: p("rory"), playerB: p("ernieEls") },
  { playerA: p("rory"), playerB: p("fredCouples") },
  { playerA: p("rory"), playerB: p("davisLoveIII") },
  { playerA: p("rory"), playerB: p("jasonDay") },
  { playerA: p("rory"), playerB: p("adamScott") },
  { playerA: p("rory"), playerB: p("bubbaWatson") },
  { playerA: p("rory"), playerB: p("jimFuryk") },
  { playerA: p("rory"), playerB: p("justinRose") },
  { playerA: p("rory"), playerB: p("brooks") },
  { playerA: p("rory"), playerB: p("bryson") },
  { playerA: p("rory"), playerB: p("rahm") },
  { playerA: p("rory"), playerB: p("rickie") },
  { playerA: p("rory"), playerB: p("reed") },

  // Tiger Woods
  { playerA: p("tiger"), playerB: p("phil") },
  { playerA: p("tiger"), playerB: p("jack") },
  { playerA: p("tiger"), playerB: p("vijay") },
  { playerA: p("tiger"), playerB: p("arnoldPalmer") },
  { playerA: p("tiger"), playerB: p("benHogan") },
  { playerA: p("tiger"), playerB: p("byron") },
  { playerA: p("tiger"), playerB: p("samSnead") },
  { playerA: p("tiger"), playerB: p("nickFaldo") },
  { playerA: p("tiger"), playerB: p("ernieEls") },
  { playerA: p("tiger"), playerB: p("fredCouples") },
  { playerA: p("tiger"), playerB: p("davisLoveIII") },
  { playerA: p("tiger"), playerB: p("jasonDay") },
  { playerA: p("tiger"), playerB: p("adamScott") },
  { playerA: p("tiger"), playerB: p("bubbaWatson") },
  { playerA: p("tiger"), playerB: p("jimFuryk") },
  { playerA: p("tiger"), playerB: p("justinRose") },
  { playerA: p("tiger"), playerB: p("brooks") },
  { playerA: p("tiger"), playerB: p("bryson") },
  { playerA: p("tiger"), playerB: p("rahm") },
  { playerA: p("tiger"), playerB: p("rickie") },
  { playerA: p("tiger"), playerB: p("reed") },

  // Phil Mickelson
  { playerA: p("phil"), playerB: p("jack") },
  { playerA: p("phil"), playerB: p("vijay") },
  { playerA: p("phil"), playerB: p("arnoldPalmer") },
  { playerA: p("phil"), playerB: p("benHogan") },
  { playerA: p("phil"), playerB: p("byron") },
  { playerA: p("phil"), playerB: p("samSnead") },
  { playerA: p("phil"), playerB: p("nickFaldo") },
  { playerA: p("phil"), playerB: p("ernieEls") },
  { playerA: p("phil"), playerB: p("fredCouples") },
  { playerA: p("phil"), playerB: p("davisLoveIII") },
  { playerA: p("phil"), playerB: p("jasonDay") },
  { playerA: p("phil"), playerB: p("adamScott") },
  { playerA: p("phil"), playerB: p("bubbaWatson") },
  { playerA: p("phil"), playerB: p("jimFuryk") },
  { playerA: p("phil"), playerB: p("justinRose") },
  { playerA: p("phil"), playerB: p("brooks") },
  { playerA: p("phil"), playerB: p("bryson") },
  { playerA: p("phil"), playerB: p("rahm") },
  { playerA: p("phil"), playerB: p("rickie") },
  { playerA: p("phil"), playerB: p("reed") },

  // Jack Nicklaus
  { playerA: p("jack"), playerB: p("vijay") },
  { playerA: p("jack"), playerB: p("arnoldPalmer") },
  { playerA: p("jack"), playerB: p("benHogan") },
  { playerA: p("jack"), playerB: p("byron") },
  { playerA: p("jack"), playerB: p("samSnead") },
  { playerA: p("jack"), playerB: p("nickFaldo") },
  { playerA: p("jack"), playerB: p("ernieEls") },
  { playerA: p("jack"), playerB: p("fredCouples") },
  { playerA: p("jack"), playerB: p("davisLoveIII") },
  { playerA: p("jack"), playerB: p("jasonDay") },
  { playerA: p("jack"), playerB: p("adamScott") },
  { playerA: p("jack"), playerB: p("bubbaWatson") },
  { playerA: p("jack"), playerB: p("jimFuryk") },
  { playerA: p("jack"), playerB: p("justinRose") },
  { playerA: p("jack"), playerB: p("brooks") },
  { playerA: p("jack"), playerB: p("bryson") },
  { playerA: p("jack"), playerB: p("rahm") },
  { playerA: p("jack"), playerB: p("rickie") },
  { playerA: p("jack"), playerB: p("reed") },

  // Vijay Singh
  { playerA: p("vijay"), playerB: p("arnoldPalmer") },
  { playerA: p("vijay"), playerB: p("benHogan") },
  { playerA: p("vijay"), playerB: p("byron") },
  { playerA: p("vijay"), playerB: p("samSnead") },
  { playerA: p("vijay"), playerB: p("nickFaldo") },
  { playerA: p("vijay"), playerB: p("ernieEls") },
  { playerA: p("vijay"), playerB: p("fredCouples") },
  { playerA: p("vijay"), playerB: p("davisLoveIII") },
  { playerA: p("vijay"), playerB: p("jasonDay") },
  { playerA: p("vijay"), playerB: p("adamScott") },
  { playerA: p("vijay"), playerB: p("bubbaWatson") },
  { playerA: p("vijay"), playerB: p("jimFuryk") },
  { playerA: p("vijay"), playerB: p("justinRose") },
  { playerA: p("vijay"), playerB: p("brooks") },
  { playerA: p("vijay"), playerB: p("bryson") },
  { playerA: p("vijay"), playerB: p("rahm") },
  { playerA: p("vijay"), playerB: p("rickie") },
  { playerA: p("vijay"), playerB: p("reed") },

  // Arnold Palmer
  { playerA: p("arnoldPalmer"), playerB: p("benHogan") },
  { playerA: p("arnoldPalmer"), playerB: p("byron") },
  { playerA: p("arnoldPalmer"), playerB: p("samSnead") },
  { playerA: p("arnoldPalmer"), playerB: p("nickFaldo") },
  { playerA: p("arnoldPalmer"), playerB: p("ernieEls") },
  { playerA: p("arnoldPalmer"), playerB: p("fredCouples") },
  { playerA: p("arnoldPalmer"), playerB: p("davisLoveIII") },
  { playerA: p("arnoldPalmer"), playerB: p("jasonDay") },
  { playerA: p("arnoldPalmer"), playerB: p("adamScott") },
  { playerA: p("arnoldPalmer"), playerB: p("bubbaWatson") },
  { playerA: p("arnoldPalmer"), playerB: p("jimFuryk") },
  { playerA: p("arnoldPalmer"), playerB: p("justinRose") },
  { playerA: p("arnoldPalmer"), playerB: p("brooks") },
  { playerA: p("arnoldPalmer"), playerB: p("bryson") },
  { playerA: p("arnoldPalmer"), playerB: p("rahm") },
  { playerA: p("arnoldPalmer"), playerB: p("rickie") },
  { playerA: p("arnoldPalmer"), playerB: p("reed") },

  // Ben Hogan
  { playerA: p("benHogan"), playerB: p("byron") },
  { playerA: p("benHogan"), playerB: p("samSnead") },
  { playerA: p("benHogan"), playerB: p("nickFaldo") },
  { playerA: p("benHogan"), playerB: p("ernieEls") },
  { playerA: p("benHogan"), playerB: p("fredCouples") },
  { playerA: p("benHogan"), playerB: p("davisLoveIII") },
  { playerA: p("benHogan"), playerB: p("jasonDay") },
  { playerA: p("benHogan"), playerB: p("adamScott") },
  { playerA: p("benHogan"), playerB: p("bubbaWatson") },
  { playerA: p("benHogan"), playerB: p("jimFuryk") },
  { playerA: p("benHogan"), playerB: p("justinRose") },
  { playerA: p("benHogan"), playerB: p("brooks") },
  { playerA: p("benHogan"), playerB: p("bryson") },
  { playerA: p("benHogan"), playerB: p("rahm") },
  { playerA: p("benHogan"), playerB: p("rickie") },
  { playerA: p("benHogan"), playerB: p("reed") },

  // Byron Nelson
  { playerA: p("byron"), playerB: p("samSnead") },
  { playerA: p("byron"), playerB: p("nickFaldo") },
  { playerA: p("byron"), playerB: p("ernieEls") },
  { playerA: p("byron"), playerB: p("fredCouples") },
  { playerA: p("byron"), playerB: p("davisLoveIII") },
  { playerA: p("byron"), playerB: p("jasonDay") },
  { playerA: p("byron"), playerB: p("adamScott") },
  { playerA: p("byron"), playerB: p("bubbaWatson") },
  { playerA: p("byron"), playerB: p("jimFuryk") },
  { playerA: p("byron"), playerB: p("justinRose") },
  { playerA: p("byron"), playerB: p("brooks") },
  { playerA: p("byron"), playerB: p("bryson") },
  { playerA: p("byron"), playerB: p("rahm") },
  { playerA: p("byron"), playerB: p("rickie") },
  { playerA: p("byron"), playerB: p("reed") },

  // Sam Snead
  { playerA: p("samSnead"), playerB: p("nickFaldo") },
  { playerA: p("samSnead"), playerB: p("ernieEls") },
  { playerA: p("samSnead"), playerB: p("fredCouples") },
  { playerA: p("samSnead"), playerB: p("davisLoveIII") },
  { playerA: p("samSnead"), playerB: p("jasonDay") },
  { playerA: p("samSnead"), playerB: p("adamScott") },
  { playerA: p("samSnead"), playerB: p("bubbaWatson") },
  { playerA: p("samSnead"), playerB: p("jimFuryk") },
  { playerA: p("samSnead"), playerB: p("justinRose") },
  { playerA: p("samSnead"), playerB: p("brooks") },
  { playerA: p("samSnead"), playerB: p("bryson") },
  { playerA: p("samSnead"), playerB: p("rahm") },
  { playerA: p("samSnead"), playerB: p("rickie") },
  { playerA: p("samSnead"), playerB: p("reed") },

  // Nick Faldo
  { playerA: p("nickFaldo"), playerB: p("ernieEls") },
  { playerA: p("nickFaldo"), playerB: p("fredCouples") },
  { playerA: p("nickFaldo"), playerB: p("davisLoveIII") },
  { playerA: p("nickFaldo"), playerB: p("jasonDay") },
  { playerA: p("nickFaldo"), playerB: p("adamScott") },
  { playerA: p("nickFaldo"), playerB: p("bubbaWatson") },
  { playerA: p("nickFaldo"), playerB: p("jimFuryk") },
  { playerA: p("nickFaldo"), playerB: p("justinRose") },
  { playerA: p("nickFaldo"), playerB: p("brooks") },
  { playerA: p("nickFaldo"), playerB: p("bryson") },
  { playerA: p("nickFaldo"), playerB: p("rahm") },
  { playerA: p("nickFaldo"), playerB: p("rickie") },
  { playerA: p("nickFaldo"), playerB: p("reed") },

  // Ernie Els
  { playerA: p("ernieEls"), playerB: p("fredCouples") },
  { playerA: p("ernieEls"), playerB: p("davisLoveIII") },
  { playerA: p("ernieEls"), playerB: p("jasonDay") },
  { playerA: p("ernieEls"), playerB: p("adamScott") },
  { playerA: p("ernieEls"), playerB: p("bubbaWatson") },
  { playerA: p("ernieEls"), playerB: p("jimFuryk") },
  { playerA: p("ernieEls"), playerB: p("justinRose") },
  { playerA: p("ernieEls"), playerB: p("brooks") },
  { playerA: p("ernieEls"), playerB: p("bryson") },
  { playerA: p("ernieEls"), playerB: p("rahm") },
  { playerA: p("ernieEls"), playerB: p("rickie") },
  { playerA: p("ernieEls"), playerB: p("reed") },

  // Fred Couples
  { playerA: p("fredCouples"), playerB: p("davisLoveIII") },
  { playerA: p("fredCouples"), playerB: p("jasonDay") },
  { playerA: p("fredCouples"), playerB: p("adamScott") },
  { playerA: p("fredCouples"), playerB: p("bubbaWatson") },
  { playerA: p("fredCouples"), playerB: p("jimFuryk") },
  { playerA: p("fredCouples"), playerB: p("justinRose") },
  { playerA: p("fredCouples"), playerB: p("brooks") },
  { playerA: p("fredCouples"), playerB: p("bryson") },
  { playerA: p("fredCouples"), playerB: p("rahm") },
  { playerA: p("fredCouples"), playerB: p("rickie") },
  { playerA: p("fredCouples"), playerB: p("reed") },

  // Davis Love IIi
  { playerA: p("davisLoveIII"), playerB: p("jasonDay") },
  { playerA: p("davisLoveIII"), playerB: p("adamScott") },
  { playerA: p("davisLoveIII"), playerB: p("bubbaWatson") },
  { playerA: p("davisLoveIII"), playerB: p("jimFuryk") },
  { playerA: p("davisLoveIII"), playerB: p("justinRose") },
  { playerA: p("davisLoveIII"), playerB: p("brooks") },
  { playerA: p("davisLoveIII"), playerB: p("bryson") },
  { playerA: p("davisLoveIII"), playerB: p("rahm") },
  { playerA: p("davisLoveIII"), playerB: p("rickie") },
  { playerA: p("davisLoveIII"), playerB: p("reed") },

  // Jason Day
  { playerA: p("jasonDay"), playerB: p("adamScott") },
  { playerA: p("jasonDay"), playerB: p("bubbaWatson") },
  { playerA: p("jasonDay"), playerB: p("jimFuryk") },
  { playerA: p("jasonDay"), playerB: p("justinRose") },
  { playerA: p("jasonDay"), playerB: p("brooks") },
  { playerA: p("jasonDay"), playerB: p("bryson") },
  { playerA: p("jasonDay"), playerB: p("rahm") },
  { playerA: p("jasonDay"), playerB: p("rickie") },
  { playerA: p("jasonDay"), playerB: p("reed") },

  // Adam Scott
  { playerA: p("adamScott"), playerB: p("bubbaWatson") },
  { playerA: p("adamScott"), playerB: p("jimFuryk") },
  { playerA: p("adamScott"), playerB: p("justinRose") },
  { playerA: p("adamScott"), playerB: p("brooks") },
  { playerA: p("adamScott"), playerB: p("bryson") },
  { playerA: p("adamScott"), playerB: p("rahm") },
  { playerA: p("adamScott"), playerB: p("rickie") },
  { playerA: p("adamScott"), playerB: p("reed") },

  // Bubba Watson
  { playerA: p("bubbaWatson"), playerB: p("jimFuryk") },
  { playerA: p("bubbaWatson"), playerB: p("justinRose") },
  { playerA: p("bubbaWatson"), playerB: p("brooks") },
  { playerA: p("bubbaWatson"), playerB: p("bryson") },
  { playerA: p("bubbaWatson"), playerB: p("rahm") },
  { playerA: p("bubbaWatson"), playerB: p("rickie") },
  { playerA: p("bubbaWatson"), playerB: p("reed") },

  // Jim Furyk
  { playerA: p("jimFuryk"), playerB: p("justinRose") },
  { playerA: p("jimFuryk"), playerB: p("brooks") },
  { playerA: p("jimFuryk"), playerB: p("bryson") },
  { playerA: p("jimFuryk"), playerB: p("rahm") },
  { playerA: p("jimFuryk"), playerB: p("rickie") },
  { playerA: p("jimFuryk"), playerB: p("reed") },

  // Justin Rose
  { playerA: p("justinRose"), playerB: p("brooks") },
  { playerA: p("justinRose"), playerB: p("bryson") },
  { playerA: p("justinRose"), playerB: p("rahm") },
  { playerA: p("justinRose"), playerB: p("rickie") },
  { playerA: p("justinRose"), playerB: p("reed") },

  // Brooks Koepka
  { playerA: p("brooks"), playerB: p("bryson") },
  { playerA: p("brooks"), playerB: p("rahm") },
  { playerA: p("brooks"), playerB: p("rickie") },
  { playerA: p("brooks"), playerB: p("reed") },

  // Bryson Dechambeau
  { playerA: p("bryson"), playerB: p("rahm") },
  { playerA: p("bryson"), playerB: p("rickie") },
  { playerA: p("bryson"), playerB: p("reed") },

  // Jon Rahm
  { playerA: p("rahm"), playerB: p("rickie") },
  { playerA: p("rahm"), playerB: p("reed") },

  // Rickie Fowler
  { playerA: p("rickie"), playerB: p("reed") }

  // Patrick Reed
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
  if (!API_KEY && process.env.NODE_ENV !== "test") {
    throw new Error("Missing DATAGOLF_API_KEY environment variable for DataGolf shared-start generation.");
  }

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

function displayYearFromSeasonKey(seasonKey) {
  const parts = String(seasonKey).split("-");

  if (parts.length === 1) return seasonKey;

  const start = parts[0];
  const end = parts[1];

  if (end.length === 2) {
    return `${start.slice(0, 2)}${end}`;
  }

  return end;
}

function scorePrimeSeason(season) {
  const events = Array.isArray(season?.events) ? season.events : [];
  let score = 0;

  for (const event of events) {
    if (event.official === false || event.officialStart === false || event.unofficial === true) {
      continue;
    }

    const finish = getFinish(event);
    if (!isCountableStartValue(finish)) continue;

    const rank = finishNumber(finish);
    score += 1;

    if (isWinValue(finish)) score += 1000;
    if (rank !== null && rank <= 5) score += 100;
    if (rank !== null && rank <= 10) score += 50;
    if (rank !== null && rank <= 25) score += 10;
    if (isMajorSeasonEvent(event) && isWinValue(finish)) score += 500;
  }

  return score;
}

function derivePrimeSeasonConfig(player, manual) {
  const seasons = Object.entries(manual.seasons || {})
    .filter(([, season]) => Array.isArray(season.events) && season.events.length)
    .map(([year, season]) => ({
      year,
      score: scorePrimeSeason(season),
      eventCount: season.events.length
    }))
    .sort((a, b) => b.score - a.score || b.eventCount - a.eventCount || String(b.year).localeCompare(String(a.year)));

  const best = seasons[0];

  if (!best) {
    throw new Error(`No manual seasons available for ${player.displayName}`);
  }

  const displayYear = displayYearFromSeasonKey(best.year);

  return {
    year: best.year,
    displayYear,
    label: `${displayYear}, best available manual season`
  };
}

function buildPrimeMatchups() {
  const players = loadManualPrimePlayers();
  const matchups = [];

  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      matchups.push({
        playerA: players[first],
        playerB: players[second]
      });
    }
  }

  return matchups;
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

  if (!manual) {
    throw new Error(`Missing manual results file for ${player.displayName}`);
  }

  const configuredPrime = PRIME_SEASONS[player.slug];
  const prime = configuredPrime && manual.seasons?.[configuredPrime.year]
    ? configuredPrime
    : derivePrimeSeasonConfig(player, manual);

  const season = manual.seasons?.[prime.year];

  if (!season || !Array.isArray(season.events)) {
    throw new Error(`Missing ${prime.year} season for ${player.displayName}`);
  }

  return {
    player,
    year: prime.year,
    displayYear: prime.displayYear || prime.year,
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
    displayYear: primeSeason.displayYear || primeSeason.year,
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

      const playerAResult = resolvePlayerResult(playerA, manualA, event, results);
      const playerBResult = resolvePlayerResult(playerB, manualB, event, results);

      if (playerAResult?.dataSource === "manual") {
        console.log("[H2H] Source manual:", playerA.slug, event.year, event.eventName, playerAResult.fin_text);
      } else if (playerAResult?.dataSource === "api") {
        console.log("[H2H] Source api:", playerA.slug, event.year, event.eventName, playerAResult.fin_text);
      }

      if (playerBResult?.dataSource === "manual") {
        console.log("[H2H] Source manual:", playerB.slug, event.year, event.eventName, playerBResult.fin_text);
      } else if (playerBResult?.dataSource === "api") {
        console.log("[H2H] Source api:", playerB.slug, event.year, event.eventName, playerBResult.fin_text);
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
          manual: !!playerAResult.manual,
          dataSource: playerAResult.dataSource || (playerAResult.manual ? "manual" : "api")
        },
        playerB: {
          name: playerB.displayName,
          dgId: playerB.dgId,
          finish: playerBResult.fin_text,
          earnings: playerBResult.earnings ?? null,
          fedExCupPoints: playerBResult.fec_points ?? null,
          dgPoints: playerBResult.dg_points ?? null,
          manual: !!playerBResult.manual,
          dataSource: playerBResult.dataSource || (playerBResult.manual ? "manual" : "api")
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
      label: "Made-cut rate",
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
    primeA: {
      year: primeA.year,
      displayYear: primeA.displayYear || primeA.year,
      label: primeA.label
    },
    primeB: {
      year: primeB.year,
      displayYear: primeB.displayYear || primeB.year,
      label: primeB.label
    },
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
  const RUN_MODE = process.env.H2H_RUN_MODE || "all";

  console.log(`[H2H] Run mode: ${RUN_MODE}`);

  if (RUN_MODE === "prime" || RUN_MODE === "all") {
    const primeMatchups = buildPrimeMatchups();

    console.log(`[H2H] Starting ${primeMatchups.length} Prime vs Prime matchups...`);

    for (const matchup of primeMatchups) {
      if (!matchup.playerA || !matchup.playerB) {
        console.warn("[H2H] Skipped Prime vs Prime matchup because one player key is missing.");
        continue;
      }

      try {
        await buildPrimeMatchup(matchup);
      } catch (error) {
        console.warn(
          `[H2H] Skipped Prime vs Prime ${matchup.playerA.displayName} vs ${matchup.playerB.displayName}: ${error.message}`
        );
      }
    }
  }

  if (RUN_MODE === "prime") {
    console.log("[H2H] Prime-only run complete.");
    return;
  }

  if (!API_KEY && process.env.NODE_ENV !== "test") {
    throw new Error("Missing DATAGOLF_API_KEY environment variable for shared-start matchup generation. Run H2H_RUN_MODE=prime for manual-only Prime outputs.");
  }

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
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildPrimeMatchups,
  findManualResult,
  getManualEventsForRange,
  getPrimeSeason,
  manualEventToResult,
  normalizeEventName,
  resolvePlayerResult
};
