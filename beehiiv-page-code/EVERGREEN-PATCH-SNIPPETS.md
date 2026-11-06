# Evergreen date-removal patches

Paste these into Beehiiv if you prefer surgical edits instead of replacing the full blocks.

---

## Homepage combined block

### 1. Rename puzzle section heading

**Find:** `<h2>Latest Puzzles</h2>`  
**Replace:** `<h2>Puzzles</h2>`

### 2. Remove stale relative times from Newest side cards

**Find and delete this line inside `buildSideCard()`:**
```javascript
<div class="mth-radar-side-time">${escapeHtml(formatStoryTime(item, index))}</div>
```

Internal `formatStoryTime()` can stay. It is no longer rendered.

### 3. Feature evergreen strategy article in Top Picks

**Add to the top of `topPickArticles`:**
```javascript
{
  title: "The Easiest Way to Lower Your Score Is Not Hitting It Farther",
  kicker: "Strategy",
  author: "Morning Tee",
  url: "https://www.morningtee.com/stories-lower-your-score-smarter-targets",
  image: "https://beehiiv-images-production.s3.amazonaws.com/uploads/asset/file/859693c9-1144-410d-ae49-bd906c89345c/first-golf-lesson-final.png?t=1780600444",
  alt: "Golfer studying a green before choosing a target line.",
  dek: "Most golfers chase better contact. But the fastest scoring gains usually come from choosing smarter targets.",
  evergreen: true
},
```

**Change:**
```javascript
const secondPickFirstUrl = "https://www.morningtee.com/stories-golf-ball-rollback-explained-for-normal-people";
```
**To:**
```javascript
const secondPickFirstUrl = "https://www.morningtee.com/stories-lower-your-score-smarter-targets";
```

**Replace the static second Top Picks card HTML** with the evergreen Strategy card (see `homepage-combined-block.html`).

---

## Search page block

### 4. Remove visible dates from story cards

**Find:**
```javascript
${escapeHtml(index >= 6 ? getStoryDate(item) : getStoryMeta(item))}
```
**Replace:**
```javascript
${escapeHtml(getStoryMeta(item))}
```

Keep `date` / `publishedAt` fields in `manualArticles` for internal reference if needed. They are no longer shown in the UI.

### 5. Soften stale “latest/newest” labels

| Find | Replace |
|------|---------|
| `Latest Around Golf` | `Golf stories` |
| `Newest stories` | `All stories` |
| `Search latest stories` | `Search stories` |
| `Search latest stories by player, tour, title, or source` | `Search stories by player, tour, title, or source` |
| `All latest stories` | `All stories` |
| `Loading latest stories...` | `Loading stories...` |
| `No latest stories found` | `No stories found` |

### 6. Add evergreen article to `manualArticles`

Add the Strategy article object from `evergreen-article-draft.md` / `homepage-combined-block.html` to the top of `manualArticles`.

---

## Golf Mini note

Golf Mini release dates in the `minis` array are **internal only** and should stay. The public UI already shows puzzle title + category only.

---

## Newsletter module note

No dated “latest newsletter” module exists in the custom page-code blocks. The homepage subscribe CTA is in Beehiiv site chrome. Publish the evergreen article in Beehiiv when ready; no fake publish date is required on the card.
