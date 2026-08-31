(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsCache = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const SCHEMA_VERSION = 1;
  const TTL_MS = 3 * 24 * 60 * 60 * 1000;
  const SETTING_KEY = "lgs96:cacheEnabled";
  const JOB_PREFIX = "lgs96:job:";

  function storage() {
    const chromeApi = typeof chrome !== "undefined" ? chrome : null;
    return chromeApi && chromeApi.storage && chromeApi.storage.local
      ? chromeApi.storage.local
      : null;
  }

  function jobKey(jobId) {
    return `${JOB_PREFIX}${jobId}`;
  }

  function isValidJobId(jobId) {
    return typeof jobId === "string" && /^\d+$/.test(jobId);
  }

  function isValidResult(result) {
    if (!result || typeof result !== "object") return false;
    if (result.kind === "none") return true;
    if (result.kind === "range") {
      return (
        Number.isFinite(result.min) &&
        Number.isFinite(result.max) &&
        result.min <= result.max &&
        typeof result.currency === "string"
      );
    }
    if (result.kind === "single") {
      return (
        Number.isFinite(result.amount) &&
        typeof result.bound === "string" &&
        typeof result.currency === "string"
      );
    }
    return false;
  }

  function isValidEntry(entry) {
    return Boolean(
      entry &&
        typeof entry === "object" &&
        entry.v === SCHEMA_VERSION &&
        Number.isFinite(entry.savedAt) &&
        isValidResult(entry.result) &&
        (entry.displayText === null || typeof entry.displayText === "string") &&
        (entry.source === "card" ||
          entry.source === "description" ||
          entry.source === "cloud")
    );
  }

  function isFresh(entry) {
    return Date.now() - entry.savedAt <= TTL_MS;
  }

  async function getCacheEnabled() {
    const local = storage();
    if (!local) return true;
    try {
      const data = await local.get(SETTING_KEY);
      return Boolean(!data || data[SETTING_KEY] !== false);
    } catch (error) {
      return true;
    }
  }

  async function setCacheEnabled(enabled) {
    const local = storage();
    if (!local) return;
    try {
      await local.set({ [SETTING_KEY]: Boolean(enabled) });
    } catch (error) {
      /* storage unavailable */
    }
  }

  async function getCachedResult(jobId) {
    const local = storage();
    if (!local || !isValidJobId(jobId)) return null;
    try {
      if (!(await getCacheEnabled())) return null;
      const data = await local.get(jobKey(jobId));
      const entry = data ? data[jobKey(jobId)] : null;
      if (!entry) return null;
      if (!isValidEntry(entry) || !isFresh(entry)) {
        await local.remove(jobKey(jobId));
        return null;
      }
      return entry;
    } catch (error) {
      return null;
    }
  }

  async function saveCachedResult(jobId, result, displayText, source) {
    const local = storage();
    if (!local || !isValidJobId(jobId) || !isValidResult(result)) return false;
    try {
      if (!(await getCacheEnabled())) return false;
      const entry = {
        v: SCHEMA_VERSION,
        savedAt: Date.now(),
        result,
        displayText: typeof displayText === "string" && displayText ? displayText : null,
        source:
          source === "card" ? "card" : source === "cloud" ? "cloud" : "description",
      };
      await local.set({ [jobKey(jobId)]: entry });
      return true;
    } catch (error) {
      return false;
    }
  }

  async function clearCache() {
    const local = storage();
    if (!local) return 0;
    try {
      const all = await local.get(null);
      const keys = Object.keys(all || {}).filter((key) => key.startsWith(JOB_PREFIX));
      if (keys.length > 0) await local.remove(keys);
      return keys.length;
    } catch (error) {
      return 0;
    }
  }

  async function getCacheSize() {
    const local = storage();
    if (!local) return 0;
    try {
      const all = await local.get(null);
      return Object.entries(all || {}).filter(
        ([key, entry]) => key.startsWith(JOB_PREFIX) && isValidEntry(entry) && isFresh(entry)
      ).length;
    } catch (error) {
      return 0;
    }
  }

  return {
    SCHEMA_VERSION,
    TTL_MS,
    SETTING_KEY,
    JOB_PREFIX,
    getCacheEnabled,
    setCacheEnabled,
    getCachedResult,
    saveCachedResult,
    clearCache,
    getCacheSize,
  };
});
