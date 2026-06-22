const assert = require("assert");

process.env.NODE_ENV = "test";

const {
  findManualResult,
  getManualEventsForRange,
  resolvePlayerResult
} = require("./generate-h2h");

const {
  parseDate,
  parseScreenshotName
} = require("./import-h2h-screenshots");

const player = {
  displayName: "Manual Player",
  slug: "manual-player",
  dgId: 123
};

const manualData = {
  player: "Manual Player",
  slug: "manual-player",
  seasons: {
    "2001": {
      events: [
        {
          date: "2001-06-24",
          tournament: "Buick Classic",
          finish: "1",
          earnings: "$630,000"
        }
      ]
    },
    "2025": {
      events: [
        {
          date: "2025-01-12",
          tournament: "Modern Invitational",
          finish: "T5",
          earnings: "$10,000"
        }
      ]
    }
  }
};

const pre2017Event = {
  year: 2001,
  date: "2001-06-24",
  eventName: "Buick Classic",
  eventId: "api-buick-classic"
};

const modernEvent = {
  year: 2025,
  date: "2025-01-12",
  eventName: "Modern Invitational",
  eventId: "api-modern"
};

const apiRows = [
  {
    dg_id: 123,
    fin_text: "CUT",
    earnings: null,
    fec_points: 1,
    dg_points: 2
  }
];

assert.strictEqual(findManualResult(manualData, pre2017Event).finish, "1");

const manualPre2017 = resolvePlayerResult(player, manualData, pre2017Event, apiRows);
assert.strictEqual(manualPre2017.fin_text, "1");
assert.strictEqual(manualPre2017.dataSource, "manual");
assert.strictEqual(manualPre2017.manual, true);

const manualModern = resolvePlayerResult(player, manualData, modernEvent, apiRows);
assert.strictEqual(manualModern.fin_text, "T5");
assert.strictEqual(manualModern.dataSource, "manual");

const apiFallback = resolvePlayerResult(
  player,
  { player: "Manual Player", seasons: {} },
  { year: 2025, eventName: "API Only Event" },
  apiRows
);
assert.strictEqual(apiFallback.fin_text, "CUT");
assert.strictEqual(apiFallback.dataSource, "api");

const missingPre2017 = resolvePlayerResult(
  player,
  { player: "Manual Player", seasons: {} },
  { year: 2005, eventName: "Missing Manual Event" },
  apiRows
);
assert.strictEqual(missingPre2017, null);

const manualEvents = getManualEventsForRange(manualData, 2000);
assert(manualEvents.some((event) => event.eventName === "Buick Classic"));
assert(manualEvents.some((event) => event.manualEvent === true));

const firstImage = parseScreenshotName("jason-day-2025-1.png", "Jason Day - Harry Done");
assert.strictEqual(firstImage.playerSlug, "jason-day");
assert.strictEqual(firstImage.playerName, "Jason Day");
assert.strictEqual(firstImage.seasonKey, "2025");
assert.strictEqual(firstImage.imageIndex, 1);

const secondImage = parseScreenshotName("jason-day-2025-2.png", "Jason Day - Harry Done");
assert.strictEqual(secondImage.playerSlug, "jason-day");
assert.strictEqual(secondImage.seasonKey, "2025");
assert.strictEqual(secondImage.imageIndex, 2);

const correctedFolderSlug = parseScreenshotName("fred-crouples-1990.png", "Fred Couples");
assert.strictEqual(correctedFolderSlug.playerSlug, "fred-couples");

const romanNumeralSlug = parseScreenshotName("davis-love-III-1997.png", "Davis Love III");
assert.strictEqual(romanNumeralSlug.playerSlug, "davis-love-iii");

assert.strictEqual(parseDate("916.2001", "2001").iso, "2001-09-16");
assert.strictEqual(parseDate("11.42001", "2001").iso, "2001-11-04");

console.log("[H2H Test] Manual-first H2H tests passed.");
