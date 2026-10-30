const test = require("node:test");
const assert = require("node:assert/strict");

process.env.AUTO_PUBLISH = "true";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_OWNER = "test-owner";
process.env.GITHUB_REPO = "test-repo";

const { areDuplicateStories, dedupeStoryClusters, dedupeHomepageSections } = require("../story-dedupe");
const {
  storyAlreadyOnRadar,
  buildNextRadarJson,
  buildWeekRadarFromStories,
  buildDeduplicatedHomepageJson,
  cleanupDuplicateHomepageStories,
  autoPublishHomepageRunnerUpsToGitHub
} = require("../reddit-checker");

// The two independently published Yahoo stories from the October 30 feed.
const first = {
  title: "Chamblee Reacts To McIlroy’s Shocking Ryder Cup Pairing",
  summary: "Brandel Chamblee voiced strong doubts about pairing Rory McIlroy with Ian Poulter at the 2021 Ryder Cup, a call that backfired as the duo lost heavily.",
  url: "https://sports.yahoo.com/articles/chamblee-reacts-mcilroy-shocking-ryder-020759716.html"
};
const second = {
  title: "Why Brandel Chamblee could not believe who Rory McIlroy was paired with on Frid...",
  summary: "Brandel Chamblee admitted his disbelief at seeing Rory McIlroy paired with Ian Poulter for the opening session of the 2021 Ryder Cup at Whistling Straits.",
  url: "https://sports.yahoo.com/articles/why-brandel-chamblee-could-not-223000337.html"
};
const unrelated = {
  title: "Rory McIlroy announces a new equipment partnership",
  summary: "Rory McIlroy announced a multi-year equipment partnership with a new sponsor ahead of the next season.",
  url: "https://example.test/partnership"
};
const liveTimestamp = () => new Date().toISOString();

function variant(item, changes) {
  return { ...item, sourceUrl: undefined, ...changes };
}

test("differently worded Ryder Cup coverage is identified in either order", () => {
  assert.equal(areDuplicateStories(first, second), true);
  assert.equal(areDuplicateStories(second, first), true);
  assert.deepEqual(dedupeStoryClusters([first, second]), [first]);
  assert.deepEqual(dedupeStoryClusters([second, first]), [second]);
});

test("different headlines can match through a detailed quick read", () => {
  const a = { title: "A star is out before play begins", quickRead: "Rory McIlroy withdrew from the 2026 Players Championship at TPC Sawgrass on Thursday because of a back injury.", url: "https://example.test/a" };
  const b = { title: "McIlroy pulls out of Sawgrass event", quickRead: "Back injury forces Rory McIlroy to withdraw from the 2026 Players Championship at TPC Sawgrass on Thursday.", url: "https://example.test/b" };
  assert.equal(areDuplicateStories(a, b), true);
});

test("the same players and event do not make different developments duplicates", () => {
  const victory = { title: "Rory McIlroy and Ian Poulter win Ryder Cup match", summary: "Rory McIlroy and Ian Poulter win their Ryder Cup match at Whistling Straits in 2021.", url: "https://example.test/win" };
  const withdrawal = { title: "Rory McIlroy and Ian Poulter withdraw from Ryder Cup match", summary: "Rory McIlroy and Ian Poulter withdraw from their Ryder Cup match at Whistling Straits in 2021.", url: "https://example.test/withdraw" };
  assert.equal(areDuplicateStories(victory, withdrawal), false);
  assert.equal(areDuplicateStories(first, unrelated), false);
  assert.equal(dedupeStoryClusters([victory, withdrawal, unrelated]).length, 3);
});

test("a different explicit pairing is not collapsed even when prior players are background", () => {
  const differentPairing = {
    title: "Chamblee reacts to McIlroy Ryder Cup pairing with Sergio Garcia",
    summary: "Brandel Chamblee voiced strong doubts about pairing Rory McIlroy with Sergio Garcia at the 2021 Ryder Cup after Ian Poulter was ruled out.",
    url: "https://example.test/different-pairing"
  };
  assert.equal(areDuplicateStories(first, differentPairing), false);
  assert.equal(areDuplicateStories(second, differentPairing), false);
});

test("a later reversal involving the same people is a different development", () => {
  const followUp = {
    title: "Chamblee reverses his stance on McIlroy and Poulter Ryder Cup pairing",
    summary: "Brandel Chamblee changed his mind about pairing Rory McIlroy with Ian Poulter at the 2021 Ryder Cup after previously voicing strong doubts.",
    url: "https://example.test/reversal"
  };
  assert.equal(areDuplicateStories(first, followUp), false);
});

test("different years, rounds, and opposing stances stay distinct", () => {
  const differentYear = variant(first, {
    title: "Chamblee Reacts To McIlroy’s Shocking Ryder Cup Pairing In 2023",
    summary: first.summary.replace("2021", "2023"), url: "https://example.test/2023"
  });
  const roundOne = { title: "Rory McIlroy and Ian Poulter win Ryder Cup first round", summary: "Rory McIlroy and Ian Poulter win their first round at the 2021 Ryder Cup at Whistling Straits.", url: "https://example.test/round-one" };
  const roundTwo = { title: "Rory McIlroy and Ian Poulter win Ryder Cup second round", summary: "Rory McIlroy and Ian Poulter win their second round at the 2021 Ryder Cup at Whistling Straits.", url: "https://example.test/round-two" };
  const criticism = { title: "Chamblee criticizes McIlroy and Poulter Ryder Cup pairing", summary: first.summary, url: "https://example.test/criticism" };
  const defense = { title: "Chamblee defends McIlroy and Poulter Ryder Cup pairing", summary: first.summary, url: "https://example.test/defense" };
  assert.equal(areDuplicateStories(first, differentYear), false);
  assert.equal(areDuplicateStories(roundOne, roundTwo), false);
  assert.equal(areDuplicateStories(criticism, defense), false);
});

test("a shared headline prefix or sparse information is not sufficient evidence", () => {
  const a = { title: "Rory McIlroy and Ian Poulter react to Ryder Cup victory", url: "https://example.test/one" };
  const b = { title: "Rory McIlroy and Ian Poulter react to Ryder Cup withdrawal", url: "https://example.test/two" };
  assert.equal(areDuplicateStories(a, b), false);
  assert.equal(areDuplicateStories({ title: "Rory and Ian react", url: "https://example.test/3" }, { title: "Rory and Ian comment", url: "https://example.test/4" }), false);
});

test("exact URLs remain duplicates; changed live leaderboard updates do not", () => {
  assert.equal(areDuplicateStories(first, { title: "A new headline", sourceUrl: first.url }), true);
  const live = { signal: "Leaderboard", title: "The Masters", summary: "A leads by one", url: "https://example.test/leaderboard" };
  assert.equal(areDuplicateStories(live, { ...live }), true);
  assert.equal(areDuplicateStories(live, { ...live, summary: "B leads by two" }), false);
});

test("candidate detection checks the main homepage sections", () => {
  for (const section of ["homepageFeatures", "today", "alsoMoving", "golfInternet"]) {
    assert.equal(storyAlreadyOnRadar({ [section]: [first] }, second), true, section);
    assert.equal(storyAlreadyOnRadar({ [section]: [first] }, unrelated), false, section);
  }
  assert.equal(storyAlreadyOnRadar({ checking: first }, second), true);
  // A weekly-only item must still be eligible for promotion to a main section.
  assert.equal(storyAlreadyOnRadar({ weekRadar: [first] }, second), false);
});

test("cleanup deduplicates within and across homepage sections in priority order", () => {
  const feed = {
    today: [first],
    alsoMoving: [second, unrelated],
    golfInternet: [{ ...first, title: "Same article elsewhere" }],
    weekRadar: [second, unrelated],
    checking: { title: "Checking" },
    metadata: { unchanged: true }
  };
  const cleaned = dedupeHomepageSections(feed);
  assert.deepEqual(cleaned.today, [first]);
  assert.deepEqual(cleaned.alsoMoving, [unrelated]);
  assert.deepEqual(cleaned.golfInternet, []);
  assert.deepEqual(cleaned.weekRadar, []);
  assert.deepEqual(cleaned.metadata, feed.metadata);
  assert.equal(feed.alsoMoving.length, 2, "does not mutate the input");
  assert.deepEqual(dedupeHomepageSections(cleaned), cleaned, "cleanup is idempotent");
  assert.equal(buildDeduplicatedHomepageJson(cleaned), null);
});

test("promoting a story removes a differently worded copy from Also Moving and Week Radar", () => {
  const now = liveTimestamp();
  const current = { today: [], alsoMoving: [{ ...second, timestamp: now }], weekRadar: [{ ...second, timestamp: now }], golfInternet: [] };
  const result = buildNextRadarJson(current, { ...first, timestamp: now, sourceType: "RSS", sourceName: "Yahoo Golf" });
  assert.equal(result.today.length, 1);
  assert.equal(result.alsoMoving.length, 0);
  assert.equal(result.weekRadar.length, 0);
});

test("Week Radar excludes reserved stories and can fill spare slots with distinct stories about the same player", () => {
  const now = liveTimestamp();
  const weekOnly = { ...unrelated, timestamp: now, quickRead: unrelated.summary };
  const result = buildWeekRadarFromStories([{ ...second, timestamp: now }, weekOnly], [], [first]);
  assert.deepEqual(result.map((item) => item.url), [unrelated.url]);
  const pair = [
    { ...first, timestamp: now, quickRead: first.summary },
    { ...unrelated, timestamp: now, quickRead: unrelated.summary }
  ];
  assert.equal(buildWeekRadarFromStories(pair, []).length, 2);
});

test("cleanup retries against the latest feed after a concurrent update", async () => {
  const previousFetch = global.fetch;
  const original = { active: true, today: [], alsoMoving: [first, second], weekRadar: [] };
  const concurrent = { ...original, today: [unrelated] };
  const writes = [];
  let reads = 0;
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    if (url.includes("latest-radar.json") && method === "GET") {
      const json = reads++ === 0 ? original : concurrent;
      return new Response(JSON.stringify({ sha: reads === 1 ? "initial" : "new-sha", content: Buffer.from(JSON.stringify(json)).toString("base64") }), { status: 200 });
    }
    if (url.includes("latest-radar.json") && method === "PUT") {
      const body = JSON.parse(options.body);
      writes.push({ sha: body.sha, json: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) });
      return writes.length === 1 ? new Response("conflict", { status: 409 }) : new Response("{}", { status: 200 });
    }
    if (url.includes("archive-radar.json") && method === "GET") {
      return new Response(JSON.stringify({ sha: "archive", content: Buffer.from(JSON.stringify({ stories: [first, unrelated] })).toString("base64") }), { status: 200 });
    }
    throw new Error(`Unexpected mocked request: ${method} ${url}`);
  };
  try {
    assert.equal(await cleanupDuplicateHomepageStories(), true);
    assert.equal(writes.length, 2);
    assert.equal(writes[1].sha, "new-sha");
    assert.deepEqual(writes[1].json.today, [unrelated], "preserves the concurrent story");
    assert.deepEqual(writes[1].json.alsoMoving, [first]);
  } finally {
    global.fetch = previousFetch;
  }
});


test("runner-up publisher deduplicates a batch and respects stories already in Today", async () => {
  const previousFetch = global.fetch;
  const now = liveTimestamp();
  const item = (story) => ({ ...story, sourceType: "RSS", sourceName: "Yahoo Golf", timestamp: now, quickRead: story.summary });
  const runPublisher = async (initial, items) => {
    let written = null;
    global.fetch = async (url, options = {}) => {
      const method = options.method || "GET";
      if (url.includes("latest-radar.json") && method === "GET") {
        return new Response(JSON.stringify({ sha: "feed-sha", content: Buffer.from(JSON.stringify(initial)).toString("base64") }), { status: 200 });
      }
      if (url.includes("latest-radar.json") && method === "PUT") {
        written = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
        return new Response("{}", { status: 200 });
      }
      if (url.includes("archive-radar.json") && method === "GET") {
        return new Response(JSON.stringify({ sha: "archive-sha", content: Buffer.from(JSON.stringify({ stories: [first, second, unrelated] })).toString("base64") }), { status: 200 });
      }
      throw new Error(`Unexpected mocked request: ${method} ${url}`);
    };
    assert.equal(await autoPublishHomepageRunnerUpsToGitHub(items), true);
    return written;
  };
  try {
    const batch = await runPublisher({ today: [], alsoMoving: [], weekRadar: [], golfInternet: [] }, [item(first), item(second)]);
    assert.deepEqual(batch.alsoMoving.map((story) => story.url), [first.url]);
    const across = await runPublisher({ today: [{ ...first, timestamp: now }], alsoMoving: [], weekRadar: [], golfInternet: [] }, [item(second), item(unrelated)]);
    assert.deepEqual(across.alsoMoving.map((story) => story.url), [unrelated.url]);
  } finally {
    global.fetch = previousFetch;
  }
});

test("cleanup performs no write when there are no duplicates", async () => {
  const previousFetch = global.fetch;
  let requests = 0;
  global.fetch = async (url, options = {}) => {
    requests += 1;
    assert.equal(options.method, "GET");
    return new Response(JSON.stringify({ sha: "clean", content: Buffer.from(JSON.stringify({ today: [first], alsoMoving: [unrelated], weekRadar: [] })).toString("base64") }), { status: 200 });
  };
  try {
    assert.equal(await cleanupDuplicateHomepageStories(), false);
    assert.equal(requests, 1);
  } finally {
    global.fetch = previousFetch;
  }
});
