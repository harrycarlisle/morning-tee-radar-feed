# Beehiiv page-code accessibility updates

Paste these files into the matching Beehiiv custom HTML blocks:

| File | Beehiiv block |
|------|----------------|
| `homepage-combined-block.html` | Homepage combined block (Today In Golf + Newest/Radar + Top Picks/Puzzles) |
| `search-page-block.html` | Search / all stories page block |
| `newsletter-email-snippet.html` | Subscribe widget or hero form (template-level; see file notes) |

## Changes applied

### Homepage combined block
- **A.** `aria-controls="mt-today-panel"` on Today in Golf toggle
- **B.** Quick Read modal stores opener, focuses close button on open, returns focus on close
- **C.** `getStoryImageAlt()` helper; radar main card images use decorative alt instead of headline
- **D.** Mini Cup stores opener, focuses close on open, Escape closes, returns focus; hidden sheet CSS when closed
- **E.** `:focus-visible` outlines on interactive controls

### Search page block
- **G.** `getStoryImageAlt()` helper; story card images use decorative alt for placeholders
- **H.** Modal stores opener, focuses close on open, returns focus to story card on close
- **E.** `:focus-visible` outlines on search controls and cards

### Newsletter email
- Not in extracted hero iframe; see `newsletter-email-snippet.html` for Beehiiv subscribe widget guidance

Generated: 2026-07-14T12:50:30.549Z
