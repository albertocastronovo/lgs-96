((root, factory) => {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsSalaryFilter = api;
  }
})(typeof globalThis === "undefined" ? self : globalThis, () => {
  const SETTING_KEY = "lgs96:salaryFilter";
  const MAX_TARGET = 20000000;
  const DEFAULT_TOLERANCE = 10;
  const MAX_TOLERANCE = 50;

  const DEFAULT_FILTER = {
    enabled: false,
    target: null,
    tolerance: DEFAULT_TOLERANCE,
  };

  function storage() {
    const chromeApi = typeof chrome === "undefined" ? null : chrome;
    return chromeApi && chromeApi.storage && chromeApi.storage.local
      ? chromeApi.storage.local
      : null;
  }

  // Accepts numbers or user-typed strings ("35000", "35k", "35 000", "35.5k").
  // Returns a rounded positive integer annual amount, or null for empty/invalid.
  function parseTargetInput(value) {
    if (value === null || value === undefined) return null;
    let text = String(value).trim().toLowerCase();
    if (!text) return null;
    text = text.replace(/[\s\u00a0\u202f\u2007\u2009]/g, "");
    let multiplier = 1;
    if (text.endsWith("k")) {
      multiplier = 1000;
      text = text.slice(0, -1).replace(",", ".");
      if (!/^\d+(\.\d+)?$/.test(text)) return null;
    } else {
      text = text.replace(/[._',]/g, "");
      if (!/^\d+$/.test(text)) return null;
    }
    const amount = Math.round(Number.parseFloat(text) * multiplier);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TARGET)
      return null;
    return amount;
  }

  // Tolerance is a percentage (0-50) describing how far below the preferred
  // salary an offer's lower bound may fall and still count as a match.
  // Missing/invalid input falls back to the default.
  function parseToleranceInput(value) {
    if (value === null || value === undefined || String(value).trim() === "")
      return DEFAULT_TOLERANCE;
    const parsed = Number.parseFloat(String(value).replace(",", "."));
    if (!Number.isFinite(parsed)) return DEFAULT_TOLERANCE;
    const rounded = Math.round(parsed);
    if (rounded < 0) return 0;
    if (rounded > MAX_TOLERANCE) return MAX_TOLERANCE;
    return rounded;
  }

  function normalizeFilter(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    let target = parseTargetInput(source.target);
    if (target === null) {
      // Migrate the legacy min/max shape: the lower bound the user cared
      // about becomes the preferred salary.
      const legacyMin = parseTargetInput(source.min);
      const legacyMax = parseTargetInput(source.max);
      target = legacyMin === null ? legacyMax : legacyMin;
    }
    const tolerance = parseToleranceInput(source.tolerance);
    return {
      enabled: source.enabled === true && target !== null,
      target,
      tolerance,
    };
  }

  function isActive(filter) {
    return Boolean(filter && filter.enabled && filter.target !== null);
  }

  async function getSalaryFilter() {
    const local = storage();
    if (!local) return Object.assign({}, DEFAULT_FILTER);
    try {
      const data = await local.get(SETTING_KEY);
      return normalizeFilter(data ? data[SETTING_KEY] : null);
    } catch {
      return Object.assign({}, DEFAULT_FILTER);
    }
  }

  async function setSalaryFilter(filter) {
    const local = storage();
    if (!local) return false;
    try {
      await local.set({ [SETTING_KEY]: normalizeFilter(filter) });
      return true;
    } catch {
      return false;
    }
  }

  // Match test: a detected salary matches when its lower bound (the range
  // minimum, or the single amount) is no more than `tolerance` percent below
  // the preferred salary. E.g. target 50000 with 10% tolerance matches any
  // offer whose minimum is >= 45000.
  function matchesSalary(info, filter) {
    if (!isActive(filter)) return true;
    if (!info || info.kind === "none" || info.kind === "error") return false;
    let lower;
    if (info.kind === "single") {
      if (!Number.isFinite(info.amount)) return false;
      lower = info.amount;
    } else if (info.kind === "range") {
      if (!Number.isFinite(info.min) || !Number.isFinite(info.max))
        return false;
      lower = Math.min(info.min, info.max);
    } else {
      return false;
    }
    const threshold = filter.target * (1 - filter.tolerance / 100);
    return lower >= threshold;
  }

  return {
    SETTING_KEY,
    DEFAULT_FILTER,
    MAX_TARGET,
    DEFAULT_TOLERANCE,
    MAX_TOLERANCE,
    parseTargetInput,
    parseToleranceInput,
    normalizeFilter,
    isActive,
    getSalaryFilter,
    setSalaryFilter,
    matchesSalary,
  };
});
