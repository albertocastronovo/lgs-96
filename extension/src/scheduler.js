(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsScheduler = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  function computeDelay(options) {
    const opts = options || {};
    const baseMs = Number.isFinite(opts.baseMs) ? Math.max(0, opts.baseMs) : 0;
    const jitterRatio = Number.isFinite(opts.jitterRatio)
      ? Math.max(0, opts.jitterRatio)
      : 0;
    const backoffUntil = Number.isFinite(opts.backoffUntil) ? opts.backoffUntil : 0;
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const random = Number.isFinite(opts.random) ? Math.min(1, Math.max(0, opts.random)) : Math.random();
    const jitter = 1 + (random * 2 - 1) * jitterRatio;
    const base = baseMs * jitter;
    return Math.max(0, Math.max(base, backoffUntil - now));
  }

  function parseRetryAfter(value, now) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const seconds = Number(trimmed);
      return seconds > 0 ? seconds * 1000 : 0;
    }
    const at = Number.isFinite(now) ? now : Date.now();
    const date = Date.parse(trimmed);
    if (!Number.isFinite(date)) return null;
    return Math.max(0, date - at);
  }

  const SETTING_KEY = "lgs96:requestFrequency";
  const FREQUENCY_PRESETS = { slow: 2500, average: 1600, fast: 1000 };
  const DEFAULT_FREQUENCY = "average";
  const DEFAULT_INTERVAL_MS = FREQUENCY_PRESETS[DEFAULT_FREQUENCY];

  function storage() {
    const chromeApi = typeof chrome !== "undefined" ? chrome : null;
    return chromeApi && chromeApi.storage && chromeApi.storage.local
      ? chromeApi.storage.local
      : null;
  }

  async function getRequestFrequency() {
    const local = storage();
    if (!local) return DEFAULT_FREQUENCY;
    try {
      const data = await local.get(SETTING_KEY);
      const stored = data ? data[SETTING_KEY] : null;
      return Object.prototype.hasOwnProperty.call(FREQUENCY_PRESETS, stored)
        ? stored
        : DEFAULT_FREQUENCY;
    } catch (error) {
      return DEFAULT_FREQUENCY;
    }
  }

  async function setRequestFrequency(preset) {
    if (!Object.prototype.hasOwnProperty.call(FREQUENCY_PRESETS, preset)) return false;
    const local = storage();
    if (!local) return false;
    try {
      await local.set({ [SETTING_KEY]: preset });
      return true;
    } catch (error) {
      return false;
    }
  }

  async function getRequestIntervalMs() {
    const preset = await getRequestFrequency();
    return FREQUENCY_PRESETS[preset] || DEFAULT_INTERVAL_MS;
  }

  return {
    SETTING_KEY,
    FREQUENCY_PRESETS,
    DEFAULT_FREQUENCY,
    DEFAULT_INTERVAL_MS,
    computeDelay,
    parseRetryAfter,
    getRequestFrequency,
    setRequestFrequency,
    getRequestIntervalMs,
  };
});
