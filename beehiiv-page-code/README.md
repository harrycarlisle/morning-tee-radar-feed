# Beehiiv page-code updates

## Accessibility blocks (prior update)

| File | Beehiiv block |
|------|----------------|
| `homepage-combined-block.html` | Homepage combined block |
| `search-page-block.html` | Search / all stories page |
| `PATCH-SNIPPETS.md` | Surgical accessibility edits |

## Evergreen / stale-date updates (latest)

| File | Purpose |
|------|---------|
| `homepage-combined-block.html` | Removes stale relative times, renames Puzzles section, features evergreen Strategy pick |
| `search-page-block.html` | Removes visible card dates, softens “latest/newest” labels, adds evergreen article |
| `EVERGREEN-PATCH-SNIPPETS.md` | Surgical evergreen edits |
| `evergreen-article-draft.md` | Full article draft for Beehiiv paste |

Regenerate evergreen patches:

```bash
node scripts/build-beehiiv-evergreen-blocks.js
```

## Paste instructions

1. Replace the **homepage combined block** with `homepage-combined-block.html`
2. Replace the **search page block** with `search-page-block.html`
3. Publish the evergreen article in Beehiiv from `evergreen-article-draft.md`
   - Suggested slug: `stories-lower-your-score-smarter-targets`
4. No fake publish date required on the homepage card

## What stays internal (not shown)

- Golf Mini `minis[].date` release scheduling
- `publishedAt` / `date` fields in search `manualArticles`
- Today in Golf update label (unchanged)
- Radar feed sorting timestamps (unchanged)
