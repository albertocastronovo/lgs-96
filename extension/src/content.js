(() => {
  "use strict";

  const RESULT_CARD_SELECTOR = '[role="button"][componentkey^="job-card-component-ref-"]';
  const HOME_CARD_SELECTOR =
    '[data-testid="JobsHomeFeedModuleListCollection"] a[href*="currentJobId="]';
  const VOYAGER_CARD_SELECTOR =
    'li[data-occludable-job-id] .job-card-container[data-job-id], .scaffold-layout__list-item .job-card-container[data-job-id]';
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
  const POLL_INTERVAL_MS = 500;
  const MAX_CONCURRENT_CHECKS = 1;
  const BASE_DISPATCH_DELAY_MS = 3000;
  const DISPATCH_JITTER_RATIO = 0.2;
  const FETCH_TIMEOUT_MS = 10000;
  const DEFAULT_BACKOFF_MS = 60000;
  const MAX_BACKOFF_MS = 300000;
  const BROAD_RANGE_FACTOR = 2;
  const QUEUED_FLAG = "lgs96Queued";
  const LGS96_DEBUG = false;

  const JOB_POSTING_ENDPOINT = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/";
  const DESCRIPTION_SELECTOR = ".show-more-less-html__markup";

  const BLOCK_TAGS = new Set([
    "P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6",
    "TABLE", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER",
  ]);

  const SEPARATOR_FIELD_RE = /^[·•.|\s\-\u2010-\u2015\u2212]+$/;

  let active = false;
  let lastPathname = null;
  let observer = null;
  let pollTimer = null;

  const taskQueue = [];
  let activeCount = 0;
  let dispatchTimer = null;
  let scanTimer = null;
  let backoffUntil = 0;
  const pendingFetchControllers = new Set();

  function getRoutes() {
    return globalThis.LgsRoutes;
  }

  function isSupportedRoute() {
    const routes = getRoutes();
    return Boolean(routes && routes.isSupportedJobsList(location.pathname));
  }

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
      if (p.closest(`.${BADGE_CLASS}`)) continue;
      if (p.textContent.trim().length > 0) return p;
    }
    return null;
  }

  function getJobId(card) {
    const key = card.getAttribute("componentkey") || "";
    if (key.startsWith("job-card-component-ref-")) {
      return key.slice("job-card-component-ref-".length) || null;
    }
    const href = card.getAttribute("href");
    const routes = getRoutes();
    if (href && routes) return routes.extractJobIdFromHref(href, location.href);
    return null;
  }

  function getCardTextFields(card) {
    const fields = [];
    for (const p of card.querySelectorAll("p")) {
      if (p.closest(`.${BADGE_CLASS}`)) continue;
      const text = p.textContent.replace(/\s+/g, " ").trim();
      if (text) fields.push(text);
    }
    return fields;
  }

  function getCardMetadata(fields) {
    const meaningful = fields.filter((field) => !SEPARATOR_FIELD_RE.test(field));
    return { locationText: meaningful[2] || "" };
  }

  function getParagraphAdapter(card) {
    const title = findTitleParagraph(card);
    if (!title) return null;
    const titleWrapper = title.parentElement;
    if (!titleWrapper || titleWrapper === card) return null;
    const fields = getCardTextFields(card);
    if (fields.length < 2) return null;
    const { locationText } = getCardMetadata(fields);
    return { jobId: getJobId(card), titleWrapper, fields, locationText };
  }

  function getVoyagerLocationText(card, titleLink) {
    for (const li of card.querySelectorAll("li")) {
      if (li === card || li.contains(titleLink)) continue;
      const text = li.textContent.replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    return "";
  }

  function getVoyagerFields(card) {
    const fields = [];
    const elements = [];
    for (const element of card.querySelectorAll("p, span, li, h3, h2")) {
      if (element.closest(`.${BADGE_CLASS}`)) continue;
      if (element.closest("button")) continue;
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (!text || text.length > 80) continue;
      if (elements.some((previous) => previous.contains(element))) continue;
      elements.push(element);
      fields.push(text);
    }
    return fields;
  }

  function getCompactMetadataFields(card, selector) {
    const fields = [];
    for (const element of card.querySelectorAll(selector)) {
      if (element.closest(`.${BADGE_CLASS}`)) continue;
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (text) fields.push(text);
    }
    return fields;
  }

  function getVoyagerAdapter(card) {
    if (!card.matches(VOYAGER_CARD_SELECTOR)) return null;

    const jobId = (card.getAttribute("data-job-id") || "").trim();
    if (!/^\d+$/.test(jobId)) return null;

    const titleLink = card.querySelector('.job-card-list__title--link[href*="/jobs/view/"]');
    if (!titleLink) return null;

    const routes = getRoutes();
    const titleLinkId = routes
      ? routes.extractJobIdFromHref(titleLink.getAttribute("href"), location.href)
      : null;
    if (titleLinkId && titleLinkId !== jobId) return null;

    const titleWrapper = titleLink.closest(".artdeco-entity-lockup__title") || titleLink;
    if (!titleWrapper) return null;

    const locationText =
      getFirstText(card, ".artdeco-entity-lockup__caption li") ||
      getVoyagerLocationText(card, titleLink);
    const fields = [
      ...getCompactMetadataFields(card, ".artdeco-entity-lockup__metadata li"),
      ...getVoyagerFields(card),
    ];
    if (fields.length < 2) return null;

    return { jobId, titleWrapper, fields, locationText };
  }

  function getFirstText(card, selector) {
    for (const element of card.querySelectorAll(selector)) {
      if (element.closest(`.${BADGE_CLASS}`)) continue;
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    return "";
  }

  function resolveDefaultCurrency(locationText) {
    const parser = globalThis.SalaryParser;
    if (parser) {
      const inferred = parser.inferCurrencyFromLocation(locationText);
      if (inferred) return inferred;
    }
    const lang = (document.documentElement.lang || "").toLowerCase();
    if (lang.startsWith("it")) return "EUR";
    return "USD";
  }

  function injectBadge(card) {
    if (card.querySelector(`.${BADGE_CLASS}`)) return;

    const adapter = card.matches(VOYAGER_CARD_SELECTOR)
      ? getVoyagerAdapter(card)
      : getParagraphAdapter(card);
    if (!adapter) return;

    const defaultCurrency = resolveDefaultCurrency(adapter.locationText);

    let cardMatch = null;
    const parser = globalThis.SalaryParser;
    if (parser) {
      for (const field of adapter.fields) {
        const parsed = parser.parseCardSalaryText(field, { defaultCurrency });
        if (parsed) {
          cardMatch = parsed;
          break;
        }
      }
    }

    const badge = createBadge();
    adapter.titleWrapper.insertAdjacentElement("afterend", badge);

    if (cardMatch) {
      applySalaryInfo(badge, cardMatch.info, cardMatch.text);
      return;
    }
    enqueueSalaryCheck(badge, adapter.jobId, defaultCurrency);
  }

  function safeInjectBadge(card) {
    try {
      injectBadge(card);
    } catch (error) {
      if (LGS96_DEBUG) console.debug("[LGS-96] inject failed", card, error);
    }
  }

  function collectCandidates() {
    const candidates = new Set();
    document.querySelectorAll(RESULT_CARD_SELECTOR).forEach((card) => candidates.add(card));
    document.querySelectorAll(HOME_CARD_SELECTOR).forEach((card) => candidates.add(card));
    document.querySelectorAll(VOYAGER_CARD_SELECTOR).forEach((card) => candidates.add(card));
    return candidates;
  }

  function scan() {
    if (!active) return;
    const candidates = collectCandidates();
    candidates.forEach(safeInjectBadge);
    if (LGS96_DEBUG) {
      const badges = document.querySelectorAll(`.${BADGE_CLASS}`).length;
      console.debug(`[LGS-96] scan: ${candidates.size} candidates, ${badges} badges`);
    }
  }

  function scheduleScan() {
    if (!active) return;
    if (scanTimer !== null) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, SCAN_DEBOUNCE_MS);
  }

  function clearRouteWork(removeAllBadges) {
    taskQueue.length = 0;
    if (scanTimer !== null) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    if (dispatchTimer !== null) {
      clearTimeout(dispatchTimer);
      dispatchTimer = null;
    }
    for (const controller of pendingFetchControllers) controller.abort();
    pendingFetchControllers.clear();
    const selector = removeAllBadges ? `.${BADGE_CLASS}` : `.${BADGE_CLASS}.${STATE_LOADING}`;
    document.querySelectorAll(selector).forEach((badge) => badge.remove());
  }

  function reconcileRoute() {
    const pathname = location.pathname;
    if (pathname === lastPathname) return;
    const supported = isSupportedRoute();
    if (!supported) {
      if (active) clearRouteWork(true);
      active = false;
      lastPathname = pathname;
      return;
    }
    if (active) clearRouteWork(false);
    active = true;
    lastPathname = pathname;
    scheduleScan();
  }

  function onDomChanged() {
    reconcileRoute();
    scheduleScan();
  }

  function onPollTick() {
    reconcileRoute();
    scheduleScan();
  }

  function start() {
    reconcileRoute();
    observer = new MutationObserver(onDomChanged);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", reconcileRoute);
    window.addEventListener("hashchange", reconcileRoute);
    pollTimer = setInterval(onPollTick, POLL_INTERVAL_MS);
  }

  function enqueueSalaryCheck(badge, jobId, defaultCurrency) {
    if (!badge || badge.dataset[QUEUED_FLAG] === "true") return;
    badge.dataset[QUEUED_FLAG] = "true";
    taskQueue.push({ badge, jobId, defaultCurrency });
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
    checkSalaryForJob(task.jobId, task.defaultCurrency)
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
    pendingFetchControllers.add(controller);
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
      .finally(() => {
        pendingFetchControllers.delete(controller);
        clearTimeout(timeoutId);
      });
  }

  function findSalaryInfo(descriptionText, options) {
    const parser = globalThis.SalaryParser;
    if (!parser) throw new Error("salary parser unavailable");
    return parser.findSalaryInfo(descriptionText, options);
  }

  function checkSalaryForJob(jobId, defaultCurrency) {
    return fetchJobDescription(jobId).then((descriptionText) =>
      findSalaryInfo(descriptionText, { defaultCurrency, allowBareRange: true })
    );
  }

  function swapSpinnerForLight(badge) {
    const spinner = badge.querySelector(`.${SPINNER_CLASS}`);
    if (spinner) spinner.replaceWith(createLight());
  }

  function setBadgeText(badge, text) {
    const label = badge.querySelector(`.${LABEL_CLASS}`);
    if (label) label.textContent = text;
  }

  function applySalaryInfo(badge, info, displayOverride) {
    if (!badge.isConnected) return;

    const parser = globalThis.SalaryParser;
    let text = "";
    if (info && info.kind !== "none") {
      text = displayOverride || (parser ? parser.formatSalary(info) : "");
    }

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
