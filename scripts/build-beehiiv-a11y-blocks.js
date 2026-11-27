#!/usr/bin/env node
/**
 * Applies accessibility fixes to extracted Beehiiv page-code blocks.
 * Source: live site snapshots from accessibility audit.
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "beehiiv-page-code");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function writeOut(name, content) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), content, "utf8");
  console.log("Wrote", name, `(${content.length} bytes)`);
}

function patchHomepageCombined(source) {
  let html = source;

  // A. Today in Golf aria-controls
  html = html.replace(
    '<button class="mt-today-strip-inner" id="mt-today-toggle" type="button" aria-expanded="false">',
    '<button class="mt-today-strip-inner" id="mt-today-toggle" type="button" aria-expanded="false" aria-controls="mt-today-panel">'
  );

  // C. getStoryImageAlt helper (before buildMainCard)
  if (!html.includes("function getStoryImageAlt(item, image)")) {
    html = html.replace(
      "    function buildMainCard(item) {",
      `    function getStoryImageAlt(item, image) {
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

    function buildMainCard(item) {`
    );
  }

  // C. radar image alt
  html = html.replace(
    ': `<img src="${escapeHtml(image)}" alt="${title}" data-mth-fallbacks=\'${encodeFallbackCandidates(imageFallbacks)}\' onerror="window.mthSwapToNextImage(this);">`',
    ': `<img src="${escapeHtml(image)}" alt="${escapeHtml(getStoryImageAlt(item, image))}" data-mth-fallbacks=\'${encodeFallbackCandidates(imageFallbacks)}\' onerror="window.mthSwapToNextImage(this);">`'
  );

  // B. Quick Read focus management - store opener before open
  html = html.replace(
    `      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("mth-modal-open");

      const modalCard = modal.querySelector(".mth-story-modal-card");
      if (modalCard) modalCard.scrollTop = 0;
    }

    function closeStoryModal() {
      const modal = document.getElementById("mth-story-modal");
      if (!modal) return;

      modal.classList.remove("is-open");
      modal.classList.remove("is-main-story", "is-side-story");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("mth-modal-open");
    }`,
    `      window.mthModalOpener = document.activeElement;

      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("mth-modal-open");

      const modalCard = modal.querySelector(".mth-story-modal-card");
      if (modalCard) modalCard.scrollTop = 0;

      const closeButton = document.getElementById("mth-story-modal-close");
      if (closeButton) closeButton.focus();
    }

    function closeStoryModal() {
      const modal = document.getElementById("mth-story-modal");
      if (!modal) return;

      modal.classList.remove("is-open");
      modal.classList.remove("is-main-story", "is-side-story");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("mth-modal-open");

      const opener = window.mthModalOpener;
      window.mthModalOpener = null;

      if (opener && typeof opener.focus === "function") {
        opener.focus();
      }
    }`
  );

  // D. Mini Cup focus and Escape
  html = html.replace(
    `      if (!openButton || !overlay || !sheet) return;

      function openOverlay(event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        sheet.classList.remove("is-loading");
        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");
      }

      function closeOverlay(event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        sheet.classList.remove("is-loading");
      }`,
    `      if (!openButton || !overlay || !sheet) return;

      let miniCupOpener = null;

      function openOverlay(event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        sheet.classList.remove("is-loading");
        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");
        miniCupOpener = document.activeElement;
        if (closeButton) closeButton.focus();
      }

      function closeOverlay(event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        sheet.classList.remove("is-loading");

        if (miniCupOpener && typeof miniCupOpener.focus === "function") {
          miniCupOpener.focus();
        }
        miniCupOpener = null;
      }`
  );

  if (!html.includes('event.key === "Escape" && overlay.classList.contains("is-open")')) {
    html = html.replace(
      `      overlay.querySelectorAll(".mt-mini-cup-team").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          redirectToGame(button.getAttribute("data-team"));
        });
      });
    }`,
      `      overlay.querySelectorAll(".mt-mini-cup-team").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          redirectToGame(button.getAttribute("data-team"));
        });
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && overlay.classList.contains("is-open")) {
          closeOverlay(event);
        }
      });
    }`
    );
  }

  // D. Mini Cup CSS
  if (!html.includes(".mt-mini-cup-overlay:not(.is-open) .mt-mini-cup-sheet")) {
    html = html.replace(
      `    .mt-mini-cup-overlay.is-open .mt-mini-cup-sheet {
      transform: translateY(0);
    }`,
      `    .mt-mini-cup-overlay.is-open .mt-mini-cup-sheet {
      transform: translateY(0);
    }

    .mt-mini-cup-overlay:not(.is-open) .mt-mini-cup-sheet {
      visibility: hidden;
      pointer-events: none;
    }`
    );
  }

  // E. Visible focus styles
  const focusCss = `
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
`;

  if (!html.includes("#mt-today-toggle:focus-visible")) {
    html = html.replace(
      "  .mt-home-combined-block .mt-home-editorial {",
      `${focusCss}
  .mt-home-combined-block .mt-home-editorial {`
    );
  }

  return html;
}

function patchSearchPage(source) {
  let html = source;

  // G. getStoryImageAlt helper
  if (!html.includes("function getStoryImageAlt(item)")) {
    html = html.replace(
      "    let allStories = [];",
      `    let allStories = [];
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
    }`
    );
  }

  // G. image alt in templates (both originals and story grid)
  html = html.replaceAll(
    'alt="${escapeHtml(item.title)}"',
    'alt="${escapeHtml(getStoryImageAlt(item))}"'
  );

  // H. modal focus return
  html = html.replace(
    `      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("mt-modal-open");

      requestAnimationFrame(function () {
        if (modalCard) modalCard.scrollTop = 0;

        if (isMobile) {
          modal.scrollIntoView({
            behavior: "auto",
            block: "start"
          });
        }
      });

      const closeButton = document.getElementById("mt-story-modal-close");
      if (closeButton) closeButton.focus();
    }

    function closeStoryModal() {
      const modal = document.getElementById("mt-story-modal");
      if (!modal) return;

      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      modal.style.removeProperty("--mt-modal-top");

      unlockPageScroll();
    }`,
    `      mtStoryModalOpener = openerEl || document.activeElement;

      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("mt-modal-open");

      requestAnimationFrame(function () {
        if (modalCard) modalCard.scrollTop = 0;

        if (isMobile) {
          modal.scrollIntoView({
            behavior: "auto",
            block: "start"
          });
        }
      });

      const closeButton = document.getElementById("mt-story-modal-close") || document.querySelector("[aria-label='Close quick read']");
      if (closeButton) closeButton.focus();
    }

    function closeStoryModal() {
      const modal = document.getElementById("mt-story-modal");
      if (!modal) return;

      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      modal.style.removeProperty("--mt-modal-top");

      unlockPageScroll();

      if (mtStoryModalOpener && typeof mtStoryModalOpener.focus === "function") {
        mtStoryModalOpener.focus();
      }
      mtStoryModalOpener = null;
    }`
  );

  // E. focus styles for search page
  const focusCss = `
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
`;

  if (!html.includes("#mt-story-search:focus-visible")) {
    html = html.replace(
      "  .mt-stories-page {",
      `${focusCss}
  .mt-stories-page {`
    );
  }

  return html;
}

function patchHeroSubscribeNote(source) {
  // Hero block has no email field in current snapshot; provide optional snippet file content
  const snippet = `<!-- Newsletter email accessibility (Beehiiv subscribe widget / hero form block)
     The live homepage subscribe field is in the Beehiiv site subscribe widget, not in the hero iframe.
     If you add or control the email input in a custom block, use:

<label class="sr-only" for="mt-hero-email">Email address</label>
<input id="mt-hero-email" type="email" name="email" aria-label="Email address" placeholder="Email">

<style>
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
</style>

If the field is in Beehiiv's built-in Subscribe element, set Accessible label / aria-label in the widget settings instead.
`;
  return snippet;
}

const homeCombined = patchHomepageCombined(read("/tmp/beehiiv-extracted/home-1-combined.html"));
const searchPage = patchSearchPage(read("/tmp/beehiiv-extracted/search-0-search.html"));

writeOut("homepage-combined-block.html", homeCombined);
writeOut("search-page-block.html", searchPage);
writeOut("newsletter-email-snippet.html", patchHeroSubscribeNote(""));

// Change log for Harry
const changelog = `# Beehiiv page-code accessibility updates

Paste these files into the matching Beehiiv custom HTML blocks:

| File | Beehiiv block |
|------|----------------|
| \`homepage-combined-block.html\` | Homepage combined block (Today In Golf + Newest/Radar + Top Picks/Puzzles) |
| \`search-page-block.html\` | Search / all stories page block |
| \`newsletter-email-snippet.html\` | Subscribe widget or hero form (template-level; see file notes) |

## Changes applied

### Homepage combined block
- **A.** \`aria-controls="mt-today-panel"\` on Today in Golf toggle
- **B.** Quick Read modal stores opener, focuses close button on open, returns focus on close
- **C.** \`getStoryImageAlt()\` helper; radar main card images use decorative alt instead of headline
- **D.** Mini Cup stores opener, focuses close on open, Escape closes, returns focus; hidden sheet CSS when closed
- **E.** \`:focus-visible\` outlines on interactive controls

### Search page block
- **G.** \`getStoryImageAlt()\` helper; story card images use decorative alt for placeholders
- **H.** Modal stores opener, focuses close on open, returns focus to story card on close
- **E.** \`:focus-visible\` outlines on search controls and cards

### Newsletter email
- Not in extracted hero iframe; see \`newsletter-email-snippet.html\` for Beehiiv subscribe widget guidance

Generated: ${new Date().toISOString()}
`;

writeOut("README.md", changelog);

// Sanity checks
const checks = [
  ["homepage aria-controls", homeCombined.includes('aria-controls="mt-today-panel"')],
  ["homepage getStoryImageAlt", homeCombined.includes("function getStoryImageAlt(item, image)")],
  ["homepage no alt=title radar", !homeCombined.includes('alt="${title}" data-mth-fallbacks')],
  ["homepage mthModalOpener", homeCombined.includes("window.mthModalOpener")],
  ["homepage miniCup Escape", homeCombined.includes('event.key === "Escape" && overlay.classList.contains("is-open")')],
  ["homepage focus-visible", homeCombined.includes("#mt-today-toggle:focus-visible")],
  ["search getStoryImageAlt", searchPage.includes("function getStoryImageAlt(item)")],
  ["search mtStoryModalOpener", searchPage.includes("mtStoryModalOpener")],
  ["search no item.title alt", !searchPage.includes('alt="${escapeHtml(item.title)}"')],
  ["search focus-visible", searchPage.includes("#mt-story-search:focus-visible")]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
