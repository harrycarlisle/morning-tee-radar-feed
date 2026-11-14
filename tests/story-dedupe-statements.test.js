const test = require("node:test");
const assert = require("node:assert/strict");
process.env.AUTO_PUBLISH = "true";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_OWNER = "test-owner";
process.env.GITHUB_REPO = "test-repo";
const { areDuplicateStories, dedupeStoryClusters, dedupeHomepageSections } = require("../story-dedupe");
const { storyAlreadyOnRadar, buildWeekRadarFromStories, autoPublishHomepageRunnerUpsToGitHub } = require("../reddit-checker");
// Exact published feed, updated 2026-11-04T20:38:56.675Z. Keep its sparse and
// truncated fields: replacing them with better descriptions hides the failure.
const feed = require("./fixtures/radar-2026-11-04.json");
const main = feed.today[0];
const repeated = feed.alsoMoving.slice(0, 4);
const reset = feed.alsoMoving[4];

function variant(item, changes) {
  return { ...item, sourceUrl: undefined, ...changes };
}

function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((rest) => [item, ...rest]));
}

test("November 4 feed keeps Today, removes four repeated comments, and retains separate developments", () => {
  const original = JSON.stringify(feed);
  const cleaned = dedupeHomepageSections(feed);
  assert.deepEqual(cleaned.today, [main]);
  assert.deepEqual(cleaned.alsoMoving, feed.alsoMoving.slice(4));
  assert.deepEqual(cleaned.weekRadar, [feed.weekRadar[2]]);
  assert.deepEqual(cleaned.homepageFeatures, feed.homepageFeatures);
  assert.deepEqual(cleaned.golfInternet, feed.golfInternet);
  assert.deepEqual(cleaned.checking, feed.checking);
  assert.equal(JSON.stringify(feed), original, "does not mutate the published snapshot");
  assert.deepEqual(dedupeHomepageSections(cleaned), cleaned, "cleanup is idempotent");
});

test("different headlines and tour aliases describe the same explicit allegation in either order", () => {
  for (const a of repeated) for (const b of repeated) {
    assert.equal(areDuplicateStories(a, b), true, `${a.title} / ${b.title}`);
  }
  for (const item of [repeated[1], repeated[3]]) {
    assert.equal(areDuplicateStories(main, item), true);
    assert.equal(areDuplicateStories(item, main), true);
  }
});

test("sparse coverage needs corroborating statement evidence, not only a shared player and tours", () => {
  assert.equal(areDuplicateStories(main, repeated[0]), false, "no shared named response or specific claim");
  assert.equal(areDuplicateStories(main, repeated[2]), false);
  assert.deepEqual(dedupeStoryClusters([main, repeated[0], repeated[1]]), [main]);
  assert.deepEqual(dedupeStoryClusters([repeated[0], main, repeated[1]]), [repeated[0]]);
});

test("corroborating coverage works in every arrival order and preserves section priority", () => {
  for (const ordered of permutations([main, ...repeated])) {
    assert.deepEqual(dedupeStoryClusters(ordered), [ordered[0]]);
  }
  for (const ordered of permutations(repeated)) {
    const cleaned = dedupeHomepageSections({ today: [main], alsoMoving: ordered, weekRadar: [] });
    assert.deepEqual(cleaned.today, [main]);
    assert.deepEqual(cleaned.alsoMoving, []);
  }
});

test("the financial reset and other November 4 developments remain separate from every Rory version", () => {
  for (const item of [main, ...repeated]) {
    assert.equal(areDuplicateStories(item, reset), false);
    assert.equal(areDuplicateStories(reset, item), false);
  }
  assert.deepEqual(dedupeStoryClusters([main, ...repeated, ...feed.alsoMoving.slice(4)]), [main, ...feed.alsoMoving.slice(4)]);
});

test("background quotes cannot turn a separate financial development into duplicate coverage", () => {
  const different = variant(reset, {
    quickRead: `${reset.quickRead} As background, ${repeated[3].quickRead}`,
    url: "https://example.test/reset-with-background"
  });
  for (const item of [main, ...repeated]) assert.equal(areDuplicateStories(item, different), false);
  assert.deepEqual(dedupeStoryClusters([main, ...repeated, different]), [main, different]);
});

test("same-day comments with another subject, speaker, stance, or concrete action are distinct", () => {
  const base = repeated[2];
  const variants = [
    variant(base, { title: "Rory McIlroy backs DP World Tour schedule changes amid LIV Golf debate", summary: "Rory McIlroy supports adding new venues to the DP World Tour schedule while LIV Golf's future remains unclear.", quickRead: "", url: "https://example.test/schedule" }),
    variant(base, { title: base.title.replace("Rory McIlroy", "Shane Lowry"), summary: base.summary.replace("Rory McIlroy", "Shane Lowry"), url: "https://example.test/lowry" }),
    variant(base, { title: "Rory McIlroy denies claim that LIV Golf wanted to destroy the European Tour", summary: "Rory McIlroy disputes claims that LIV Golf intended to destroy the DP World Tour to serve as its replacement.", quickRead: "", url: "https://example.test/denial" }),
    variant(base, { title: "Rory McIlroy reverses stance on LIV Golf wanting to destroy the European Tour", summary: "Rory McIlroy no longer supports claims that LIV Golf intended to destroy the DP World Tour.", quickRead: "", url: "https://example.test/reversal" }),
    variant(base, { title: "Rory McIlroy returns to DP World Tour amid LIV Golf dispute", summary: base.summary, url: "https://example.test/return" })
  ];
  for (const item of variants) {
    for (const other of [main, ...repeated]) {
      assert.equal(areDuplicateStories(item, other), false, item.title);
      assert.equal(areDuplicateStories(other, item), false, item.title);
    }
    assert.deepEqual(dedupeStoryClusters([main, ...repeated, item]), [main, item]);
  }
});

test("statement fallback requires a common dated event and does not merge recurring comments", () => {
  const differentDay = variant(repeated[2], { timestamp: "2026-11-11T13:55:38.000Z", url: "https://example.test/later" });
  const undated = variant(repeated[2], { timestamp: undefined, url: "https://example.test/undated" });
  assert.equal(areDuplicateStories(repeated[0], differentDay), false);
  assert.equal(areDuplicateStories(repeated[0], undated), false);
  assert.deepEqual(dedupeStoryClusters([main, ...repeated, differentDay]), [main, differentDay]);
});

test("statement recognition is not tied to Rory McIlroy's name or November 4", () => {
  const changed = [main, ...repeated].map((item, index) => variant(item, {
    title: item.title.replaceAll("Rory McIlroy", "Shane Lowry"),
    summary: item.summary.replaceAll("Rory McIlroy", "Shane Lowry"),
    quickRead: item.quickRead.replaceAll("Rory McIlroy", "Shane Lowry"),
    timestamp: "2026-11-10T12:00:00.000Z",
    url: `https://example.test/another-speaker-${index}`
  }));
  assert.deepEqual(dedupeStoryClusters(changed), [changed[0]]);
});

test("corroborating statements cannot bridge conflicting explicit event details", () => {
  const a = variant(repeated[1], { summary: repeated[1].summary + " The comments concern events in 2025.", url: "https://example.test/2025-comments" });
  const b = variant(repeated[3], { summary: repeated[3].summary + " The comments concern events in 2026.", url: "https://example.test/2026-comments" });
  assert.equal(areDuplicateStories(a, b), false);
  for (const ordered of permutations([main, a, b])) {
    assert.equal(dedupeStoryClusters(ordered).length, 2, "a sparse bridge cannot override explicit years");
  }
});

test("negated statements and other tours cannot acquire an affirmative allegation anchor", () => {
  const denial = variant(repeated[2], {
    title: "Rory McIlroy supports DP World Tour but denies LIV Golf wanted to destroy the European Tour",
    summary: repeated[2].summary,
    url: "https://example.test/qualified-denial"
  });
  const otherTour = variant(repeated[2], {
    title: repeated[2].title.replace("European Tour", "Ladies European Tour"),
    summary: repeated[2].summary.replace("DP World Tour", "Ladies European Tour"),
    quickRead: "", url: "https://example.test/other-tour"
  });
  for (const item of [denial, otherTour]) {
    assert.equal(areDuplicateStories(repeated[0], item), false);
    assert.deepEqual(dedupeStoryClusters([main, ...repeated, item]), [main, item]);
  }
});

test("every reserved description remains comparison evidence even when another version was preferred", () => {
  const title = "Rory McIlroy discusses his plans for next season";
  const a = { title, summary: "Practice sessions focus on driving accuracy, putting technique and coaching.", url: "https://example.test/practice" };
  const b = { title, summary: "Practice sessions focus on driving accuracy while training includes strength conditioning and endurance.", url: "https://example.test/training" };
  const c = { title, summary: "Training includes strength conditioning and endurance alongside nutrition, recovery and hydration.", url: "https://example.test/conditioning" };
  assert.equal(areDuplicateStories(a, b), true);
  assert.equal(areDuplicateStories(b, c), true);
  assert.equal(areDuplicateStories(a, c), false);
  assert.deepEqual(dedupeStoryClusters([c], [a, b]), []);
});

test("an exact article URL remains authoritative when its descriptions contain conflicting years", () => {
  const revised = { ...main, summary: "The article now includes context about the 2025 season." };
  const original = { ...main, summary: "The article includes context about the 2026 season." };
  assert.equal(areDuplicateStories(original, revised), true);
  assert.deepEqual(dedupeStoryClusters([original, revised]), [original]);
  assert.deepEqual(dedupeStoryClusters([revised], [original]), []);
});

test("statement evidence crosses all homepage sections without changing the chosen story", () => {
  const sections = ["homepageFeatures", "today", "alsoMoving", "golfInternet", "weekRadar"];
  for (let index = 0; index < sections.length - 1; index++) {
    const earlier = sections[index], later = sections[index + 1];
    const input = { [earlier]: [main, reset], [later]: [repeated[0], repeated[1]] };
    const cleaned = dedupeHomepageSections(input);
    assert.deepEqual(cleaned[earlier], [main, reset]);
    assert.deepEqual(cleaned[later], []);
  }
  const sameObject = dedupeHomepageSections({ today: [main], alsoMoving: [main], weekRadar: [main] });
  assert.deepEqual(sameObject.today, [main]);
  assert.deepEqual(sameObject.alsoMoving, []);
  assert.deepEqual(sameObject.weekRadar, []);
});

test("candidate checks and Week Radar use corroborating reports before removing repeated versions", () => {
  const now = new Date().toISOString();
  // Manually approved inputs isolate deduplication from the independent RSS
  // source-verification gate proposed in PR #6.
  const approved = (item) => ({ ...item, signal: "Editorial", sourceType: "Manual", timestamp: now });
  const current = { today: [approved(main)], alsoMoving: [approved(repeated[1])] };
  assert.equal(storyAlreadyOnRadar(current, approved(repeated[0])), true);
  const result = buildWeekRadarFromStories([...repeated, reset].map(approved), [], [approved(main)]);
  assert.deepEqual(result.map((item) => item.url), [reset.url]);
});

test("runner-up publishing uses the complete eligible batch while preserving a separate development", async () => {
  const previousFetch = global.fetch;
  const now = new Date().toISOString();
  const approved = (item) => ({ ...item, signal: "Editorial", sourceType: "Manual", sourceName: "Yahoo Golf", timestamp: now });
  const current = { today: [approved(main)], alsoMoving: [], weekRadar: [] };
  const writes = [];
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    if (url.includes("latest-radar.json") && method === "GET") {
      return new Response(JSON.stringify({ sha: "feed-sha", content: Buffer.from(JSON.stringify(current)).toString("base64") }));
    }
    if (url.includes("latest-radar.json") && method === "PUT") {
      writes.push(JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8")));
      return new Response("{}");
    }
    if (url.includes("archive-radar.json") && method === "GET") {
      return new Response(JSON.stringify({ sha: "archive-sha", content: Buffer.from(JSON.stringify({ stories: [approved(main), approved(reset)] })).toString("base64") }));
    }
    throw new Error(`Unexpected mocked request: ${method} ${url}`);
  };
  try {
    assert.equal(await autoPublishHomepageRunnerUpsToGitHub([...repeated, reset].map(approved)), true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].today[0].url, main.url);
    assert.deepEqual(writes[0].alsoMoving.map((item) => item.url), [reset.url]);
    assert.deepEqual(writes[0].weekRadar, []);
  } finally {
    global.fetch = previousFetch;
  }
});
