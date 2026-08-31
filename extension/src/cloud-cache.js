(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsCloudCache = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const SETTING_KEY = "lgs96:cloudCacheEnabled";
  const MSG_TYPE = "lgs96:cloudLookup";
  const CLOUD_ENDPOINT = "https://cloud-cache.invalid/v1/salaries/lookup";
  const MAX_BATCH_SIZE = 50;
  const MAX_RESPONSE_CHARS = 65536;
  const FETCH_TIMEOUT_MS = 5000;
  const MIN_ANNUAL_AMOUNT = 5000;
  const MAX_ANNUAL_AMOUNT = 20000000;

  const SUPPORTED_CURRENCIES = new Set([
    "EUR", "USD", "GBP", "PLN", "CAD", "AUD", "NZD", "CHF",
    "SEK", "NOK", "DKK", "INR", "JPY", "SGD",
  ]);

  const SINGLE_BOUNDS = new Set(["min", "max", "approx"]);

  function storage() {
    const chromeApi = typeof chrome !== "undefined" ? chrome : null;
    return chromeApi && chromeApi.storage && chromeApi.storage.local
      ? chromeApi.storage.local
      : null;
  }

  async function getCloudCacheEnabled() {
    const local = storage();
    if (!local) return false;
    try {
      const data = await local.get(SETTING_KEY);
      return Boolean(data && data[SETTING_KEY] === true);
    } catch (error) {
      return false;
    }
  }

  async function setCloudCacheEnabled(enabled) {
    const local = storage();
    if (!local) return;
    try {
      await local.set({ [SETTING_KEY]: Boolean(enabled) });
    } catch (error) {
      /* storage unavailable */
    }
  }

  function isValidJobId(jobId) {
    return typeof jobId === "string" && /^\d+$/.test(jobId);
  }

  function normalizeJobIds(jobIds) {
    if (!Array.isArray(jobIds)) return [];
    const seen = new Set();
    const out = [];
    for (const jobId of jobIds) {
      if (!isValidJobId(jobId) || seen.has(jobId)) continue;
      seen.add(jobId);
      out.push(jobId);
      if (out.length >= MAX_BATCH_SIZE) break;
    }
    return out;
  }

  function buildRequestBody(jobIds) {
    return { jobIds: normalizeJobIds(jobIds) };
  }

  function isSupportedCurrency(code) {
    return typeof code === "string" && SUPPORTED_CURRENCIES.has(code);
  }

  function isAnnualAmount(value) {
    return (
      Number.isFinite(value) &&
      value >= MIN_ANNUAL_AMOUNT &&
      value <= MAX_ANNUAL_AMOUNT
    );
  }

  function validateHit(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (value.kind === "none") return { kind: "none" };
    if (value.kind === "range") {
      if (!isAnnualAmount(value.min) || !isAnnualAmount(value.max)) return null;
      if (value.min > value.max) return null;
      if (!isSupportedCurrency(value.currency)) return null;
      return {
        kind: "range",
        min: value.min,
        max: value.max,
        currency: value.currency,
      };
    }
    if (value.kind === "single") {
      if (!isAnnualAmount(value.amount)) return null;
      if (typeof value.bound !== "string" || !SINGLE_BOUNDS.has(value.bound)) {
        return null;
      }
      if (!isSupportedCurrency(value.currency)) return null;
      return {
        kind: "single",
        amount: value.amount,
        bound: value.bound,
        currency: value.currency,
      };
    }
    return null;
  }

  function isResponseSizeOk(text) {
    return typeof text === "string" && text.length <= MAX_RESPONSE_CHARS;
  }

  function extractHits(parsed, requestedIds) {
    const hits = {};
    const misses = [];
    const ids = normalizeJobIds(requestedIds);
    const usable =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
    for (const jobId of ids) {
      let result = null;
      if (usable && Object.prototype.hasOwnProperty.call(parsed, jobId)) {
        result = validateHit(parsed[jobId]);
      }
      if (result) hits[jobId] = result;
      else misses.push(jobId);
    }
    return { hits, misses };
  }

  async function lookupSalaries(jobIds, fetchImpl, options = {}) {
    const ids = normalizeJobIds(jobIds);
    if (ids.length === 0) return { ok: true, hits: {} };
    const doFetch =
      typeof fetchImpl === "function"
        ? fetchImpl
        : typeof fetch === "function"
          ? fetch
          : null;
    if (!doFetch) return { ok: false, error: "cloud_unavailable" };
    const timeoutMs =
      Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : FETCH_TIMEOUT_MS;
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const response = await doFetch(CLOUD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(ids)),
        credentials: "omit",
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      });
      if (!response || response.ok !== true) {
        return { ok: false, error: "cloud_http_error" };
      }
      const contentType =
        response.headers && typeof response.headers.get === "function"
          ? response.headers.get("content-type") || ""
          : "";
      if (!contentType.includes("json")) {
        return { ok: false, error: "cloud_bad_content_type" };
      }
      const text = await response.text();
      if (!isResponseSizeOk(text)) {
        return { ok: false, error: "cloud_oversized" };
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return { ok: false, error: "cloud_bad_json" };
      }
      const { hits } = extractHits(parsed, ids);
      return { ok: true, hits };
    } catch (error) {
      return { ok: false, error: "cloud_lookup_failed" };
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  return {
    SETTING_KEY,
    MSG_TYPE,
    CLOUD_ENDPOINT,
    MAX_BATCH_SIZE,
    MAX_RESPONSE_CHARS,
    FETCH_TIMEOUT_MS,
    MIN_ANNUAL_AMOUNT,
    MAX_ANNUAL_AMOUNT,
    getCloudCacheEnabled,
    setCloudCacheEnabled,
    isValidJobId,
    normalizeJobIds,
    buildRequestBody,
    isSupportedCurrency,
    validateHit,
    isResponseSizeOk,
    extractHits,
    lookupSalaries,
  };
});
