const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const {
  quickReadLooksWeak, quickReadSummary, extractSourceArticle, createQuickReadService,
  verificationPasses
} = require("../lib/quick-read-quality");
const october31 = require("./fixtures/quick-reads-2026-10-31.json");

// All other stories, quotations and article bodies below are synthetic test data.
const title = "Brooks Koepka responds when asked if his best golf is still ahead of him";
const answer = 'Koepka said he still believes his best golf is ahead of him, telling the interviewer, "Yes, absolutely."';
const context = "He said his priority is staying healthy through the next season.";
const informative = `${answer} ${context}`;
const article = { title, text: `The interviewer asked about Koepka's future. ${informative}` };
const story = (extra = {}) => ({
  sourceType: "RSS", sourceName: "Test Golf", title,
  summary: "Brooks Koepka endured a challenging return to the PGA Tour this year.",
  url: "https://example.test/koepka", publishedAt: new Date().toISOString(), ...extra
});

function proposal(prompt) {
  return JSON.parse(prompt.split("SOURCE DATA AND PROPOSAL:\n")[1]);
}

function approval(quickRead, sources = { article: article.text }) {
  const source = sources.article ? "article" : "feed";
  return {
    answersHeadline: true, summaryAnswersHeadline: true, allClaimsSupported: true,
    headlineAnswer: quickReadSummary(quickRead),
    evidence: [{ source, quote: sources[source] }]
  };
}

function harness({ generated = informative, check, source = article, enabled = true } = {}) {
  const prompts = [];
  let fetches = 0;
  const service = createQuickReadService({
    enabled,
    fetchArticle: async () => { fetches++; return source; },
    requestJson: async (prompt) => {
      prompts.push(prompt);
      if (!prompt.includes("SOURCE DATA AND PROPOSAL:\n")) return { quickRead: generated };
      const data = proposal(prompt);
      return check ? check(data) : approval(data.quickRead, data);
    }
  });
  return { service, prompts, fetches: () => fetches };
}

for (const example of october31) {
  test(`October 31 teaser fails: ${example.title}`, async () => {
    assert.ok(example.quickRead.length >= 55);
    assert.equal(quickReadLooksWeak(example.quickRead, example), true);
    const { service, prompts } = harness({ generated: example.quickRead, source: null });
    const result = await service.withVerifiedQuickRead(story(example));
    assert.equal(result.quickRead, "");
    assert.equal(service.hasVerifiedQuickRead(result), false);
    assert.equal(prompts.length, 1); // No acceptance check for an obvious teaser.
  });
}

test("long background with no blacklist words still needs a verified headline answer", async () => {
  const vague = "Koepka's season included several difficult tournaments and an extended spell away from regular competition on the tour.";
  assert.equal(quickReadLooksWeak(vague, story()), false);
  const { service } = harness({ generated: vague, check: () => ({
    answersHeadline: false, summaryAnswersHeadline: false, allClaimsSupported: true,
    headlineAnswer: "", evidence: [{ source: "article", quote: vague }]
  }), source: { title, text: vague } });
  const result = await service.withVerifiedQuickRead(story({ summary: vague }));
  assert.equal(result.quickRead, "");
});

test("an informative read can share a headline prefix or equal an informative summary", async () => {
  const news = "Miyu Yamashita shot a 5-under 67 to take a two-stroke lead into the final round in Malaysia.";
  const item = story({ title: "Miyu Yamashita shot a 5-under 67", summary: news, quickRead: news });
  assert.equal(quickReadLooksWeak(news, item), false);
  const { service, prompts } = harness({ source: { title: item.title, text: news } });
  const result = await service.withVerifiedQuickRead(item);
  assert.equal(result.quickRead, news);
  assert.equal(service.hasVerifiedQuickRead(result), true);
  assert.equal(prompts.length, 1); // The existing text was independently checked.
});

test("pure headline restatements fail but a concrete statement containing discussing passes", () => {
  const headline = "Brooks Koepka confirms his next appearance at a PGA Tour tournament";
  assert.equal(quickReadLooksWeak(`${headline}.`, { title: headline }), true);
  assert.equal(quickReadLooksWeak("While discussing his schedule, Koepka said he will play the Austin Championship in November.", story()), false);
  assert.equal(quickReadLooksWeak("Koepka has had back surgery and will miss the Austin Championship in November.", story()), false);
});

test("truncated headline uses the full source headline and the actual answer", async () => {
  const { service, prompts } = harness();
  const result = await service.withVerifiedQuickRead(story({ title: october31[0].title }));
  assert.equal(result.quickRead, informative);
  assert.equal(service.hasVerifiedQuickRead(result), true);
  for (const prompt of prompts) {
    assert.ok(prompt.includes(october31[0].title));
    assert.ok(prompt.includes(title));
  }
});

test("a truncated headline and unavailable central answer are withheld", async () => {
  const { service } = harness({
    source: { title: "Brooks Koepka responds when asked...", text: context },
    generated: context,
    check: () => ({ ...approval(context, { article: context }), answersHeadline: false })
  });
  const result = await service.withVerifiedQuickRead(story({ title: "Brooks Koepka responds when asked..." }));
  assert.equal(result.quickRead, "");
});

test("a quote on another topic cannot satisfy a response headline", async () => {
  const unrelated = 'Koepka said, "I enjoyed the course this week and the greens were in excellent condition."';
  const { service } = harness({
    source: { title, text: unrelated }, generated: unrelated,
    check: () => ({ ...approval(unrelated, { article: unrelated }), answersHeadline: false })
  });
  assert.equal((await service.withVerifiedQuickRead(story())).quickRead, "");
});

test("missing decisions, statements and developments fail even with supported background", async () => {
  for (const headline of [
    "PGA Tour announces a decision on its autumn schedule",
    "Paige Spiranac reveals her latest move",
    "Rory McIlroy explains why he changed his schedule"
  ]) {
    const vague = "The autumn schedule includes several tournaments that attract professional golfers from around the world.";
    const { service } = harness({
      source: { title: headline, text: vague }, generated: vague,
      check: () => ({ ...approval(vague, { article: vague }), answersHeadline: false })
    });
    assert.equal((await service.withVerifiedQuickRead(story({ title: headline, summary: vague }))).quickRead, "");
  }
});

test("supported answers to decision, statement and development headlines remain eligible", async () => {
  for (const [headline, news] of [
    ["PGA Tour announces its autumn schedule decision", "The PGA Tour announced that the Austin Championship will move from November to October next season."],
    ["Paige Spiranac reveals her latest move", "Paige Spiranac announced a new weekly golf instruction series that will begin on her channel in November."],
    ["Rory McIlroy explains why he changed his schedule", "McIlroy said he removed the Austin Championship from his schedule to spend that week resting an injured wrist."]
  ]) {
    const { service } = harness({ source: { title: headline, text: news }, generated: news });
    const result = await service.withVerifiedQuickRead(story({ title: headline }));
    assert.equal(result.quickRead, news);
    assert.equal(service.hasVerifiedQuickRead(result), true);
  }
});

test("supported background cannot occupy the card summary while the answer is buried later", async () => {
  const late = `${context} ${answer}`;
  const { service } = harness({ generated: late, check: () => ({
    ...approval(late), summaryAnswersHeadline: false
  }) });
  assert.equal((await service.withVerifiedQuickRead(story())).quickRead, "");
});

test("unsupported context or a strengthened reported claim causes rejection", async () => {
  for (const extra of ["He will certainly win the next major.", "This guarantees his PGA Tour return."]) {
    const { service } = harness({ generated: `${answer} ${extra}`, check: (data) => ({
      ...approval(data.quickRead), allClaimsSupported: false
    }) });
    assert.equal((await service.withVerifiedQuickRead(story())).quickRead, "");
  }
});

test("verification requires strict flags, a first-sentence answer and exact source evidence", () => {
  const sources = { article: article.text, feed: "" };
  const valid = approval(informative);
  assert.equal(verificationPasses(valid, sources, informative), true);
  for (const patch of [
    { answersHeadline: "true" }, { allClaimsSupported: false },
    { summaryAnswersHeadline: false }, { headlineAnswer: "A made up answer that is absent." },
    { headlineAnswer: context }, { evidence: [] }, { evidence: null },
    { evidence: [{ source: "headline", quote: title }] },
    { evidence: [{ source: "article", quote: "The source never contained this supporting quotation." }] },
    { evidence: [{ source: "article", quote: "Yes" }] }
  ]) assert.equal(verificationPasses({ ...valid, ...patch }, sources, informative), false);
});

test("complete feed details can establish an answer when the article is unavailable", async () => {
  const { service, prompts } = harness({ source: null });
  const result = await service.withVerifiedQuickRead(story({ summary: `${context} ${informative}` }));
  assert.equal(result.quickRead, informative);
  assert.equal(service.hasVerifiedQuickRead(result), true);
  assert.ok(prompts[0].includes(answer.replaceAll('"', '\\"')));
});

test("empty evidence, disabled generation and API failures never restore a summary fallback", async () => {
  for (const options of [{ enabled: false }, { source: null, generated: "", check: () => ({ answersHeadline: false }) }]) {
    const { service } = harness(options);
    const result = await service.withVerifiedQuickRead(story({ summary: informative, quickContext: context, modalSummary: informative }));
    assert.equal(result.quickRead, "");
    assert.equal(result.quickContext, "");
    assert.equal(result.modalSummary, "");
  }
  let requests = 0;
  const service = createQuickReadService({
    fetchArticle: async () => null,
    requestJson: async () => { requests++; throw new Error("API unavailable"); }
  });
  assert.equal((await service.withVerifiedQuickRead(story({ summary: "" }))).quickRead, "");
  assert.equal(requests, 0);
  assert.equal((await service.withVerifiedQuickRead(story({ summary: informative }))).quickRead, "");
});

test("a failed check of existing text is followed by generation and a fresh check", async () => {
  const stale = "Koepka's season included several missed cuts and difficult rounds during his return to regular competition.";
  const { service, prompts } = harness({ check: (data) => data.quickRead === stale
    ? { answersHeadline: false } : approval(data.quickRead, data) });
  const result = await service.withVerifiedQuickRead(story({ quickRead: stale }));
  assert.equal(result.quickRead, informative);
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0].includes("SOURCE DATA AND PROPOSAL"), true);
  assert.equal(prompts[1].includes("SOURCE DATA AND PROPOSAL"), false);
  assert.equal(prompts[2].includes("SOURCE DATA AND PROPOSAL"), true);
});

test("equivalent concurrent candidates reuse source, generation and verification within a run", async () => {
  const { service, prompts, fetches } = harness();
  const results = await Promise.all([story(), story(), story()].map(service.withVerifiedQuickRead));
  assert.equal(fetches(), 1);
  assert.equal(prompts.length, 2);
  assert.ok(results.every(service.hasVerifiedQuickRead));
  await service.withVerifiedQuickRead(story({ title: "Koepka gives a statement about his future" }));
  assert.equal(fetches(), 1);
  assert.equal(prompts.length, 4);
});

test("changing verified text, its source or its headline invalidates publishing approval", async () => {
  const { service } = harness();
  for (const field of ["title", "url", "sourceUrl", "summary", "quickRead"]) {
    const result = await service.withVerifiedQuickRead(story());
    assert.equal(service.hasVerifiedQuickRead(result), true);
    result[field] = "changed";
    assert.equal(service.hasVerifiedQuickRead(result), false);
  }
});

test("source extraction prefers articleBody and preserves the full source headline", () => {
  const html = `<nav>${"menus unrelated news ".repeat(500)}</nav><h1>${title}</h1>
    <script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "NewsArticle", headline: title, articleBody: informative }] })}</script>
    <article><p>Unrelated short preview.</p></article>`;
  assert.deepEqual(extractSourceArticle(html), { title, text: informative });
});

test("source extraction uses visible article paragraphs and excludes unrelated page chrome", () => {
  const html = `<nav>${"navigation ".repeat(800)}</nav><article><h1>${title}</h1>
    <p>Koepka said &#8220;Yes, absolutely.&#8221;</p><aside>Other players' latest news.</aside><p>${context}</p>
    </article><footer>Subscribe here.</footer>`;
  assert.deepEqual(extractSourceArticle(html), { title, text: `Koepka said “Yes, absolutely.” ${context}` });
  assert.deepEqual(extractSourceArticle("<html><nav>News menus.</nav><p>Sign in to continue.</p></html>"), { title: "", text: "" });
  assert.equal(extractSourceArticle(`<script type="application/ld+json">broken</script><main><p>${informative}</p></main>`).text, informative);
});

test("abbreviations, decimals and complete numeric results are preserved without sentence slicing", async () => {
  const news = "The U.S. Open purse rose to $21.5 million, the USGA announced. The winner earns $4.3 million.";
  assert.equal(quickReadSummary(news), "The U.S. Open purse rose to $21.5 million, the USGA announced.");
  assert.equal(quickReadLooksWeak(news), false);
  assert.equal(quickReadLooksWeak("Yamashita shot a five-under round to take the lead in Malaysia with a total score of 198."), false);
  const { service } = harness({ generated: news, source: { title: "USGA announces the U.S. Open purse", text: news } });
  assert.equal((await service.withVerifiedQuickRead(story({ title: "USGA announces the U.S. Open purse" }))).quickRead, news);
  for (const broken of [`${context} ...`, `${context} The tournament starts on Dec.`, `${context} This will affect the U.S.`]) {
    assert.equal(quickReadLooksWeak(broken), true);
  }
});

// Load the actual publishing paths with a fake network and isolated environment.
function loadRadar(fetch, env = {}) {
  const filename = path.resolve(__dirname, "../reddit-checker.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, require: createRequire(filename), fetch,
    process: { env: {
      AUTO_PUBLISH: "true", OPENAI_API_KEY: "test-key", GITHUB_TOKEN: "test-token",
      GITHUB_OWNER: "test-owner", GITHUB_REPO: "test-repo", ...env
    } },
    console: { log() {}, error() {} }, Date, Buffer, URL, AbortSignal, setTimeout
  }, { filename });
  return module.exports;
}

const jsonResponse = (data) => ({ ok: true, json: async () => data });
const modelResponse = (data) => jsonResponse({ output_text: JSON.stringify(data) });

function fakePublishingNetwork({ generated = informative, current = {}, check, invalidModel = false, sourceArticles = {} } = {}) {
  const writes = [];
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push(url);
    if (url.startsWith("https://example.test/")) {
      const source = sourceArticles[url] || article;
      return { ok: true, text: async () => `<article><h1>${source.title}</h1><p>${source.text}</p></article>` };
    }
    if (url === "https://api.openai.com/v1/responses") {
      if (invalidModel) return jsonResponse({ output_text: "not valid JSON" });
      const prompt = JSON.parse(options.body).input;
      if (!prompt.includes("SOURCE DATA AND PROPOSAL:\n")) {
        const sources = JSON.parse(prompt.split("SOURCE DATA:\n")[1]);
        return modelResponse({ quickRead: typeof generated === "function" ? generated(sources) : generated });
      }
      const data = proposal(prompt);
      return modelResponse(check ? check(data) : approval(data.quickRead, data));
    }
    if (url.includes("/contents/latest-radar.json")) {
      if (options.method === "PUT") {
        const payload = JSON.parse(options.body);
        writes.push(JSON.parse(Buffer.from(payload.content, "base64").toString()));
        return jsonResponse({ content: { sha: "new-sha" } });
      }
      return jsonResponse({ sha: "old-sha", content: Buffer.from(JSON.stringify({ today: [], alsoMoving: [], weekRadar: [], ...current })).toString("base64") });
    }
    if (url.includes("/contents/archive-radar.json")) {
      if (options.method === "PUT") return jsonResponse({ content: { sha: "archive-sha" } });
      return { ok: false, status: 404 };
    }
    throw new Error(`Unexpected network request: ${url}`);
  };
  return { fetch, writes, calls };
}

test("both final publishers reject unverified RSS, including informative fallback fields", async () => {
  let calls = 0;
  const radar = loadRadar(async () => { calls++; throw new Error("Must not use the network"); });
  for (const item of [story(), story({ summary: informative }), story({ quickContext: informative }), story({ quickRead: informative }), ...october31.map((item) => story(item))]) {
    assert.equal(await radar.autoPublishToGitHub(item), false);
    assert.equal(await radar.autoPublishHomepageRunnerUpsToGitHub([item]), false);
  }
  assert.equal(calls, 0);
});

test("failed generation cannot leak through summary aliases or the Week Radar path", async () => {
  const rejecting = fakePublishingNetwork({ generated: "", check: () => ({ answersHeadline: false }) });
  const failedRadar = loadRadar(rejecting.fetch);
  const failed = await failedRadar.withQuickRead(story({ quickContext: informative, modalSummary: informative }));
  assert.equal(failed.quickRead, "");
  assert.equal(failed.quickContext, "");
  assert.equal(failed.modalSummary, "");
  assert.equal(failedRadar.hasPublishableQuickRead(failed), false);
  assert.equal(await failedRadar.autoPublishHomepageRunnerUpsToGitHub([failed]), false);
  assert.equal(failedRadar.buildWeekRadarFromStories([failed], []).length, 0);
});

test("malformed model JSON and missing API key withhold RSS without a fallback", async () => {
  for (const env of [{}, { OPENAI_API_KEY: "" }]) {
    const network = fakePublishingNetwork({ invalidModel: true });
    const radar = loadRadar(network.fetch, env);
    const result = await radar.withQuickRead(story({ summary: informative }));
    assert.equal(result.quickRead, "");
    assert.equal(radar.hasPublishableQuickRead(result), false);
    assert.equal(await radar.autoPublishToGitHub(result), false);
    assert.equal(network.writes.length, 0);
  }
});

test("runner-up publishing keeps input order, drops rejected reads and preserves manual content", async () => {
  const manual = { title: "An editor's feature", summary: "A deliberately short editorial teaser.", source: "Morning Tee", url: "https://manual.test/feature" };
  const secondTitle = "Miyu Yamashita takes the lead in Malaysia";
  const secondNews = "Miyu Yamashita shot a 5-under 67 to take a two-stroke lead into the final round in Malaysia.";
  const secondUrl = "https://example.test/second";
  const network = fakePublishingNetwork({
    current: { homepageFeatures: [manual], alsoMoving: [manual, ...october31], today: [] },
    sourceArticles: { [secondUrl]: { title: secondTitle, text: secondNews } },
    generated: (sources) => sources.headline === secondTitle ? secondNews : informative
  });
  const radar = loadRadar(network.fetch);
  const first = await radar.withQuickRead(story({ url: "https://example.test/first" }));
  const second = await radar.withQuickRead(story({ title: secondTitle, summary: secondNews, url: secondUrl }));
  assert.equal(await radar.autoPublishHomepageRunnerUpsToGitHub([first, story(), second]), true);
  const published = network.writes[0];
  assert.deepEqual(published.alsoMoving.map((item) => item.url), [first.url, second.url, manual.url]);
  assert.deepEqual(published.homepageFeatures, [manual]);
  assert.equal(published.alsoMoving[0].summary, answer);
  assert.equal(published.alsoMoving[0].quickRead, informative);
  assert.ok(!JSON.stringify(published).includes("answersHeadline"));
});

test("primary publishing uses the verified answer as the summary and removes legacy RSS teasers", async () => {
  const network = fakePublishingNetwork({ current: { today: [october31[0]], alsoMoving: [october31[1]] } });
  const radar = loadRadar(network.fetch);
  const item = await radar.withQuickRead(story());
  assert.equal(await radar.autoPublishToGitHub(item), true);
  assert.equal(network.writes[0].today[0].summary, answer);
  assert.equal(network.writes[0].today[0].quickRead, informative);
  assert.equal(network.writes[0].alsoMoving.length, 0);
});

test("an already-published weak entry does not block a verified replacement in either publisher", async () => {
  const weak = { ...october31[0], url: "https://example.test/koepka", sourceUrl: "https://example.test/koepka" };
  for (const publisher of ["primary", "runner-up"]) {
    const network = fakePublishingNetwork({ current: { alsoMoving: [weak] } });
    const radar = loadRadar(network.fetch);
    const item = await radar.withQuickRead(story(weak));
    assert.equal(publisher === "primary"
      ? await radar.autoPublishToGitHub(item)
      : await radar.autoPublishHomepageRunnerUpsToGitHub([item]), true);
    const published = [...network.writes[0].today, ...network.writes[0].alsoMoving];
    assert.equal(published.length, 1);
    assert.equal(published[0].quickRead, informative);
    assert.equal(published[0].summary, answer);
  }
});

test("verified Week Radar items retain their RSS provenance for future quality checks", async () => {
  const network = fakePublishingNetwork();
  const radar = loadRadar(network.fetch);
  const item = await radar.withQuickRead(story());
  const result = radar.buildWeekRadarFromStories([item], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].signal, "RSS");
  assert.equal(result[0].quickRead, informative);
});

test("Week Radar excludes unverified raw RSS and obvious legacy teasers while retaining editorial choices", () => {
  const radar = loadRadar(async () => { throw new Error("No network expected"); });
  const manual = { title: "Tiger Woods injury watch", summary: context, quickRead: informative, source: "Morning Tee", url: "https://manual.test/watch", timestamp: new Date().toISOString() };
  const result = radar.buildWeekRadarFromStories([story({ quickRead: informative }), manual], october31);
  assert.deepEqual(Array.from(result, (item) => item.url), [manual.url]);
});

test("the read-only quick-read audit uses the same rules for October 31 examples and informative controls", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "morning-tee-quick-reads-"));
  try {
    const filename = path.join(dir, "feed.json");
    writeFileSync(filename, JSON.stringify({ alsoMoving: october31 }));
    const audit = spawnSync(process.execPath, ["scripts/validate-quick-reads.js", filename], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
    assert.equal(audit.status, 1);
    assert.equal(JSON.parse(audit.stdout).weakQuickReadCount, 2);
    writeFileSync(filename, JSON.stringify({ alsoMoving: [{ title, quickRead: informative, summary: informative }] }));
    const good = spawnSync(process.execPath, ["scripts/validate-quick-reads.js", filename], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
    assert.equal(good.status, 0);
    assert.equal(JSON.parse(good.stdout).strongQuickReadCount, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
