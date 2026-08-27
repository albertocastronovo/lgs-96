(() => {
  "use strict";

  const CARD_SELECTOR = '[role="button"][componentkey^="job-card-component-ref-"]';
  const BADGE_CLASS = "lgs96-badge";
  const BADGE_STATE_CLASS = "lgs96-badge--loading";
  const SPINNER_CLASS = "lgs96-badge__spinner";
  const LABEL_CLASS = "lgs96-badge__label";
  const LOADING_TEXT = "Fetching salary info";
  const SCAN_DEBOUNCE_MS = 150;

  function createBadge() {
    const badge = document.createElement("div");
    badge.className = `${BADGE_CLASS} ${BADGE_STATE_CLASS}`;
    badge.setAttribute("role", "status");

    const spinner = document.createElement("span");
    spinner.className = SPINNER_CLASS;
    spinner.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = LABEL_CLASS;
    label.textContent = LOADING_TEXT;

    badge.append(spinner, label);
    return badge;
  }

  function findTitleParagraph(card) {
    for (const p of card.querySelectorAll("p")) {
      if (p.textContent.trim().length > 0) return p;
    }
    return null;
  }

  function injectBadge(card) {
    if (card.querySelector(`.${BADGE_CLASS}`)) return;

    const title = findTitleParagraph(card);
    if (!title) return;

    const titleWrapper = title.parentElement;
    if (!titleWrapper || titleWrapper === card) return;

    titleWrapper.insertAdjacentElement("afterend", createBadge());
  }

  function scan() {
    document.querySelectorAll(CARD_SELECTOR).forEach(injectBadge);
  }

  let scanTimer = null;

  function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, SCAN_DEBOUNCE_MS);
  }

  function start() {
    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  start();
})();
