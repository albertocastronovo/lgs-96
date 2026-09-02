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

  return { computeDelay, parseRetryAfter };
});
