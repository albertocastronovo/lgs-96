(() => {
  "use strict";

  const RESULT_CARD_SELECTOR = '[role="button"][componentkey^="job-card-component-ref-"]';
  const HOME_CARD_SELECTOR =
    '[data-testid="JobsHomeFeedModuleListCollection"] a[href*="currentJobId="]';
  const VOYAGER_CARD_SELECTOR =
    'li[data-occludable-job-id] .job-card-container[data-job-id], .scaffold-layout__list-item .job-card-container[data-job-id]';
  const BLENDED_SEARCH_CARD_SELECTOR =
    'a[href*="/jobs/search-results/"][href*="currentJobId="]';
  const BADGE_CLASS = "lgs96-badge";
  const SPINNER_CLASS = "lgs96-badge__spinner";
  const LIGHT_CLASS = "lgs96-badge__light";
  const LABEL_CLASS = "lgs96-badge__label";
  const FLAG_CLASS = "lgs96-badge__flag";

  const STATE_LOADING = "lgs96-badge--loading";
  const STATE_NONE = "lgs96-badge--none";
  const STATE_NARROW = "lgs96-badge--narrow";
  const STATE_BROAD = "lgs96-badge--broad";
  const STATE_ERROR = "lgs96-badge--error";

  const LOADING_TEXT_KEY = "badge_loading";
  const NO_SALARY_TEXT_KEY = "badge_none";
  const ERROR_TEXT_KEY = "badge_error";
  const REPORT_ACTION_KEY = "badge_report_action";
  const REPORTED_KEY = "feedback_reported";

  const PRIVACY_POLICY_URL =
    "https://github.com/albertocastronovo/lgs-96/blob/main/PRIVACY.md";
  const FLAG_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/></svg>';

  const SCAN_DEBOUNCE_MS = 150;
  const POLL_INTERVAL_MS = 500;
  const MAX_CONCURRENT_CHECKS = 1;
  const DISPATCH_JITTER_RATIO = 0.2;
  const FETCH_TIMEOUT_MS = 10000;
  const DEFAULT_BACKOFF_MS = 60000;
  const MAX_BACKOFF_MS = 300000;
  const BROAD_RANGE_FACTOR = 2;
  const QUEUED_FLAG = "lgs96Queued";
  const LGS96_DEBUG = false;

  const JOB_POSTING_ENDPOINT = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/";
  const DESCRIPTION_SELECTOR = ".show-more-less-html__markup";
  const SESSION_FETCH_BUDGET = 80;
  const MAX_CONSECUTIVE_RATE_LIMITS = 3;
  const MAX_DESCRIPTION_BYTES = 1000000;

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
  const pendingChecks = new Map();
  let activeCount = 0;
  let dispatchTimer = null;
  let scanTimer = null;
  let backoffUntil = 0;
  let dispatchBaseMs = 1600;
  let sessionFetchesUsed = 0;
  let consecutiveRateLimits = 0;
  let sessionHalted = false;
  let visibilityObserver = null;
  const visibleJobIds = new Set();
  const pendingFetchControllers = new Set();
  let localizationState = null;
  let feedbackUi = null;
  let gratitudeUi = null;

  function loc(key, params) {
    const localization = globalThis.LgsLocalization;
    if (!localization) return "";
    return localization.textFromCatalogs(
      localizationState ? localizationState.catalogs : null,
      localizationState ? localizationState.language : localization.DEFAULT_LOCALE,
      key,
      params
    );
  }

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
    badge.dataset.lgs96State = "loading";

    const spinner = document.createElement("span");
    spinner.className = SPINNER_CLASS;
    spinner.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = LABEL_CLASS;
    label.textContent = loc(LOADING_TEXT_KEY);

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
    const adapter = card.matches(VOYAGER_CARD_SELECTOR)
      ? getVoyagerAdapter(card)
      : getParagraphAdapter(card);
    if (!adapter) return;

    const existing = card.querySelector(`.${BADGE_CLASS}`);
    if (existing) {
      const existingJobId = existing.dataset.lgs96JobId || null;
      if (!adapter.jobId || existingJobId === adapter.jobId) return;
      existing.remove();
    }

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
    if (adapter.jobId) badge.dataset.lgs96JobId = adapter.jobId;
    adapter.titleWrapper.insertAdjacentElement("afterend", badge);
    observeBadgeVisibility(badge);

    if (cardMatch) {
      applySalaryInfo(badge, cardMatch.info, cardMatch.text, "card");
      saveCardSalaryCache(adapter.jobId, cardMatch.info, cardMatch.text);
      return;
    }
    attachOrEnqueueSalaryCheck(badge, adapter.jobId, defaultCurrency);
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
    document.querySelectorAll(BLENDED_SEARCH_CARD_SELECTOR).forEach((card) => candidates.add(card));
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
    pendingChecks.clear();
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

  function saveCardSalaryCache(jobId, info, displayText) {
    const cache = globalThis.LgsCache;
    if (!cache) return;
    cache.saveCachedResult(jobId, info, displayText, "card").catch(() => {});
  }

  function attachOrEnqueueSalaryCheck(badge, jobId, defaultCurrency) {
    if (jobId) {
      const pending = pendingChecks.get(jobId);
      if (pending) {
        pending.badges.add(badge);
        badge.dataset[QUEUED_FLAG] = "true";
        return;
      }
      badge.dataset[QUEUED_FLAG] = "true";
      const created = { badges: new Set([badge]), defaultCurrency, stage: "local" };
      pendingChecks.set(jobId, created);
      startLocalStage(jobId, created);
      return;
    }
    enqueueSalaryCheck(badge, jobId, defaultCurrency);
  }

  function startLocalStage(jobId, pending) {
    const cache = globalThis.LgsCache;
    if (!cache) {
      enqueueLinkedInStage(jobId, pending);
      return;
    }
    cache
      .getCachedResult(jobId)
      .then((entry) => {
        if (pendingChecks.get(jobId) !== pending) return;
        if (entry) {
          applyPendingResult(
            jobId,
            pending,
            entry.result,
            entry.displayText || undefined,
            entry.source || "local-cache"
          );
          return;
        }
        enqueueLinkedInStage(jobId, pending);
      })
      .catch(() => {
        if (pendingChecks.get(jobId) !== pending) return;
        enqueueLinkedInStage(jobId, pending);
      });
  }

  function enqueueLinkedInStage(jobId, pending) {
    if (pendingChecks.get(jobId) !== pending) return;
    pending.stage = "linkedin";
    taskQueue.push({ badge: null, jobId, defaultCurrency: pending.defaultCurrency });
    scheduleDispatch();
  }

  function applyPendingResult(jobId, pending, info, displayOverride, source) {
    const badges = [...pending.badges].filter(
      (badge) => badge.isConnected && badge.dataset.lgs96JobId === jobId
    );
    if (badges.length === 0) {
      pendingChecks.delete(jobId);
      return;
    }
    for (const badge of badges) {
      applySalaryInfo(badge, info, displayOverride, source);
    }
    pendingChecks.delete(jobId);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          resolve(error ? null : response || null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function enqueueSalaryCheck(badge, jobId, defaultCurrency) {
    if (!badge || badge.dataset[QUEUED_FLAG] === "true") return;
    badge.dataset[QUEUED_FLAG] = "true";

    const pending = jobId ? pendingChecks.get(jobId) : null;
    if (pending) {
      pending.badges.add(badge);
      return;
    }
    if (jobId) pendingChecks.set(jobId, { badges: new Set([badge]), defaultCurrency });
    taskQueue.push({ badge, jobId, defaultCurrency });
    scheduleDispatch();
  }

  function getScheduler() {
    return globalThis.LgsScheduler;
  }

  function getDispatchDelayMs() {
    const scheduler = getScheduler();
    if (scheduler) {
      return scheduler.computeDelay({
        baseMs: dispatchBaseMs,
        jitterRatio: DISPATCH_JITTER_RATIO,
        backoffUntil,
        now: Date.now(),
      });
    }
    return Math.max(0, backoffUntil - Date.now());
  }

  function observeBadgeVisibility(badge) {
    if (typeof IntersectionObserver === "undefined") return;
    if (!visibilityObserver) {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const jobId = entry.target.dataset.lgs96JobId;
            if (!jobId) continue;
            if (entry.isIntersecting) visibleJobIds.add(jobId);
            else visibleJobIds.delete(jobId);
            if (!entry.target.isConnected) visibilityObserver.unobserve(entry.target);
          }
        },
        { rootMargin: "200px 0px" }
      );
    }
    visibilityObserver.observe(badge);
  }

  function takeNextTask() {
    if (taskQueue.length === 0) return null;
    for (let i = 0; i < taskQueue.length; i++) {
      const task = taskQueue[i];
      if (task.jobId && visibleJobIds.has(task.jobId)) {
        return taskQueue.splice(i, 1)[0];
      }
    }
    return taskQueue.shift();
  }

  function scheduleDispatch() {
    if (dispatchTimer !== null) return;
    dispatchTimer = setTimeout(() => {
      dispatchTimer = null;
      dispatch();
      if (taskQueue.length > 0) scheduleDispatch();
    }, getDispatchDelayMs());
  }

  function rescheduleDispatchIfPending() {
    if (dispatchTimer === null) return;
    clearTimeout(dispatchTimer);
    dispatchTimer = null;
    scheduleDispatch();
  }

  function dispatch() {
    if (Date.now() < backoffUntil) {
      rescheduleDispatchIfPending();
      if (dispatchTimer === null && taskQueue.length > 0) scheduleDispatch();
      return;
    }
    while (activeCount < MAX_CONCURRENT_CHECKS) {
      const task = takeNextTask();
      if (!task) break;
      runTask(task);
      break;
    }
  }

  function pendingBadges(pending, task) {
    const badges = pending ? [...pending.badges] : [];
    if (task.badge) badges.push(task.badge);
    return badges.filter(
      (badge) =>
        badge.isConnected &&
        (!task.jobId || badge.dataset.lgs96JobId === task.jobId)
    );
  }

  function runTask(task) {
    const pending = task.jobId ? pendingChecks.get(task.jobId) : null;
    const badges = pendingBadges(pending, task);
    if (badges.length === 0) {
      if (task.jobId) pendingChecks.delete(task.jobId);
      if (taskQueue.length > 0) scheduleDispatch();
      return;
    }

    if (sessionHalted || sessionFetchesUsed >= SESSION_FETCH_BUDGET) {
      sessionHalted = true;
      for (const badge of badges) applyCheckError(badge);
      if (task.jobId) pendingChecks.delete(task.jobId);
      if (taskQueue.length > 0) scheduleDispatch();
      return;
    }

    activeCount++;
    sessionFetchesUsed++;
    checkSalaryForJob(task.jobId, task.defaultCurrency)
      .then(async (info) => {
        const cache = globalThis.LgsCache;
        if (cache) await cache.saveCachedResult(task.jobId, info, null, "description").catch(() => {});
        for (const badge of pendingBadges(pending, task)) {
          applySalaryInfo(badge, info, undefined, "description");
        }
      })
      .catch(() => {
        for (const badge of pendingBadges(pending, task)) applyCheckError(badge);
      })
      .finally(() => {
        if (task.jobId) pendingChecks.delete(task.jobId);
        activeCount--;
        if (taskQueue.length > 0) scheduleDispatch();
      });
  }

  function isValidJobId(jobId) {
    return typeof jobId === "string" && /^\d+$/.test(jobId);
  }

  function increaseBackoff(ms) {
    const until = Date.now() + ms;
    if (until > backoffUntil) {
      backoffUntil = until;
      rescheduleDispatchIfPending();
    }
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
        if (response.status === 429 || response.status === 999) {
          consecutiveRateLimits++;
          if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) sessionHalted = true;
          const scheduler = getScheduler();
          const retryAfter =
            response.status === 429 && scheduler
              ? scheduler.parseRetryAfter(response.headers.get("retry-after"))
              : Number(response.headers.get("retry-after")) * 1000;
          const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, MAX_BACKOFF_MS)
            : DEFAULT_BACKOFF_MS;
          increaseBackoff(backoffMs);
          throw new Error("rate limited");
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        consecutiveRateLimits = 0;
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          throw new Error(`unexpected content type: ${contentType}`);
        }
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_DESCRIPTION_BYTES) {
          throw new Error("description too large");
        }
        return response.text();
      })
      .then((html) => {
        if (html.length > MAX_DESCRIPTION_BYTES) {
          throw new Error("description too large");
        }
        return html;
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

  function createFlag() {
    const flag = document.createElement("span");
    flag.className = FLAG_CLASS;
    flag.setAttribute("role", "button");
    flag.setAttribute("tabindex", "0");
    flag.setAttribute("aria-label", loc(REPORT_ACTION_KEY));
    flag.innerHTML = FLAG_SVG;
    flag.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFeedbackDialog(flag);
    });
    flag.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      openFeedbackDialog(flag);
    });
    return flag;
  }

  function swapSpinnerForLight(badge) {
    const spinner = badge.querySelector(`.${SPINNER_CLASS}`);
    if (spinner) spinner.replaceWith(createLight());
    if (!badge.querySelector(`.${FLAG_CLASS}`)) {
      const flag = createFlag();
      const label = badge.querySelector(`.${LABEL_CLASS}`);
      if (label) badge.insertBefore(flag, label);
      else badge.appendChild(flag);
    }
  }

  function setBadgeText(badge, text) {
    const label = badge.querySelector(`.${LABEL_CLASS}`);
    if (label) label.textContent = text;
  }

  function applySalaryInfo(badge, info, displayOverride, source) {
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
      labelText = loc(NO_SALARY_TEXT_KEY);
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
    badge.dataset.lgs96Source = source || "unknown";
    badge.dataset.lgs96Info =
      info && info.kind !== "none" ? JSON.stringify(info) : "";

    swapSpinnerForLight(badge);
    setBadgeText(badge, labelText);
  }

  function applyCheckError(badge) {
    if (!badge.isConnected) return;

    badge.classList.remove(STATE_LOADING);
    badge.classList.add(STATE_ERROR);
    badge.dataset.lgs96State = "error";
    badge.dataset.lgs96Source = "error";
    badge.dataset.lgs96Info = "";

    swapSpinnerForLight(badge);
    setBadgeText(badge, loc(ERROR_TEXT_KEY));
  }

  function extensionVersion() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
        return String(chrome.runtime.getManifest().version || "");
      }
    } catch (error) {
      /* manifest unavailable */
    }
    return "";
  }

  function currentLanguage() {
    return localizationState ? localizationState.language : "en";
  }

  function readDetectedFromBadge(badge) {
    const state = badge.dataset.lgs96State;
    let kind = "none";
    if (state === "error") {
      kind = "error";
    } else if (state && state !== "none" && state !== "loading") {
      try {
        kind = JSON.parse(badge.dataset.lgs96Info || "{}").kind || "single";
      } catch (error) {
        kind = "single";
      }
    }
    const label = badge.querySelector(`.${LABEL_CLASS}`);
    return {
      kind,
      value: label ? label.textContent.trim() : "",
      source: badge.dataset.lgs96Source || "unknown",
    };
  }

  function reportFocusables() {
    return [
      feedbackUi.select,
      feedbackUi.textarea,
      feedbackUi.privacyLink,
      feedbackUi.cancelButton,
      feedbackUi.submitButton,
    ].filter((element) => element && !element.closest("[hidden]"));
  }

  function gratitudeFocusables() {
    return [gratitudeUi.closeButton];
  }

  function ensureFeedbackUi() {
    if (feedbackUi) return feedbackUi;

    const backdrop = document.createElement("div");
    backdrop.className = "lgs96-feedback-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeFeedbackDialog();
    });

    const dialog = document.createElement("div");
    dialog.className = "lgs96-feedback";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.className = "lgs96-feedback__title";

    const description = document.createElement("p");
    description.className = "lgs96-feedback__description";

    const formView = document.createElement("div");
    formView.className = "lgs96-feedback__form";

    const typeLabel = document.createElement("label");
    typeLabel.className = "lgs96-feedback__label";

    const typeLabelText = document.createElement("span");
    typeLabelText.className = "lgs96-feedback__label-text";

    const select = document.createElement("select");
    select.className = "lgs96-feedback__select";
    for (const value of ["none", "single", "range"]) {
      const option = document.createElement("option");
      option.value = value;
      select.appendChild(option);
    }
    typeLabel.append(typeLabelText, select);

    const correctionField = document.createElement("div");
    correctionField.className = "lgs96-feedback__correction";

    const correctionLabel = document.createElement("label");
    correctionLabel.className = "lgs96-feedback__label";

    const textarea = document.createElement("textarea");
    textarea.className = "lgs96-feedback__textarea";
    textarea.maxLength = 50;
    textarea.rows = 2;
    textarea.addEventListener("input", updateCorrectionCounter);

    const counter = document.createElement("span");
    counter.className = "lgs96-feedback__counter";

    correctionField.append(correctionLabel, textarea, counter);

    const disclosure = document.createElement("p");
    disclosure.className = "lgs96-feedback__disclosure";

    const disclosureText = document.createElement("span");
    const privacyLink = document.createElement("a");
    privacyLink.href = PRIVACY_POLICY_URL;
    privacyLink.target = "_blank";
    privacyLink.rel = "noopener noreferrer";
    disclosure.append(disclosureText, " ", privacyLink);

    const errorLine = document.createElement("p");
    errorLine.className = "lgs96-feedback__error";
    errorLine.setAttribute("role", "alert");

    const buttonsRow = document.createElement("div");
    buttonsRow.className = "lgs96-feedback__buttons";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "lgs96-feedback__button lgs96-feedback__button--secondary";

    const submitButton = document.createElement("button");
    submitButton.type = "button";
    submitButton.className = "lgs96-feedback__button lgs96-feedback__button--primary";

    buttonsRow.append(cancelButton, submitButton);
    formView.append(
      typeLabel,
      correctionField,
      disclosure,
      errorLine,
      buttonsRow
    );

    dialog.append(title, description, formView);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    select.addEventListener("change", () => {
      updateCorrectionVisibility();
      updateCorrectionCounter();
    });
    cancelButton.addEventListener("click", () => closeFeedbackDialog());
    submitButton.addEventListener("click", () => submitFeedback());

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeFeedbackDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = reportFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    feedbackUi = {
      backdrop,
      dialog,
      title,
      description,
      formView,
      typeLabelText,
      select,
      correctionField,
      correctionLabel,
      textarea,
      counter,
      disclosureText,
      privacyLink,
      errorLine,
      cancelButton,
      submitButton,
      lastFocus: null,
      badge: null,
      flag: null,
      jobId: null,
      detected: null,
      submitting: false,
    };
    return feedbackUi;
  }

  function ensureGratitudeUi() {
    if (gratitudeUi) return gratitudeUi;

    const backdrop = document.createElement("div");
    backdrop.className = "lgs96-feedback-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeGratitudeDialog();
    });

    const dialog = document.createElement("div");
    dialog.className = "lgs96-feedback lgs96-feedback--gratitude";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.className = "lgs96-feedback__title";

    const message = document.createElement("p");
    message.className = "lgs96-feedback__description";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "lgs96-feedback__button lgs96-feedback__button--primary";

    const buttonsRow = document.createElement("div");
    buttonsRow.className = "lgs96-feedback__buttons";
    buttonsRow.appendChild(closeButton);

    dialog.append(title, message, buttonsRow);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    closeButton.addEventListener("click", () => closeGratitudeDialog());

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeGratitudeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = gratitudeFocusables();
      if (focusables.length === 0) return;
      event.preventDefault();
      focusables[0].focus();
    });

    gratitudeUi = { backdrop, dialog, title, message, closeButton, lastFocus: null };
    return gratitudeUi;
  }

  function updateCorrectionVisibility() {
    if (!feedbackUi) return;
    const hidden = feedbackUi.select.value === "none";
    feedbackUi.correctionField.hidden = hidden;
    if (hidden) feedbackUi.textarea.value = "";
  }

  function updateCorrectionCounter() {
    if (!feedbackUi) return;
    feedbackUi.counter.textContent = loc("feedback_char_count", {
      count: feedbackUi.textarea.value.length,
    });
  }

  function openFeedbackDialog(flag) {
    const badge = flag.closest(`.${BADGE_CLASS}`);
    if (!badge) return;
    if (badge.dataset.lgs96Reported === "true") return;
    const jobId = badge.dataset.lgs96JobId || null;
    if (!jobId) return;
    if (feedbackUi && !feedbackUi.backdrop.hidden) closeFeedbackDialog();

    const ui = ensureFeedbackUi();
    ui.lastFocus = flag;
    ui.badge = badge;
    ui.flag = flag;
    ui.jobId = jobId;
    ui.detected = readDetectedFromBadge(badge);

    ui.title.textContent = loc("feedback_title");
    ui.description.textContent = loc("feedback_description", { jobId });
    ui.typeLabelText.textContent = loc("feedback_expected_label");
    const options = ui.select.options;
    options[0].textContent = loc("feedback_expected_none");
    options[1].textContent = loc("feedback_expected_single");
    options[2].textContent = loc("feedback_expected_range");
    ui.correctionLabel.textContent = loc("feedback_correction_label");
    ui.textarea.placeholder = loc("feedback_correction_placeholder");
    ui.disclosureText.textContent = loc("feedback_disclosure");
    ui.privacyLink.textContent = loc("feedback_privacy_link");
    ui.cancelButton.textContent = loc("feedback_cancel");
    ui.submitButton.textContent = loc("feedback_submit");

    ui.select.value = "none";
    ui.textarea.value = "";
    ui.errorLine.textContent = "";
    ui.formView.hidden = false;
    ui.submitting = false;
    ui.submitButton.disabled = false;
    ui.cancelButton.disabled = false;
    updateCorrectionVisibility();
    updateCorrectionCounter();

    ui.backdrop.hidden = false;
    ui.select.focus();
  }

  function closeFeedbackDialog() {
    if (!feedbackUi || feedbackUi.backdrop.hidden) return;
    feedbackUi.backdrop.hidden = true;
    const target = feedbackUi.lastFocus;
    feedbackUi.lastFocus = null;
    feedbackUi.badge = null;
    feedbackUi.flag = null;
    if (target && target.isConnected) target.focus();
  }

  async function submitFeedback() {
    const ui = feedbackUi;
    if (!ui || ui.submitting || ui.backdrop.hidden) return;
    const expectedType = ui.select.value;
    const expectedValue = expectedType === "none" ? "" : ui.textarea.value.trim();
    if (expectedType !== "none" && expectedValue.length === 0) {
      ui.errorLine.textContent = loc("feedback_correction_required");
      return;
    }

    ui.submitting = true;
    ui.submitButton.disabled = true;
    ui.cancelButton.disabled = true;
    ui.submitButton.textContent = loc("feedback_submitting");
    ui.errorLine.textContent = "";

    const feedback = globalThis.LgsFeedback;
    const response = await sendRuntimeMessage({
      type: feedback ? feedback.MSG_TYPE : "lgs96:feedbackSubmit",
      payload: {
        job_id: ui.jobId,
        expected_type: expectedType,
        expected_value: expectedValue,
        detected_kind: ui.detected.kind,
        detected_value: ui.detected.value,
        detected_source: ui.detected.source,
        language: currentLanguage(),
        extension_version: extensionVersion(),
      },
    });

    ui.submitting = false;
    ui.submitButton.disabled = false;
    ui.cancelButton.disabled = false;
    ui.submitButton.textContent = loc("feedback_submit");

    if (response && response.ok) {
      const flag = ui.flag;
      if (flag) {
        flag.dataset.reported = "true";
        flag.setAttribute("aria-label", loc(REPORTED_KEY));
      }
      if (ui.badge) ui.badge.dataset.lgs96Reported = "true";
      closeFeedbackDialog();
      openGratitudeDialog(flag);
    } else {
      ui.errorLine.textContent = loc("feedback_error");
    }
  }

  function openGratitudeDialog(flag) {
    const ui = ensureGratitudeUi();
    ui.lastFocus = flag || null;
    ui.title.textContent = loc("feedback_thanks_title");
    ui.message.textContent = loc("feedback_thanks");
    ui.closeButton.textContent = loc("feedback_close");
    ui.backdrop.hidden = false;
    ui.closeButton.focus();
  }

  function closeGratitudeDialog() {
    if (!gratitudeUi || gratitudeUi.backdrop.hidden) return;
    gratitudeUi.backdrop.hidden = true;
    const target = gratitudeUi.lastFocus;
    gratitudeUi.lastFocus = null;
    if (target && target.isConnected) target.focus();
  }

  function fetchLocalizationState() {
    const localization = globalThis.LgsLocalization;
    if (!localization) return Promise.resolve(null);
    return sendRuntimeMessage({ type: localization.MSG_TYPE }).then((response) => {
      if (response && response.ok && response.catalogs) {
        return { catalogs: response.catalogs, language: response.language };
      }
      return null;
    });
  }

  function relabelBadges() {
    const stateKeys = {
      loading: LOADING_TEXT_KEY,
      none: NO_SALARY_TEXT_KEY,
      error: ERROR_TEXT_KEY,
    };
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => {
      const key = stateKeys[badge.dataset.lgs96State];
      if (key) setBadgeText(badge, loc(key));
      const flag = badge.querySelector(`.${FLAG_CLASS}`);
      if (flag) {
        flag.setAttribute(
          "aria-label",
          loc(flag.dataset.reported === "true" ? REPORTED_KEY : REPORT_ACTION_KEY)
        );
      }
    });
  }

  function watchLanguageChanges() {
    const localization = globalThis.LgsLocalization;
    if (
      !localization ||
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.onChanged
    ) {
      return;
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[localization.SETTING_KEY]) return;
      fetchLocalizationState()
        .then((state) => {
          if (state) localizationState = state;
          relabelBadges();
        })
        .catch(() => {});
    });
  }

  function loadDispatchInterval() {
    const scheduler = getScheduler();
    if (!scheduler) return Promise.resolve();
    return scheduler
      .getRequestIntervalMs()
      .then((intervalMs) => {
        if (Number.isFinite(intervalMs) && intervalMs > 0) dispatchBaseMs = intervalMs;
      })
      .catch(() => {});
  }

  function watchFrequencyChanges() {
    const scheduler = getScheduler();
    if (
      !scheduler ||
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.onChanged
    ) {
      return;
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[scheduler.SETTING_KEY]) return;
      loadDispatchInterval();
    });
  }

  function bootstrap() {
    fetchLocalizationState()
      .then((state) => {
        if (state) localizationState = state;
      })
      .catch(() => {})
      .then(() => loadDispatchInterval())
      .then(() => {
        start();
        watchLanguageChanges();
        watchFrequencyChanges();
      });
  }

  bootstrap();
})();
