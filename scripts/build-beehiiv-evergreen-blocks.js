#!/usr/bin/env node
/**
 * Applies evergreen / stale-date UI patches to Beehiiv page-code blocks.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "beehiiv-page-code");
const EVERGREEN_ARTICLE = {
  title: "The Easiest Way to Lower Your Score Is Not Hitting It Farther",
  kicker: "Strategy",
  author: "Morning Tee",
  url: "https://www.morningtee.com/stories-lower-your-score-smarter-targets",
  image: "https://beehiiv-images-production.s3.amazonaws.com/uploads/asset/file/859693c9-1144-410d-ae49-bd906c89345c/first-golf-lesson-final.png?t=1780600444",
  alt: "Golfer studying a green before choosing a target line.",
  dek: "Most golfers chase better contact. But the fastest scoring gains usually come from choosing smarter targets."
};

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function write(name, content) {
  fs.writeFileSync(path.join(ROOT, name), content, "utf8");
  console.log("Wrote", name);
}

function patchHomepage(source) {
  let html = source;

  html = html.replace("<h2>Latest Puzzles</h2>", "<h2>Puzzles</h2>");

  html = html.replace(
    `            <div class="mth-radar-side-time">\${escapeHtml(formatStoryTime(item, index))}</div>`,
    ""
  );

  const evergreenArticleJson = JSON.stringify(
    {
      title: EVERGREEN_ARTICLE.title,
      kicker: EVERGREEN_ARTICLE.kicker,
      author: EVERGREEN_ARTICLE.author,
      url: EVERGREEN_ARTICLE.url,
      image: EVERGREEN_ARTICLE.image,
      alt: EVERGREEN_ARTICLE.alt,
      dek: EVERGREEN_ARTICLE.dek,
      evergreen: true
    },
    null,
    4
  ).replace(/\n/g, "\n      ");

  if (!html.includes(EVERGREEN_ARTICLE.url)) {
    html = html.replace(
      "    const topPickArticles = [",
      `    const topPickArticles = [\n      ${evergreenArticleJson},`
    );
  }

  html = html.replace(
    'const secondPickFirstUrl = "https://www.morningtee.com/stories-golf-ball-rollback-explained-for-normal-people";',
    `const secondPickFirstUrl = "${EVERGREEN_ARTICLE.url}";`
  );

  html = html.replace(
    /<a class="mt-pick-card"\s+href="https:\/\/www\.morningtee\.com\/stories-golf-ball-rollback-explained-for-normal-people" target="_top">[\s\S]*?<\/a>/,
    `<a class="mt-pick-card" href="${EVERGREEN_ARTICLE.url}" target="_top">
              <div class="mt-pick-image">
                <img
                src="${EVERGREEN_ARTICLE.image}"
                alt="${EVERGREEN_ARTICLE.alt}"
              >
              </div>

              <div class="mt-pick-content">
                <div class="mt-pick-kicker">${EVERGREEN_ARTICLE.kicker}</div>
                <h3>${EVERGREEN_ARTICLE.title}</h3>
                <p>${EVERGREEN_ARTICLE.dek}</p>
                <div class="mt-pick-meta">${EVERGREEN_ARTICLE.author}</div>
              </div>
            </a>`
  );

  return html;
}

function patchSearch(source) {
  let html = source;

  html = html.replace(
    '<div class="mt-section-kicker">Latest Around Golf</div>',
    '<div class="mt-section-kicker">Golf stories</div>'
  );
  html = html.replace('<h2 id="mt-latest-title">Newest stories</h2>', '<h2 id="mt-latest-title">All stories</h2>');
  html = html.replace(
    '<span class="mt-visually-hidden">Search latest stories</span>',
    '<span class="mt-visually-hidden">Search stories</span>'
  );
  html = html.replace(
    'placeholder="Search latest stories by player, tour, title, or source"',
    'placeholder="Search stories by player, tour, title, or source"'
  );
  html = html.replace('<option value="all">All latest stories</option>', '<option value="all">All stories</option>');
  html = html.replace(
    '<h3>Loading latest stories...</h3>',
    '<h3>Loading stories...</h3>'
  );
  html = html.replace(
    "<p>Morning Tee radar stories will appear here.</p>",
    "<p>Morning Tee stories will appear here.</p>"
  );
  html = html.replace(
    '<h3>No latest stories found</h3>',
    '<h3>No stories found</h3>'
  );
  html = html.replace(
    '${escapeHtml(index >= 6 ? getStoryDate(item) : getStoryMeta(item))}',
    '${escapeHtml(getStoryMeta(item))}'
  );

  if (!html.includes(EVERGREEN_ARTICLE.url)) {
    html = html.replace(
      "    const manualArticles = [",
      `    const manualArticles = [\n      {\n        title: ${JSON.stringify(EVERGREEN_ARTICLE.title)},\n        category: "STRATEGY",\n        author: ${JSON.stringify(EVERGREEN_ARTICLE.author)},\n        readTime: "4 min read",\n        image: ${JSON.stringify(EVERGREEN_ARTICLE.image)},\n        thumbnail: ${JSON.stringify(EVERGREEN_ARTICLE.image)},\n        url: ${JSON.stringify(EVERGREEN_ARTICLE.url)},\n        summary: ${JSON.stringify(EVERGREEN_ARTICLE.dek)},\n        topics: ["Strategy", "Course Management", "Scoring"],\n        evergreen: true\n      },`
    );
  }

  return html;
}

write("homepage-combined-block.html", patchHomepage(read("homepage-combined-block.html")));
write("search-page-block.html", patchSearch(read("search-page-block.html")));

const checks = [
  ["homepage Puzzles heading", read("homepage-combined-block.html").includes("<h2>Puzzles</h2>")],
  ["homepage no side time render", !read("homepage-combined-block.html").includes('class="mth-radar-side-time"')],
  ["homepage evergreen pick", read("homepage-combined-block.html").includes(EVERGREEN_ARTICLE.url)],
  ["homepage second pick url", read("homepage-combined-block.html").includes(`secondPickFirstUrl = "${EVERGREEN_ARTICLE.url}"`)],
  ["search no card date render", !read("search-page-block.html").includes("getStoryDate(item) :")],
  ["search All stories", read("search-page-block.html").includes(">All stories</h2>")],
  ["search evergreen manual", read("search-page-block.html").includes(EVERGREEN_ARTICLE.url)]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
