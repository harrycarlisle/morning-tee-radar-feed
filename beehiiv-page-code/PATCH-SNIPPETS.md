# Beehiiv accessibility patch snippets

Use the **full block files** in this folder when replacing entire page-code blocks. Use these snippets only if you prefer surgical edits.

---

## Homepage combined block

### A. Today in Golf `aria-controls`

**Find:**
```html
<button class="mt-today-strip-inner" id="mt-today-toggle" type="button" aria-expanded="false">
```

**Replace:**
```html
<button class="mt-today-strip-inner" id="mt-today-toggle" type="button" aria-expanded="false" aria-controls="mt-today-panel">
```

---

### B. Quick Read modal focus

**In `openStoryModal()`, add before `modal.classList.add("is-open")`:**
```javascript
window.mthModalOpener = document.activeElement;
```

**After `document.body.classList.add("mth-modal-open");` add:**
```javascript
const closeButton = document.getElementById("mth-story-modal-close");
if (closeButton) closeButton.focus();
```

**At end of `closeStoryModal()`, before closing brace:**
```javascript
const opener = window.mthModalOpener;
window.mthModalOpener = null;

if (opener && typeof opener.focus === "function") {
  opener.focus();
}
```

---

### C. Radar image alt helper

**Add before `function buildMainCard(item)`:**
```javascript
function getStoryImageAlt(item, image) {
  if (item && item.imageAlt !== undefined) return String(item.imageAlt || "");

  const imageValue = String(image || "").toLowerCase();

  if (
    imageValue.includes("placeholder") ||
    imageValue.includes("lpga-placeholder") ||
    imageValue.includes("ncaa-golf-placeholder") ||
    imageValue.includes("golf-placeholder")
  ) {
    return "";
  }

  return "";
}
```

**In `buildMainCard()`, replace main-card image line:**
```javascript
alt="${title}"
```
**with:**
```javascript
alt="${escapeHtml(getStoryImageAlt(item, image))}"
```

---

### D. Mini Cup focus + Escape

**Inside `setupMiniCupOverlay()`, after the early return, add:**
```javascript
let miniCupOpener = null;
```

**In `openOverlay()`, after `overlay.setAttribute("aria-hidden", "false");`:**
```javascript
miniCupOpener = document.activeElement;
if (closeButton) closeButton.focus();
```

**In `closeOverlay()`, after `sheet.classList.remove("is-loading");`:**
```javascript
if (miniCupOpener && typeof miniCupOpener.focus === "function") {
  miniCupOpener.focus();
}
miniCupOpener = null;
```

**Before closing `setupMiniCupOverlay()`, add:**
```javascript
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && overlay.classList.contains("is-open")) {
    closeOverlay(event);
  }
});
```

**Add CSS near `.mt-mini-cup-overlay.is-open .mt-mini-cup-sheet`:**
```css
.mt-mini-cup-overlay:not(.is-open) .mt-mini-cup-sheet {
  visibility: hidden;
  pointer-events: none;
}
```

---

### E. Focus-visible styles (homepage)

**Add to custom CSS:**
```css
.mth-radar-open:focus-visible,
#mt-today-toggle:focus-visible,
.mt-mini-cup-card:focus-visible,
.mt-mini-cup-team:focus-visible,
.mt-story-card:focus-visible,
.mt-load-more:focus-visible,
#mt-story-search:focus-visible,
#mt-story-filter:focus-visible {
  outline: 3px solid #2f6a20 !important;
  outline-offset: 3px !important;
}
```

---

## Search page block

### G. Image alt helper

**After `let allStories = [];` add:**
```javascript
let mtStoryModalOpener = null;

function getStoryImageAlt(item) {
  if (item && item.imageAlt !== undefined) return String(item.imageAlt || "");

  const image = String(item && item.image || "").toLowerCase();

  if (
    image.includes("placeholder") ||
    image.includes("lpga-placeholder") ||
    image.includes("ncaa-golf-placeholder") ||
    image.includes("golf-placeholder")
  ) {
    return "";
  }

  return "";
}
```

**Replace both card templates:**
```javascript
alt="${escapeHtml(item.title)}"
```
**with:**
```javascript
alt="${escapeHtml(getStoryImageAlt(item))}"
```

---

### H. Search modal focus return

**In `openStoryModal()`, before `modal.classList.add("is-open")`:**
```javascript
mtStoryModalOpener = openerEl || document.activeElement;
```

**Replace close-button focus line with:**
```javascript
const closeButton = document.getElementById("mt-story-modal-close") || document.querySelector("[aria-label='Close quick read']");
if (closeButton) closeButton.focus();
```

**At end of `closeStoryModal()`:**
```javascript
if (mtStoryModalOpener && typeof mtStoryModalOpener.focus === "function") {
  mtStoryModalOpener.focus();
}
mtStoryModalOpener = null;
```

---

## Newsletter email (template-level)

The subscribe email field is **not** in the homepage combined iframe. See `newsletter-email-snippet.html` for the label markup to add in Beehiiv’s Subscribe widget or a custom hero form block.
