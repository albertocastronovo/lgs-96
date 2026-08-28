(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SalaryParser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const MIN_ANNUAL_AMOUNT = 5000;
  const MAX_ANNUAL_AMOUNT = 20000000;

  const CUR_SRC = "(?:€|\\$|£|\\b(?:EURO|EUR|USD|GBP)\\b)";
  const NUM_SRC =
    "(?:\\d{1,3}(?:[.,]\\d{1,2})?\\s*[kK]|\\d{1,3}(?:[.,\u00A0]\\d{3})+|\\d{4,7}|\\d{1,3}[.,]\\d{1,2})";
  const SEP_SRC = "\\s*-{1,2}\\s*|\\s+(?:to|and|e|ed|a|ad|al|ai|alle|allo)\\s+";

  const PERIOD_EXCLUDE_RE =
    /(?:mensil|al mese|per mese|monthly|a month|\/month|settimanal|per settimana|weekly|a week|\/week|orari[oa]|all'ora|all’ora|per ora|hourly|an hour|\/hour|\/hr|al giorno|per giorno|a day|daily|\/day)/i;

  const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£" };

  function normalizeText(text) {
    return String(text)
      .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043]/g, "-");
  }

  function mapCurrency(raw) {
    const c = String(raw).trim().toUpperCase();
    if (c === "€" || c === "EUR" || c === "EURO") return "EUR";
    if (c === "$" || c === "USD") return "USD";
    if (c === "£" || c === "GBP") return "GBP";
    return null;
  }

  function parseNum(numRaw) {
    const raw = numRaw.replace(/[\u00A0\s]/g, "");
    const isK = /[kK]$/.test(raw);
    const body = isK ? raw.slice(0, -1) : raw;
    let value = null;
    if (isK && /^\d{1,3}(?:[.,]\d{1,2})?$/.test(body)) {
      value = Math.round(Number.parseFloat(body.replace(",", ".")) * 1000);
    } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(body)) {
      value = Number.parseInt(body.replace(/[.,]/g, ""), 10);
    } else if (/^\d{4,7}$/.test(body)) {
      value = Number.parseInt(body, 10);
    } else if (/^\d{1,3}[.,]\d{1,2}$/.test(body)) {
      value = Number.parseFloat(body.replace(",", "."));
    }
    if (value === null || !Number.isFinite(value)) return null;
    if (value < MIN_ANNUAL_AMOUNT || value > MAX_ANNUAL_AMOUNT) return null;
    return value;
  }

  function detectBound(line, start, end) {
    const before = line.slice(0, start);
    const after = line.slice(end, end + 4);
    if (/^\s*\+/.test(after)) return "min";
    if (/(?:\bfino a|\bentro\b|\bup to\b|\bun massimo di\b|\bmassimo\b|\bmax\b|\bmeno di\b)\s*$/i.test(before)) {
      return "max";
    }
    if (/(?:\bda\b|\bdal\b|\bdai\b|\bdalle\b|\bfrom\b|\ba partire da\b|\bun minimo di\b|\bminimo\b|\bmin\b|\boltre\b)\s*$/i.test(before)) {
      return "min";
    }
    return "approx";
  }

  function collectLineFacts(line, facts) {
    if (PERIOD_EXCLUDE_RE.test(line)) return;

    const spans = [];
    const rangeRe = new RegExp(
      `(${CUR_SRC})?\\s{0,3}(${NUM_SRC})\\s{0,2}(${CUR_SRC})?` +
        `(?:${SEP_SRC})` +
        `\\s{0,3}(${CUR_SRC})?\\s{0,3}(${NUM_SRC})\\s{0,2}(${CUR_SRC})?`,
      "gi"
    );
    let m;
    while ((m = rangeRe.exec(line)) !== null) {
      const currencyGroups = [m[1], m[3], m[4], m[6]].filter(Boolean).map(mapCurrency);
      const distinct = [...new Set(currencyGroups)];
      if (currencyGroups.length === 0 || distinct.length !== 1) {
        continue;
      }
      const start = m.index;
      const end = rangeRe.lastIndex;
      spans.push([start, end]);
      const minRaw = parseNum(m[2]);
      const maxRaw = parseNum(m[5]);
      if (minRaw === null || maxRaw === null) continue;
      const lo = Math.min(minRaw, maxRaw);
      const hi = Math.max(minRaw, maxRaw);
      facts.push({ kind: "range", min: lo, max: hi, currency: distinct[0] });
    }

    const tokenRe = new RegExp(`(${CUR_SRC})?\\s{0,3}(${NUM_SRC})\\s{0,2}(${CUR_SRC})?`, "gi");
    while ((m = tokenRe.exec(line)) !== null) {
      const currencyRaw = m[1] || m[3];
      if (!currencyRaw) continue;
      const start = m.index;
      const end = tokenRe.lastIndex;
      if (spans.some(([s, e]) => start < e && end > s)) continue;
      const value = parseNum(m[2]);
      if (value === null) continue;
      facts.push({
        kind: "single",
        value,
        bound: detectBound(line, start, end),
        currency: mapCurrency(currencyRaw),
      });
    }
  }

  function findSalaryInfo(descriptionText) {
    const text = normalizeText(descriptionText);
    const facts = [];
    for (const line of text.split("\n")) {
      collectLineFacts(line.trim(), facts);
    }
    if (facts.length === 0) return { kind: "none" };

    const currencies = new Set(facts.map((f) => f.currency));
    const chosen = currencies.has("EUR")
      ? facts.filter((f) => f.currency === "EUR")
      : facts.filter((f) => f.currency === facts[0].currency);

    if (chosen.length === 1 && chosen[0].kind === "single") {
      const f = chosen[0];
      return { kind: "single", amount: f.value, bound: f.bound, currency: f.currency };
    }

    let min = Infinity;
    let max = -Infinity;
    for (const f of chosen) {
      const lo = f.kind === "range" ? f.min : f.value;
      const hi = f.kind === "range" ? f.max : f.value;
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }
    if (min === max) {
      return { kind: "single", amount: min, bound: "approx", currency: chosen[0].currency };
    }
    return { kind: "range", min, max, currency: chosen[0].currency };
  }

  function formatSalary(info) {
    if (!info || info.kind === "none") return "";
    const symbol = CURRENCY_SYMBOLS[info.currency] || "";
    if (info.kind === "single") {
      return `~${symbol}${Math.floor(info.amount / 1000)}k`;
    }
    return `${symbol}${Math.floor(info.min / 1000)}k - ${symbol}${Math.ceil(info.max / 1000)}k`;
  }

  return { findSalaryInfo, formatSalary };
});
