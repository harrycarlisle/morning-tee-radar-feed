const fs = require("fs");
const path = require("path");

function pad(value) {
  return String(value).padStart(2, "0");
}

function timestampForFile(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function buildDraft(now = new Date()) {
  const generatedAt = now.toISOString();

  return `# Morning Tee Local Draft

> Local draft/template only. This file does not publish, send, schedule, or connect to Beehiiv.
> Human review is required before any copy is moved into Beehiiv.

Generated at: ${generatedAt}

## Issue Date

[YYYY-MM-DD]

## Subject Line

- [Option 1]
- [Option 2]
- [Option 3]

## Preview Text

[Preview text]

## Good Morning Intro

Good Morning,

[Lead with the interesting angle. Keep it short, specific, and useful.]

Today we're looking at:
- [Specific preview bullet]
- [Specific preview bullet]
- [Specific preview bullet]

## Story 1

### [Headline]

**Core fact:** [Verified fact]

**Why it matters:** [Why golfers should care]

**Memorable detail:** [Specific stat, shot, rule, quote, course feature, or trend]

**Golfer takeaway:** [Useful lesson]

Source notes:
- [Source link or verification note]

## Story 2

### [Headline]

**Core fact:** [Verified fact]

**Why it matters:** [Why golfers should care]

**Memorable detail:** [Specific detail]

**Golfer takeaway:** [Useful lesson]

Source notes:
- [Source link or verification note]

## Story 3

### [Headline]

**Core fact:** [Verified fact]

**Why it matters:** [Why golfers should care]

**Memorable detail:** [Specific detail]

**Golfer takeaway:** [Useful lesson]

Source notes:
- [Source link or verification note]

## Tip / Rules / Shot Section

### [Section Name]

The mistake/question: [Common issue or situation]

The better frame: [Clear advice]

Try this: [Specific action]

Source notes:
- [Source link or verification note]

## CTA / Signoff

[CTA or clean signoff]

## Source Notes

- [Source 1]
- [Source 2]
- [Open verification item]

## Final Checklist

- [ ] Current facts verified.
- [ ] Source links checked.
- [ ] Quotes/stats/rankings/tee times verified or removed.
- [ ] Each section has core fact, why it matters, memorable detail, and golfer takeaway.
- [ ] Voice is smart, clean, approachable, and not overhyped.
- [ ] Sponsor copy, if any, is clearly marked and useful.
- [ ] Human approval completed before Beehiiv.
- [ ] Nothing published or sent by this script.
`;
}

function createDraft() {
  const draftsDir = path.join(process.cwd(), "morning-tee-brain", "drafts");
  fs.mkdirSync(draftsDir, { recursive: true });

  const filePath = path.join(draftsDir, `${timestampForFile()}-local-draft.md`);
  fs.writeFileSync(filePath, buildDraft(), "utf8");

  return filePath;
}

if (require.main === module) {
  const filePath = createDraft();
  console.log(`[Morning Tee Brain] Created local draft: ${path.relative(process.cwd(), filePath).replace(/\\/g, "/")}`);
  console.log("[Morning Tee Brain] This script does not publish, send, schedule, or connect to Beehiiv.");
}

module.exports = {
  buildDraft,
  createDraft,
  timestampForFile
};
