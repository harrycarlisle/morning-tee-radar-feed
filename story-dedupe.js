// Conservative story matching for independently worded coverage. Topic or player
// overlap alone is not enough: fuzzy matches also need a shared action and a
// substantial set of specific facts from the title and available context.
const STOP_WORDS = new Set(`
  about after against all also amid and another are around article at back been
  before being but can could did does during each even for from had has have her
  here him his how into its just more most news new not now of off on one only
  out over says said she some than that the their them then there these they this
  those through to too up was were what when where which who why will with would
  you your
`.trim().split(/\s+/));

const ACTION_PATTERNS = {
  pairing: /\b(?:pair(?:ed|ing|ings|s)?|partner(?:ed|ing|s)?|team(?:ed|ing)? up)\b/i,
  reaction: /\b(?:react(?:s|ed|ion|ions)?|doubt(?:s|ed)?|disbelief|believe|shocked|shocking|surpris(?:e|ed|ing)|critici[sz]\w*|prais\w*|defend\w*)\b/i,
  win: /\b(?:win|wins|winning|won|victory|victories|beat|beats|defeat(?:s|ed)?)\b/i,
  loss: /\b(?:lose|loses|losing|lost|loss)\b/i,
  apology: /\b(?:apologi[sz]\w*|apology|apologies)\b/i,
  reversal: /\b(?:revers(?:e|es|ed|al)|recant(?:s|ed)?|chang(?:e|es|ed) (?:his|her|their) mind|walk(?:s|ed)? back)\b/i,
  withdrawal: /\b(?:withdraw(?:s|n|al|als|ing)?|withdrew|pull(?:s|ed|ing)? out)\b/i,
  injury: /\b(?:injur(?:y|ies|ed)|hurt|surgery)\b/i,
  departure: /\b(?:leav(?:e|es|ing)|left|quit(?:s|ting)?|depart(?:s|ed|ure)?)\b/i,
  arrival: /\b(?:join(?:s|ed|ing)?|sign(?:s|ed|ing)?|return(?:s|ed|ing)?)\b/i,
  punishment: /\b(?:suspend(?:s|ed|sion)?|ban(?:s|ned)?|disqualif\w*)\b/i,
  retirement: /\b(?:retir(?:e|es|ed|ing|ement))\b/i
};

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/'s\b/g, "")
    .replace(/\b(?:could|can|did)\s+not\s+believe\b|\bcouldn't\s+believe\b/g, "reaction")
    .replace(/\b(?:react(?:s|ed|ion|ions)?|doubt(?:s|ed)?|disbelief|believe|shocked|shocking|surpris(?:e|ed|ing))\b/g, "reaction")
    .replace(/\b(?:pair(?:ed|ing|ings|s)?|partner(?:ed|ing|s)?|team(?:ed|ing)? up)\b/g, "pairing")
    .replace(/\b(?:withdraw(?:s|n|al|als|ing)?|withdrew|pull(?:s|ed|ing)? out)\b/g, "withdrawal")
    .replace(/\b(?:win|wins|winning|won|victory|victories)\b/g, "winning")
    .replace(/\b(?:injur(?:y|ies|ed)|hurt)\b/g, "injury")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value) {
  return new Set(normalize(value).split(/\s+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

function actions(value) {
  return new Set(Object.entries(ACTION_PATTERNS)
    .filter(([, pattern]) => pattern.test(value))
    .map(([name]) => name));
}

function intersectionSize(a, b) {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function equalSets(a, b) {
  return a.size === b.size && intersectionSize(a, b) === a.size;
}

function storyText(item) {
  return [item.title, item.summary, item.quickRead, item.quickContext, item.modalSummary]
    .filter(Boolean).join(" ");
}

function eventYears(text) {
  return new Set(String(text).match(/\b(?:19|20)\d{2}\b/g) || []);
}

function roundNumbers(text) {
  const value = String(text).toLowerCase();
  const result = new Set();
  const patterns = [
    ["1", /\b(?:first|opening|1st)\s+(?:round|session)|\bround\s+(?:one|1)\b/],
    ["2", /\b(?:second|2nd)\s+(?:round|session)|\bround\s+(?:two|2)\b/],
    ["3", /\b(?:third|3rd)\s+(?:round|session)|\bround\s+(?:three|3)\b/],
    ["4", /\b(?:fourth|final|4th)\s+(?:round|session)|\bround\s+(?:four|4)\b/]
  ];
  for (const [round, pattern] of patterns) if (pattern.test(value)) result.add(round);
  return result;
}

// Compare explicit player pairings when both stories name them. A summary may
// mention other players as background, so only inspect the pairing phrase.
function pairingParticipants(text) {
  const name = "([A-Z][A-Za-z'’.-]+(?:\\s+[A-Z][A-Za-z'’.-]+)?)";
  const patterns = [
    new RegExp("\\bpair(?:ing|ed|s)?\\s+" + name + "\\s+(?:with|and)\\s+" + name),
    new RegExp(name + "\\s+(?:(?:was|were|is)\\s+)?paired\\s+with\\s+" + name)
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (!match) continue;
    return match.slice(1, 3).map((value) => normalize(value).split(" ").pop()).sort().join(":");
  }
  return "";
}

function titleStance(title) {
  const positive = /\b(?:prais\w*|defend\w*|applaud\w*|endorse\w*)\b/i.test(title);
  const negative = /\b(?:critici[sz]\w*|slam\w*|condemn\w*|doubt\w*)\b/i.test(title);
  return positive === negative ? "" : positive ? "positive" : "negative";
}

function isLeaderboard(item) {
  return /leaderboard/i.test(String(item.signal || item.sourceType || "")) ||
    String(item.status || "").toLowerCase() === "live" || Array.isArray(item.leaders);
}

function storyUrls(item) {
  return [item.url, item.sourceUrl]
    .map((url) => String(url || "").trim().toLowerCase())
    .filter((url) => url && url !== "#");
}

function sameStoryUrl(a, b) {
  const urlsB = storyUrls(b);
  return storyUrls(a).some((url) => urlsB.includes(url));
}

function statementText(value) {
  return normalize(value)
    .replace(/\bladies european tour\b/g, "ladieseuropeantour")
    .replace(/\bpga tour champions\b/g, "pgatourchampions")
    .replace(/\b(?:dp world tour|european tour)\b/g, "dpworldtour")
    .replace(/\bliv(?: golf)?\b/g, "livgolf")
    .replace(/\blpga tour\b/g, "lpgatour")
    .replace(/\bpga tour\b/g, "pgatour");
}

// Additional evidence for differently framed reports of a statement. Keep the
// ordinary overlap thresholds intact. Require an explicit headline speaker, a
// dated event, and either the same allegation or endorsement of a named source.
// Restrict evidence to headlines focused on that statement: a background quote
// in an article about finances, a return, etc. must not join the comment cluster.
function statementEvidence(item) {
  const title = String(item?.title || "");
  const speaker = title.match(/^(?:(?:Why|How)\s+)?([A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+)\b(.*)$/);
  if (!speaker || !/^\s+(?:fully\s+)?(?:voices? support|backs?|supports?|endorses?|agrees?|accuses?|hits? out|says?|said)\b/i.test(speaker[2])) return null;
  const date = Date.parse(item.timestamp || item.publishedAt || "");
  if (!Number.isFinite(date) || isLeaderboard(item)) return null;

  const headline = statementText(title);
  if (/\b(?:not|never|denies|denied|rejects?|rejected|disputes?|disputed|reverses?|reversed|reversal)\b|\bno longer\b/.test(headline)) return null;
  const text = statementText(storyText(item));
  const organization = "(?:dpworldtour|livgolf|pgatour|lpgatour)";
  const support = "(?:backs?|backed|supports?|supported|endorses?|endorsed|agrees?|agreed)";
  const supportsTour = new RegExp("\\b" + support + "(?:\\s+\\w+){0,3}\\s+" + organization + "\\b").test(headline);
  const allegation = new RegExp("\\bdestroy(?:s|ed|ing)?\\s+(?:the\\s+)?(" + organization + ")\\b", "g");
  if (!supportsTour && !new RegExp(allegation.source).test(headline)) return null;

  const organizations = [...new Set(text.match(/\b(?:dpworldtour|livgolf|pgatour|lpgatour)\b/g) || [])].sort();
  // The second organization identifies the subject of the dispute, rather than
  // treating every statement in support of the same tour as the same event.
  if (organizations.length !== 2) return null;
  const scope = organizations.join(":");
  const anchors = new Set();
  const negated = (index) => /\b(?:not|never|denies|denied|rejects?|rejected|disputes?|disputed)\b/.test(text.slice(Math.max(0, index - 70), index));
  for (const match of text.matchAll(allegation)) {
    if (!negated(match.index)) anchors.add(`claim:destroy:${match[1]}:${scope}`);
  }
  const endorsement = new RegExp("\\b" + support + "(?:\\s+\\w+){0,5}\\s+(" + organization + ")\\s+(?:ceo|commissioner|chairman|chairwoman)\\s+([a-z]+\\s+[a-z]+)\\s+(?:claims?|said|says)\\b", "g");
  for (const match of text.matchAll(endorsement)) {
    if (!negated(match.index)) anchors.add(`endorsement:${match[1]}:${match[2]}:${scope}`);
  }
  return anchors.size ? { speaker: normalize(speaker[1]), day: new Date(date).toISOString().slice(0, 10), anchors } : null;
}

function sameStatement(a, b) {
  return Boolean(a && b && a.speaker === b.speaker && a.day === b.day && intersectionSize(a.anchors, b.anchors));
}

function conflictingEventDetails(a, b) {
  const textA = storyText(a);
  const textB = storyText(b);
  const yearsA = eventYears(textA);
  const yearsB = eventYears(textB);
  if (yearsA.size && yearsB.size && !equalSets(yearsA, yearsB)) return true;

  const pairingA = pairingParticipants(textA);
  const pairingB = pairingParticipants(textB);
  if (pairingA && pairingB && pairingA !== pairingB) return true;

  const roundsA = roundNumbers(textA);
  const roundsB = roundNumbers(textB);
  if (roundsA.size && roundsB.size && !equalSets(roundsA, roundsB)) return true;

  // Headlines about different developments can share the same people and event.
  // Reaction wording may be omitted from one headline, so compare event actions
  // separately from reactions when both headlines describe an action.
  const headlineActionsA = actions(a.title);
  const headlineActionsB = actions(b.title);
  headlineActionsA.delete("reaction");
  headlineActionsB.delete("reaction");
  if (headlineActionsA.size && headlineActionsB.size && !equalSets(headlineActionsA, headlineActionsB)) return true;

  const stanceA = titleStance(a.title);
  const stanceB = titleStance(b.title);
  return Boolean(stanceA && stanceB && stanceA !== stanceB);
}

function areDuplicateStories(a, b) {
  if (!a || !b) return false;

  // A live leaderboard can legitimately change while keeping its URL and title.
  if (isLeaderboard(a) || isLeaderboard(b)) {
    return isLeaderboard(a) && isLeaderboard(b) &&
      Boolean(a.title && b.title) && a.title === b.title && a.summary === b.summary;
  }

  if (sameStoryUrl(a, b)) return true;

  const titleA = normalize(a.title);
  const titleB = normalize(b.title);
  if (!titleA || !titleB || conflictingEventDetails(a, b)) return false;

  if (sameStatement(statementEvidence(a), statementEvidence(b))) return true;

  const textA = storyText(a);
  const textB = storyText(b);
  const tokensA = words(textA);
  const tokensB = words(textB);
  const shared = intersectionSize(tokensA, tokensB);
  const coverage = shared / Math.min(tokensA.size || 1, tokensB.size || 1);

  // An identical, sufficiently informative headline is strong evidence unless
  // both descriptions contain substantial but unrelated details. This avoids
  // treating a generic rewritten headline as proof when its context differs.
  if (titleA === titleB && words(titleA).size >= 5) {
    const detailA = words([a.summary, a.quickRead, a.quickContext, a.modalSummary].filter(Boolean).join(" "));
    const detailB = words([b.summary, b.quickRead, b.quickContext, b.modalSummary].filter(Boolean).join(" "));
    if (detailA.size < 7 || detailB.size < 7 || intersectionSize(detailA, detailB) / Math.min(detailA.size, detailB.size) >= 0.5) {
      return true;
    }
  }

  const actionsA = actions(textA);
  const actionsB = actions(textB);
  const sharedActions = intersectionSize(actionsA, actionsB);
  if (sharedActions >= 2) return shared >= 7 && coverage >= 0.58;
  // One common action and the same people can still describe a follow-up.
  // Require much more shared context when there is only one event cue.
  return sharedActions === 1 && shared >= 9 && coverage >= 0.75;
}

function uniqueStoryIndexes(items, reserved = []) {
  const entries = [...reserved, ...items];
  const evidence = entries.map((item) => statementEvidence(item));
  const parents = entries.map((_, index) => index);
  const members = entries.map((_, index) => [index]);
  const root = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const clustersConflict = (a, b) => members[a].some((index) =>
    members[b].some((other) => conflictingEventDetails(entries[index], entries[other])));
  // Only the bounded statement evidence is transitive. Ordinary fuzzy matches
  // retain the original first-wins behavior, avoiding topic-overlap chains.
  // Inspect all candidates before choosing representatives so a richer report
  // can connect two sparse versions regardless of their arrival order.
  for (let index = 0; index < entries.length; index++) {
    for (let other = 0; other < index; other++) {
      if (!sameStatement(evidence[index], evidence[other])) continue;
      const a = root(index), b = root(other);
      if (a === b || clustersConflict(a, b)) continue;
      parents[a] = b;
      members[b].push(...members[a]);
    }
  }
  const accepted = [];
  const seen = new Set();
  const output = [];
  entries.forEach((item, index) => {
    if (!item) return;
    const cluster = root(index);
    if (index < reserved.length) {
      // Reserved descriptions are already published. Keep every version as
      // comparison evidence even when two of them match one another.
      accepted.push(index);
      seen.add(cluster);
      return;
    }
    const duplicate = seen.has(cluster) || accepted.some((other) =>
      areDuplicateStories(item, entries[other]) &&
      (sameStoryUrl(item, entries[other]) || !clustersConflict(cluster, root(other))));
    seen.add(cluster);
    if (duplicate) return;
    accepted.push(index);
    output.push(index - reserved.length);
  });
  return output;
}

function dedupeStoryClusters(items = [], reserved = []) {
  return uniqueStoryIndexes(items || [], reserved || []).map((index) => items[index]);
}

// Earlier sections have priority. Week Radar is populated from the other
// sections and additional sources, but should not display a second copy.
function dedupeHomepageSections(radar) {
  const result = { ...radar };
  const sections = ["homepageFeatures", "today", "alsoMoving", "golfInternet", "weekRadar"]
    .filter((section) => Array.isArray(radar[section]));
  const items = sections.flatMap((section) => radar[section]);
  const retained = new Set(uniqueStoryIndexes(items));
  let index = 0;
  for (const section of sections) {
    result[section] = radar[section].filter(() => retained.has(index++));
  }
  return result;
}

module.exports = { areDuplicateStories, dedupeStoryClusters, dedupeHomepageSections };
