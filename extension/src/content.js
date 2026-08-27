(() => {
  "use strict";

  const CARD_SELECTOR = '[role="button"][componentkey^="job-card-component-ref-"]';
  const BADGE_CLASS = "lgs96-badge";
  const SPINNER_CLASS = "lgs96-badge__spinner";
  const LIGHT_CLASS = "lgs96-badge__light";
  const LABEL_CLASS = "lgs96-badge__label";

  const STATE_LOADING = "lgs96-badge--loading";
  const STATE_NONE = "lgs96-badge--none";
  const STATE_NARROW = "lgs96-badge--narrow";
  const STATE_BROAD = "lgs96-badge--broad";

  const LOADING_TEXT = "Fetching salary info";
  const NO_SALARY_TEXT = "No salary info";

  const SCAN_DEBOUNCE_MS = 150;
  const DISPATCH_INTERVAL_MS = 500;
  const MAX_CONCURRENT_CHECKS = 2;
  const MOCK_EXECUTION_MS = 500;
  const BROAD_RANGE_FACTOR = 2;
  const QUEUED_FLAG = "lgs96Queued";

  function createBadge() {
    const badge = document.createElement("div");
    badge.className = `${BADGE_CLASS} ${STATE_LOADING}`;
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

  function createLight() {
    const light = document.createElement("span");
    light.className = LIGHT_CLASS;
    light.setAttribute("aria-hidden", "true");
    return light;
  }

  function findTitleParagraph(card) {
    for (const p of card.querySelectorAll("p")) {
      if (p.textContent.trim().length > 0) return p;
    }
    return null;
  }

  function getJobId(card) {
    const key = card.getAttribute("componentkey") || "";
    return key.replace("job-card-component-ref-", "") || null;
  }

  function injectBadge(card) {
    if (card.querySelector(`.${BADGE_CLASS}`)) return;

    const title = findTitleParagraph(card);
    if (!title) return;

    const titleWrapper = title.parentElement;
    if (!titleWrapper || titleWrapper === card) return;

    const badge = createBadge();
    titleWrapper.insertAdjacentElement("afterend", badge);
    enqueueSalaryCheck(badge, getJobId(card));
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

  const taskQueue = [];
  let activeCount = 0;
  let dispatchTimer = null;

  function enqueueSalaryCheck(badge, jobId) {
    if (!badge || badge.dataset[QUEUED_FLAG] === "true") return;
    badge.dataset[QUEUED_FLAG] = "true";
    taskQueue.push({ badge, jobId });
    scheduleDispatch();
  }

  function scheduleDispatch() {
    if (dispatchTimer !== null) return;
    dispatchTimer = setTimeout(() => {
      dispatchTimer = null;
      dispatch();
      if (taskQueue.length > 0) scheduleDispatch();
    }, DISPATCH_INTERVAL_MS);
  }

  function dispatch() {
    while (activeCount < MAX_CONCURRENT_CHECKS) {
      const task = taskQueue.shift();
      if (!task) break;
      if (!task.badge.isConnected) continue;
      runTask(task);
      break;
    }
  }

  function runTask(task) {
    activeCount++;
    mockFetchSalaryInfo(task.jobId)
      .then((info) => applySalaryInfo(task.badge, info))
      .catch(() => applySalaryInfo(task.badge, { kind: "none" }))
      .finally(() => {
        activeCount--;
        if (taskQueue.length > 0) scheduleDispatch();
      });
  }

  function mockFetchSalaryInfo(jobId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const roll = Math.random();
        if (roll < 1 / 3) {
          resolve({ kind: "none" });
        } else if (roll < 2 / 3) {
          resolve({ kind: "range", min: 35000, max: 40000 });
        } else {
          resolve({ kind: "range", min: 20000, max: 60000 });
        }
      }, MOCK_EXECUTION_MS);
    });
  }

  function formatRange(min, max) {
    return `${Math.round(min / 1000)}k - ${Math.round(max / 1000)}k`;
  }

  function applySalaryInfo(badge, info) {
    if (!badge.isConnected) return;

    const isBroad = info.kind === "range" && info.max >= info.min * BROAD_RANGE_FACTOR;
    const stateClass = info.kind === "range" ? (isBroad ? STATE_BROAD : STATE_NARROW) : STATE_NONE;
    const text = info.kind === "range" ? formatRange(info.min, info.max) : NO_SALARY_TEXT;

    badge.classList.remove(STATE_LOADING);
    badge.classList.add(stateClass);
    badge.dataset.lgs96State = info.kind === "range" ? (isBroad ? "broad" : "narrow") : "none";

    const spinner = badge.querySelector(`.${SPINNER_CLASS}`);
    if (spinner) spinner.replaceWith(createLight());

    const label = badge.querySelector(`.${LABEL_CLASS}`);
    if (label) label.textContent = text;
  }

  start();
})();
