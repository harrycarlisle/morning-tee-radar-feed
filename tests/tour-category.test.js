const assert = require("node:assert/strict");
const { test } = require("node:test");
const { inferCategory, repairPublishedCategories } = require("../lib/tour-category");

// Imports must be safe: no radar run, external requests, alerts, or feed writes.
const testEnv = {
  AUTO_PUBLISH: "true", GITHUB_TOKEN: "test-token", GITHUB_OWNER: "test-owner",
  GITHUB_REPO: "test-repo", GITHUB_BRANCH: "test-branch",
  GITHUB_RADAR_PATH: "latest-radar.json", GITHUB_RADAR_ARCHIVE_PATH: "archive-radar.json",
  RAPIDAPI_KEY: "test-key", FORCE_LEADERBOARD_CHECK: "true"
};
const oldEnv = Object.fromEntries(Object.keys(testEnv).map((key) => [key, process.env[key]]));
Object.assign(process.env, testEnv);
const radar = require("../reddit-checker");
for (const [key, value] of Object.entries(oldEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const yamashita = {
  title: "Defending champion Yamashita maintains her lead after 3 rounds at LPGA Malaysia",
  summary: "KUALA LUMPUR, Malaysia (AP) — Defending champion Miyu Yamashita shot a 5-under 67 on Saturday to take a two-stroke lead into Sunday's final round of the LPGA Tour's Maybank Championship.T...",
  sourceType: "RSS", sourceName: "Yahoo Golf"
};

for (const [title, summary, expected] of [
  [yamashita.title, yamashita.summary, "LPGA"],
  ["LPGA Tour releases its schedule", "", "LPGA"],
  ["PGA Tour releases its schedule", "", "PGA TOUR"],
  ["PGA-TOUR: the latest", "", "PGA TOUR"],
  ["LIV Golf announces a new event", "", "LIV"],
  ["LIV's roster changes", "", "LIV"],
  ["DP World Tour updates its schedule", "", "DP TOUR"],
  ["European Tour players prepare for Sunday", "", "DP TOUR"],
  ["Japan Golf Tour announces an event", "", "JAPAN TOUR"],
  ["Nelly Korda wins the Women's PGA Championship", "", "LPGA"],
  ["Nelly Korda wins the U.S. Women's Open", "", "LPGA"],
  ["Maybank Championship leaderboard", "Yamashita leads by two.", "LPGA"],
  ["Rory McIlroy wins on the DP World Tour", "", "DP TOUR"],
  ["Brooks Koepka leads LIV Golf event", "", "LIV"],
  ["Golf live updates delivered from Japan", "A local tournament is underway.", "GOLF"],
  ["An unknown invitational begins", "", "GOLF"],
  ["PGA Tour Champions announces its schedule", "", "GOLF"],
  ["PGA Tour Americas announces its schedule", "", "GOLF"],
  ["Ladies European Tour announces its schedule", "", "GOLF"],
  ["JLPGA Tour announces its schedule", "", "GOLF"],
  ["PGA Tour and LIV Golf discuss their future", "", "GOLF"],
  ["LPGA Tour and PGA Tour announce a shared event", "", "GOLF"],
  ["Tours discuss a joint event", "The LPGA Tour, LIV Golf and DP World Tour are involved.", "GOLF"],
  ["LPGA Tour announces a schedule change", "The PGA Tour announced a different change last week.", "LPGA"],
  ["PGA Tour announces a schedule change", "The LPGA Tour announced a different change last week.", "PGA TOUR"],
  ["DP World Tour adds a date", "LIV Golf members may enter.", "DP TOUR"],
  ["LIV Golf adds a date", "PGA Tour players are mentioned as background.", "LIV"],
  ["Rory McIlroy shares an update", "", "PGA TOUR"],
  ["Nelly Korda shares an update", "", "LPGA"]
]) {
  test(`story: ${title} => ${expected}`, () => {
    assert.equal(inferCategory({ title, summary, sourceType: "RSS", sourceName: "Yahoo Golf" }), expected);
  });
}

test("tour sources are weaker evidence than a clear headline", () => {
  assert.equal(inferCategory({ title: "LPGA Tour event begins", sourceName: "PGA Tour News" }), "LPGA");
  assert.equal(inferCategory({ title: "Sunday scores", sourceName: "LPGA Tour" }), "LPGA");
  assert.equal(inferCategory({ title: "Sunday scores", source: "DP World Tour" }), "DP TOUR");
});

test("structured competition metadata identifies the actual event amid mixed-tour mentions", () => {
  const item = { sourceType: "Leaderboard", title: "PGA Tour and LPGA players compete", summary: "LIV Golf players are also present." };
  assert.equal(inferCategory({ ...item, tour: "LPGA Tour" }), "LPGA");
  assert.equal(inferCategory({ ...item, tourName: "DP World Tour" }), "DP TOUR");
  assert.equal(inferCategory({ ...item, tournament: { name: "Invitational", tour: { name: "LIV Golf" } } }), "LIV");
  assert.equal(inferCategory({ ...item, tournament: "Maybank Championship" }), "LPGA");
  assert.equal(inferCategory({ ...item, competition: { name: "PGA Championship" } }), "PGA TOUR");
  assert.equal(inferCategory({ ...item, tour: "Asian Tour" }), "GOLF");
  assert.equal(inferCategory({ ...item, tour: "PGA Tour", tourName: "LPGA Tour" }), "GOLF");
});

test("unknown leaderboards do not inherit PGA Tour from a player or source type", () => {
  for (const item of [
    { sourceType: "Leaderboard", title: "Rory leads an unnamed invitational" },
    { signal: "Leaderboard", title: "Nelly Korda leads a local competition" },
    { status: "Live", title: "Scores from Japan", leaders: [] },
    { sourceType: "Leaderboard", title: "LIV Golf and PGA Tour team event" }
  ]) assert.equal(inferCategory(item), "GOLF");
});

test("non-tour editorial categories and empty input keep their established labels", () => {
  assert.equal(inferCategory({ sourceType: "Reddit", title: "LPGA Tour clip" }), "GOLF INTERNET");
  assert.equal(inferCategory({ title: "NCAA college golf championship" }), "NCAA");
  assert.equal(inferCategory({ title: "Rick Shiels YouTube challenge with a PGA Tour player" }), "YOUTUBE");
  assert.equal(inferCategory({ title: "YouTuber films a golf challenge" }), "YOUTUBE");
  assert.equal(inferCategory(), "GOLF");
});

test("imports and alert-only mode cannot run or publish category repairs", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(process.execPath, ["-e", `
    global.fetch = () => { throw new Error("Unexpected network request"); };
    const radar = require(${JSON.stringify(require.resolve("../reddit-checker"))});
    radar.repairPublishedTourCategoriesOnGitHub().then((changed) => process.stdout.write(String(changed)));
  `], { encoding: "utf8", env: { ...process.env, ...testEnv, AUTO_PUBLISH: "false", DISCORD_WEBHOOK_URL: "test-only" } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "false");
  assert.equal(result.stderr, "");
});

const boardData = {
  leaderboardRows: [
    { position: "1", playerId: "one", firstName: "Test", lastName: "Leader", total: "-12", thru: "12", currentRound: 3 },
    { position: "2", playerId: "two", firstName: "Test", lastName: "Chaser", total: "-10", thru: "11", currentRound: 3 }
  ]
};

test("leaderboard builders carry tour metadata through to both publishing surfaces", () => {
  const items = [];
  for (const [tour, expected] of [["LPGA Tour", "LPGA"], ["PGA Tour", "PGA TOUR"], ["LIV Golf", "LIV"], ["DP World Tour", "DP TOUR"], ["Asian Tour", "GOLF"]]) {
    const item = radar.buildLeaderboardItem({ tournId: expected, name: `${expected} Invitational`, tour }, boardData);
    assert.equal(item.tour, tour);
    const published = radar.buildRadarItem(item);
    assert.equal(published.category, expected);
    assert.equal(published.tournament, item.tournament);
    assert.deepEqual(published.leaders, item.leaders);
    assert.equal(item.score, 999);
    items.push(item);
  }
  const generic = radar.buildLeaderboardItem({ tournId: "unknown", name: "Unidentified Invitational" }, boardData);
  assert.equal(radar.buildRadarItem(generic).category, "GOLF");
  assert.deepEqual(radar.buildLiveLeaderboardsFromItems(items).map((item) => item.category), ["LPGA", "PGA TOUR", "LIV", "DP TOUR", "GOLF"]);
  assert.equal(radar.buildRadarItem({ sourceType: "Leaderboard", tour: "LPGA Tour" }).tournament, "LPGA");
  assert.equal(radar.buildRadarItem({ sourceType: "Leaderboard" }).tournament, "GOLF");
});

test("radar and checking story builders use LPGA category without changing story content", () => {
  const item = { ...yamashita, url: "https://example.test/yamashita", timestamp: "2026-10-31T09:00:00Z" };
  for (const build of [radar.buildRadarItem, radar.buildCheckingItem]) {
    const published = build(item);
    assert.equal(published.category, "LPGA");
    assert.equal(published.url, item.url);
    assert.equal(published.source, item.sourceName);
  }
});

test("the PGA-only data adapter explicitly labels its orgId=1 competition", async (t) => {
  const start = new Date(Date.now() - 86400000).toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();
  t.mock.method(global, "fetch", async (url) => {
    assert.match(url, /orgId=1/);
    return { ok: true, json: async () => url.includes("/schedule?")
      ? { schedule: [{ tournId: "123", name: "RBC Heritage", format: "stroke", date: { start, end } }] }
      : boardData };
  });
  const items = await radar.fetchLeaderboardItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].tour, "PGA TOUR");
  assert.equal(radar.buildRadarItem(items[0]).category, "PGA TOUR");
});

test("published LPGA repair preserves ranking, content, timestamps, custom labels, and section shapes", () => {
  const story = { ...yamashita, category: "PGA TOUR", score: 250, interestScore: 80, displayPriority: 90,
    approvedAt: "2026-10-31T14:13:00Z", image: "keep.png", quickRead: "Keep this text.", url: "keep-url" };
  const mixed = { category: "PGA TOUR", title: "PGA Tour and LPGA Tour joint event" };
  const feed = { updatedAt: "keep-time", custom: { keep: true },
    today: [story, mixed], alsoMoving: [{ ...story, category: "TECH" }],
    weekRadar: [{ title: "LPGA Tour event", label: "LPGA" }], checking: story,
    golfInternet: [{ ...story, category: "GOLF INTERNET" }],
    stories: [story, { category: "DP TOUR", title: "LIV Golf player shares an update" }],
    liveLeaderboards: [{ category: "PGA TOUR", signal: "Leaderboard", tournament: "Maybank Championship", leaders: [] },
      { category: "PGA TOUR", signal: "Leaderboard", title: "Local invitational" }] };
  const original = structuredClone(feed);
  const { json, corrections } = repairPublishedCategories(feed);
  assert.equal(corrections, 5);
  assert.deepEqual(feed, original);
  assert.deepEqual(json.today[0], { ...story, category: "LPGA" });
  assert.equal(json.checking.category, "LPGA");
  assert.equal(json.stories[0].category, "LPGA");
  assert.equal(json.liveLeaderboards[0].category, "LPGA");
  assert.equal(json.liveLeaderboards[1].category, "GOLF");
  const withoutCategories = (value) => JSON.stringify(value, (key, entry) => key === "category" ? undefined : entry);
  assert.equal(withoutCategories(json), withoutCategories(original));
  assert.deepEqual(json.today[1], mixed);
  assert.deepEqual(json.alsoMoving, original.alsoMoving);
  assert.deepEqual(json.weekRadar, original.weekRadar);
  assert.deepEqual(json.golfInternet, original.golfInternet);
  assert.deepEqual(json.stories[1], original.stories[1]);
  assert.equal(repairPublishedCategories(json).corrections, 0);
});

test("candidate rankings and scores do not depend on repaired tour labels", () => {
  const stories = [
    { ...yamashita, id: "lpga", category: "PGA TOUR", ageHours: 1 },
    { title: "Breaking: Rory wins PGA Tour event", sourceType: "RSS", id: "pga", ageHours: 1 },
    { title: "LIV Golf winner confirmed", sourceType: "RSS", id: "liv", ageHours: 1 }
  ];
  const repaired = repairPublishedCategories({ today: stories }).json.today;
  const ranks = (items) => radar.filterCandidates(items, new Set()).map(({ id, score, tournamentBoost, matchedTerms }) => ({ id, score, tournamentBoost, matchedTerms }));
  assert.ok(ranks(stories).length > 0);
  assert.deepEqual(ranks(repaired), ranks(stories));
});

function githubFile(json, sha) {
  return { ok: true, status: 200, json: async () => ({ sha, content: Buffer.from(JSON.stringify(json)).toString("base64") }) };
}

test("category cleanup retries against current data and preserves concurrent editorial changes", async (t) => {
  const stale = { updatedAt: "old", today: [{ ...yamashita, category: "PGA TOUR" }] };
  const concurrent = { updatedAt: "new", today: [{ title: "New editor pick", category: "TECH" }, ...stale.today], marker: "keep" };
  let gets = 0;
  const puts = [];
  t.mock.method(global, "fetch", async (url, options) => {
    assert.match(url, /test-owner\/test-repo\/contents\//);
    if (options.method === "GET") {
      if (url.includes("archive-radar.json")) return githubFile({ stories: [] }, "archive-sha");
      gets += 1;
      return githubFile(gets === 1 ? stale : concurrent, gets === 1 ? "stale-sha" : "current-sha");
    }
    const body = JSON.parse(options.body);
    puts.push({ ...body, json: JSON.parse(Buffer.from(body.content, "base64").toString()) });
    return puts.length === 1 ? { ok: false, status: 409 } : { ok: true, status: 200 };
  });
  assert.equal(await radar.repairPublishedTourCategoriesOnGitHub(), true);
  assert.equal(puts.length, 2);
  assert.equal(puts[1].sha, "current-sha");
  assert.equal(puts[1].branch, "test-branch");
  assert.deepEqual(puts[1].json, { ...concurrent, today: [concurrent.today[0], { ...stale.today[0], category: "LPGA" }] });
});

test("category cleanup repairs archive labels even when the current feed has no changes", async (t) => {
  const puts = [];
  t.mock.method(global, "fetch", async (url, options) => {
    if (options.method === "GET") return url.includes("archive-radar.json")
      ? githubFile({ stories: [{ ...yamashita, category: "PGA TOUR" }] }, "archive-sha")
      : githubFile({ today: [] }, "radar-sha");
    puts.push(JSON.parse(options.body));
    return { ok: true, status: 200 };
  });
  assert.equal(await radar.repairPublishedTourCategoriesOnGitHub(), true);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].sha, "archive-sha");
  assert.equal(JSON.parse(Buffer.from(puts[0].content, "base64").toString()).stories[0].category, "LPGA");
});

test("category cleanup skips missing files and no-op updates", async (t) => {
  t.mock.method(global, "fetch", async (url, options) => {
    assert.equal(options.method, "GET");
    return url.includes("archive-radar.json") ? { ok: false, status: 404 }
      : githubFile({ today: [{ ...yamashita, category: "LPGA" }] }, "already-correct");
  });
  assert.equal(await radar.repairPublishedTourCategoriesOnGitHub(), false);
});

test("category cleanup stops after two conflicts and reports permission failures", async (t) => {
  let puts = 0;
  const mock = t.mock.method(global, "fetch", async (url, options) => {
    if (options.method === "GET") return githubFile({ today: [{ ...yamashita, category: "PGA TOUR" }] }, `sha-${puts}`);
    puts += 1;
    return { ok: false, status: 409, text: async () => "conflict" };
  });
  await assert.rejects(radar.repairPublishedTourCategoriesOnGitHub(), /Category repair failed.*409 conflict/);
  assert.equal(puts, 2);
  mock.mock.mockImplementation(async () => ({ ok: false, status: 403, text: async () => "denied" }));
  await assert.rejects(radar.repairPublishedTourCategoriesOnGitHub(), /GitHub read failed.*403 denied/);
});
