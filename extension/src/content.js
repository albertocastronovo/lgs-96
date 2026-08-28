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
  const STATE_ERROR = "lgs96-badge--error";

  const LOADING_TEXT = "Fetching salary info";
  const NO_SALARY_TEXT = "No salary info";
  const ERROR_TEXT = "Salary check failed";

  const SCAN_DEBOUNCE_MS = 150;
  const MAX_CONCURRENT_CHECKS = 1;
  const BASE_DISPATCH_DELAY_MS = 3000;
  const DISPATCH_JITTER_RATIO = 0.2;
  const FETCH_TIMEOUT_MS = 10000;
  const DEFAULT_BACKOFF_MS = 60000;
  const MAX_BACKOFF_MS = 300000;
  const BROAD_RANGE_FACTOR = 2;
  const QUEUED_FLAG = "lgs96Queued";

  const JOB_POSTING_ENDPOINT = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/";
  const DESCRIPTION_SELECTOR = ".show-more-less-html__markup";

  const BLOCK_TAGS = new Set([
    "P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6",
    "TABLE", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER",
  ]);

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
  let backoffUntil = 0;

  function enqueueSalaryCheck(badge, jobId) {
    if (!badge || badge.dataset[QUEUED_FLAG] === "true") return;
    badge.dataset[QUEUED_FLAG] = "true";
    taskQueue.push({ badge, jobId });
    scheduleDispatch();
  }

  function getDispatchDelayMs() {
    const jitter = 1 + (Math.random() * 2 - 1) * DISPATCH_JITTER_RATIO;
    const base = BASE_DISPATCH_DELAY_MS * jitter;
    return Math.max(0, Math.max(base, backoffUntil - Date.now()));
  }

  function scheduleDispatch() {
    if (dispatchTimer !== null) return;
    dispatchTimer = setTimeout(() => {
      dispatchTimer = null;
      dispatch();
      if (taskQueue.length > 0) scheduleDispatch();
    }, getDispatchDelayMs());
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
    checkSalaryForJob(task.jobId)
      .then((info) => applySalaryInfo(task.badge, info))
      .catch(() => applyCheckError(task.badge))
      .finally(() => {
        activeCount--;
        if (taskQueue.length > 0) scheduleDispatch();
      });
  }

  function isValidJobId(jobId) {
    return typeof jobId === "string" && /^\d+$/.test(jobId);
  }

  function increaseBackoff(ms) {
    const until = Date.now() + ms;
    if (until > backoffUntil) backoffUntil = until;
  }

  function extractTextFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.tagName === "BR") return "\n";
    const inner = Array.from(node.childNodes).map(extractTextFromNode).join("");
    return BLOCK_TAGS.has(node.tagName) ? `${inner}\n` : inner;
  }

  function extractDescriptionText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const container = doc.querySelector(DESCRIPTION_SELECTOR);
    if (!container) throw new Error("description container not found");
    const raw = extractTextFromNode(container);
    const text = raw
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter((line) => line.length > 0)
      .join("\n");
    if (!text) throw new Error("empty description");
    return text;
  }

  function fetchJobDescription(jobId) {
    if (!isValidJobId(jobId)) {
      return Promise.reject(new Error("invalid job id"));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    return fetch(`${JOB_POSTING_ENDPOINT}${jobId}`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS)
            : DEFAULT_BACKOFF_MS;
          increaseBackoff(backoffMs);
          throw new Error("rate limited");
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          throw new Error(`unexpected content type: ${contentType}`);
        }
        return response.text();
      })
      .then(extractDescriptionText)
      .finally(() => clearTimeout(timeoutId));
  }

  function findSalaryInfo(descriptionText) {
    const parser = globalThis.SalaryParser;
    if (!parser) throw new Error("salary parser unavailable");
    return parser.findSalaryInfo(descriptionText);
  }

  function checkSalaryForJob(jobId) {
    return fetchJobDescription(jobId).then((descriptionText) => findSalaryInfo(descriptionText));
  }

  function swapSpinnerForLight(badge) {
    const spinner = badge.querySelector(`.${SPINNER_CLASS}`);
    if (spinner) spinner.replaceWith(createLight());
  }

  function setBadgeText(badge, text) {
    const label = badge.querySelector(`.${LABEL_CLASS}`);
    if (label) label.textContent = text;
  }

  function applySalaryInfo(badge, info) {
    if (!badge.isConnected) return;

    const parser = globalThis.SalaryParser;
    const text = info && info.kind !== "none" && parser ? parser.formatSalary(info) : "";

    let stateClass;
    let stateName;
    let labelText;
    if (!text) {
      stateClass = STATE_NONE;
      stateName = "none";
      labelText = NO_SALARY_TEXT;
    } else if (info.kind === "single") {
      stateClass = STATE_BROAD;
      stateName = "open";
      labelText = text;
    } else {
      const isBroad = info.max >= info.min * BROAD_RANGE_FACTOR;
      stateClass = isBroad ? STATE_BROAD : STATE_NARROW;
      stateName = isBroad ? "broad" : "narrow";
      labelText = text;
    }

    badge.classList.remove(STATE_LOADING);
    badge.classList.add(stateClass);
    badge.dataset.lgs96State = stateName;

    swapSpinnerForLight(badge);
    setBadgeText(badge, labelText);
  }

  function applyCheckError(badge) {
    if (!badge.isConnected) return;

    badge.classList.remove(STATE_LOADING);
    badge.classList.add(STATE_ERROR);
    badge.dataset.lgs96State = "error";

    swapSpinnerForLight(badge);
    setBadgeText(badge, ERROR_TEXT);
  }

  start();
})();
