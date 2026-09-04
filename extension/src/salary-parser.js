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
  const CARD_FIELD_MAX_LENGTH = 80;

  const CURRENCY_WORDS = {
    EUR: ["EUR", "EURO"],
    USD: ["USD"],
    GBP: ["GBP"],
    PLN: ["PLN"],
    CAD: ["CAD"],
    AUD: ["AUD"],
    NZD: ["NZD"],
    CHF: ["CHF"],
    SEK: ["SEK"],
    NOK: ["NOK"],
    DKK: ["DKK"],
    INR: ["INR"],
    JPY: ["JPY"],
    SGD: ["SGD"],
  };

  const CURRENCY_SYMBOLS = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    PLN: "zł",
    CAD: "CA$",
    AUD: "A$",
    NZD: "NZ$",
    INR: "₹",
    JPY: "¥",
    SGD: "S$",
  };

  const DISPLAY_PREFIX = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    PLN: "PLN ",
    CAD: "CA$",
    AUD: "A$",
    NZD: "NZ$",
    CHF: "CHF ",
    SEK: "SEK ",
    NOK: "NOK ",
    DKK: "DKK ",
    INR: "₹",
    JPY: "¥",
    SGD: "S$",
  };

  const WORD_TO_CODE = {};
  const SYMBOL_TO_CODE = {};
  for (const [code, words] of Object.entries(CURRENCY_WORDS)) {
    for (const word of words) WORD_TO_CODE[word] = code;
  }
  for (const [code, symbol] of Object.entries(CURRENCY_SYMBOLS)) {
    SYMBOL_TO_CODE[symbol] = code;
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const WORD_ALTS = Object.keys(WORD_TO_CODE)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const SYMBOL_ALTS = Object.keys(SYMBOL_TO_CODE)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");

  const CUR_SRC = `(?:${SYMBOL_ALTS}|\\b(?:${WORD_ALTS})\\b)`;
  const NUM_SRC =
    "(?:\\d{1,3}(?:[.,]\\d{1,2})?\\s*[kK]|\\d{1,3}(?:[.,\u00A0]\\d{3})+|\\d{4,7}|\\d{1,3}[.,]\\d{1,2})";
  const PT_SRC =
    "(?:\\s{0,2}/\\s{0,2}(?:yr|year|anno)|\\s+(?:a year|per year|yearly|annual|annuo|annua|anno|all['’]anno|per anno)\\b)?";
  const SEP_SRC = "\\s*-{1,2}\\s*|\\s+(?:to|and|e|ed|a|ad|al|ai|alle|allo)\\s+";

  const PERIOD_EXCLUDE_RE =
    /(?:mensil|al mese|per mese|monthly|a month|\/month|settimanal|per settimana|weekly|a week|\/week|orari[oa]|all'ora|all’ora|per ora|hourly|an hour|\/hour|\/hr|al giorno|per giorno|a day|daily|\/day)/i;

  const CONTEXT_RE = /(?:salary|retribuzi|stipendi|compens|remuneraz|\bRAL\b|\bfascia\b|\bpaga\b|\bwage|\bpay\b)/i;

  const ANYWHERE_RE =
    /(?:\banywhere\b|\bworldwide\b|\bglobal\b|\bremote\b|\bin remoto\b|\bda remoto\b|\bsmart working\b)/i;

  const CITY_RULES = [
    ["EUR", ["milan", "milano", "rome", "roma", "turin", "torino", "naples", "napoli", "bergamo", "brescia", "monza", "vimercate", "bologna", "florence", "firenze", "venice", "venezia", "verona", "padua", "padova", "trento", "genoa", "genova", "palermo", "bari", "catania", "dublin", "dublino", "madrid", "barcelona", "valencia", "seville", "paris", "parigi", "lyon", "toulouse", "berlin", "munich", "münchen", "hamburg", "frankfurt", "munster", "vienna", "wien", "amsterdam", "rotterdam", "brussels", "bruxelles", "lisbon", "lisbona", "porto", "prague", "praga", "vilnius", "riga", "tallinn", "bratislava", "ljubljana", "zagreb", "luxembourg"]],
    ["PLN", ["warsaw", "varsavia", "krakow", "cracovia", "wroclaw", "gdansk", "poznan", "lodz", "katowice"]],
    ["GBP", ["london", "londra", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "bristol"]],
    ["USD", ["new york", "nyc", "san francisco", "boston", "seattle", "austin", "chicago", "los angeles", "denver", "atlanta", "miami"]],
    ["CAD", ["toronto", "vancouver", "montreal", "montréal", "ottawa", "calgary", "edmonton", "quebec"]],
    ["AUD", ["sydney", "melbourne", "brisbane", "perth", "adelaide"]],
    ["NZD", ["auckland", "wellington", "christchurch"]],
    ["CHF", ["zurich", "zurigo", "geneva", "ginevra", "basel", "basilea", "bern", "berne", "lausanne", "lugano"]],
    ["SEK", ["stockholm", "stoccolma", "gothenburg", "goteborg", "gotemburgo", "malmo"]],
    ["NOK", ["oslo", "bergen", "stavanger", "trondheim"]],
    ["DKK", ["copenhagen", "copenaghen", "aarhus", "odense"]],
    ["INR", ["bangalore", "bengaluru", "mumbai", "bombay", "delhi", "hyderabad", "pune", "chennai", "gurgaon", "noida"]],
    ["JPY", ["tokyo", "tokio", "osaka", "kyoto"]],
    ["SGD", ["singapore"]],
  ];

  const REGION_RULES = [
    ["PLN", ["poland", "polonia"]],
    ["GBP", ["united kingdom", "regno unito", "england", "inghilterra", "scotland", "scozia", "wales", "northern ireland", "uk"]],
    ["USD", ["united states", "stati uniti", "usa", "u.s.", "america"]],
    ["CAD", ["canada", "canadà"]],
    ["AUD", ["australia"]],
    ["NZD", ["new zealand", "nuova zelanda"]],
    ["CHF", ["switzerland", "svizzera", "liechtenstein"]],
    ["SEK", ["sweden", "svezia"]],
    ["NOK", ["norway", "norvegia"]],
    ["DKK", ["denmark", "danimarca"]],
    ["INR", ["india"]],
    ["JPY", ["japan", "giappone"]],
    ["SGD", ["singapore"]],
    ["EUR", ["italy", "italia", "spain", "spagna", "france", "francia", "germany", "germania", "netherlands", "paesi bassi", "belgium", "belgio", "austria", "portugal", "ireland", "irlanda", "greece", "grecia", "finland", "finlandia", "slovakia", "slovacchia", "slovenia", "croatia", "croazia", "lithuania", "lituania", "latvia", "lettonia", "estonia", "luxembourg", "lussemburgo", "malta", "cyprus", "cipro", "europe", "europa", "eu", "european union"]],
  ];

  function compileRules(rules) {
    return rules.map(([code, aliases]) => [
      code,
      aliases.map(
        (alias) =>
          new RegExp(`(?:^|[^\\p{L}])${escapeRegExp(alias)}(?=[^\\p{L}]|$)`, "iu")
      ),
    ]);
  }

  const COMPILED_CITY_RULES = compileRules(CITY_RULES);
  const COMPILED_REGION_RULES = compileRules(REGION_RULES);

  function normalizeText(text) {
    return String(text)
      .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043]/g, "-");
  }

  function mapCurrency(raw) {
    if (!raw) return null;
    const token = String(raw).trim();
    if (SYMBOL_TO_CODE[token]) return SYMBOL_TO_CODE[token];
    return WORD_TO_CODE[token.toUpperCase()] || null;
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
    const after = line.slice(end, end + 8);
    if (/^\s*\+(?!\s*\d)/.test(after)) return "min";
    if (/(?:\bfino a|\bentro\b|\bup to\b|\bun massimo di\b|\bmassimo\b|\bmax\b|\bmeno di\b)\s*$/i.test(before)) {
      return "max";
    }
    if (/(?:\bda\b|\bdal\b|\bdai\b|\bdalle\b|\bfrom\b|\ba partire da\b|\bun minimo di\b|\bminimo\b|\bmin\b|\boltre\b)\s*$/i.test(before)) {
      return "min";
    }
    return "approx";
  }

  const SUPPLEMENTAL_MODIFIER_SRC =
    "(?:signing|sign[- ]on|performance|productivity|referral|annual|annuale|annuo|trimestrale|one[- ]time|target|discretionary|cash|firma)";

  const SUPPLEMENTAL_LABEL_SRC =
    `(?:${SUPPLEMENTAL_MODIFIER_SRC}\\s+)*(?:bonus|incentiv\\w*|premi\\w*|gratific\\w*|buoni?|superminim\\w*)`;

  const SUPPLEMENTAL_BEFORE_RE = new RegExp(
    `${SUPPLEMENTAL_LABEL_SRC}(?:\\s*(?:di|of|del|della|:))?\\s*$`,
    "i"
  );

  const SUPPLEMENTAL_AFTER_RE = new RegExp(
    "^\\s*(?:di|of|del|della|:)?\\s*" + SUPPLEMENTAL_LABEL_SRC,
    "i"
  );

  function isSupplementalAmount(line, start, end) {
    const before = line.slice(Math.max(0, start - 48), start);
    const after = line.slice(end, end + 48);
    return (
      SUPPLEMENTAL_BEFORE_RE.test(before) || SUPPLEMENTAL_AFTER_RE.test(after)
    );
  }

  function collectLineFacts(line, facts, options = {}) {
    if (PERIOD_EXCLUDE_RE.test(line)) return;

    const spans = [];
    const rangeRe = new RegExp(
      `(${CUR_SRC})?${PT_SRC}?\\s{0,3}(${NUM_SRC})\\s{0,2}(${CUR_SRC})?${PT_SRC}?` +
        `(?:${SEP_SRC})` +
        `\\s{0,3}(${CUR_SRC})?${PT_SRC}?\\s{0,3}(${NUM_SRC})\\s{0,2}(${CUR_SRC})?${PT_SRC}?`,
      "gi"
    );
    let m;
    while ((m = rangeRe.exec(line)) !== null) {
      const currencyGroups = [m[1], m[3], m[4], m[6]].filter(Boolean).map(mapCurrency);
      const distinct = [...new Set(currencyGroups)];
      let currency = distinct.length === 1 ? distinct[0] : null;
      const isBare = currencyGroups.length === 0;
      if (currency === null) {
        if (!isBare) continue;
        if (!options.allowBare || !options.defaultCurrency || !options.hasContext) continue;
        currency = options.defaultCurrency;
      }
      spans.push([m.index, rangeRe.lastIndex]);
      if (isSupplementalAmount(line, m.index, rangeRe.lastIndex)) continue;
      const minRaw = parseNum(m[2]);
      const maxRaw = parseNum(m[5]);
      if (minRaw === null || maxRaw === null) continue;
      const lo = Math.min(minRaw, maxRaw);
      const hi = Math.max(minRaw, maxRaw);
      facts.push({ kind: "range", min: lo, max: hi, currency, bare: isBare });
    }

    const tokenRe = new RegExp(
      `(${CUR_SRC})?\\s{0,3}(${NUM_SRC})\\s{0,2}(${CUR_SRC})?${PT_SRC}?`,
      "gi"
    );
    while ((m = tokenRe.exec(line)) !== null) {
      const currencyRaw = m[1] || m[3];
      let bare = false;
      let currency;
      if (currencyRaw) {
        currency = mapCurrency(currencyRaw);
      } else {
        if (!options.allowBare || !options.defaultCurrency || !options.hasContext) continue;
        bare = true;
        currency = options.defaultCurrency;
      }
      const start = m.index;
      const end = tokenRe.lastIndex;
      if (spans.some(([s, e]) => start < e && end > s)) continue;
      const value = parseNum(m[2]);
      if (value === null) continue;
      if (isSupplementalAmount(line, start, end)) continue;
      facts.push({
        kind: "single",
        value,
        bound: detectBound(line, start, end),
        currency,
        bare,
      });
    }
  }

  function aggregateFacts(facts) {
    if (facts.length === 0) return { kind: "none" };
    const explicit = facts.filter((f) => !f.bare);
    const pool = explicit.length > 0 ? explicit : facts;
    const currencies = new Set(pool.map((f) => f.currency));
    const chosen = currencies.has("EUR")
      ? pool.filter((f) => f.currency === "EUR")
      : pool.filter((f) => f.currency === pool[0].currency);
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
    if (!Number.isFinite(min)) return { kind: "none" };
    if (min === max) {
      return { kind: "single", amount: min, bound: "approx", currency: chosen[0].currency };
    }
    return { kind: "range", min, max, currency: chosen[0].currency };
  }

  function findSalaryInfo(descriptionText, options = {}) {
    const defaultCurrency = options.defaultCurrency || null;
    const allowBareRange = Boolean(options.allowBareRange) && Boolean(defaultCurrency);
    const text = normalizeText(descriptionText);
    const facts = [];
    const lines = text.split("\n").map((line) => line.trim());
    let prevHasContext = false;
    for (const line of lines) {
      if (!line) continue;
      const lineHasContext = CONTEXT_RE.test(line);
      collectLineFacts(line, facts, {
        allowBare: allowBareRange,
        defaultCurrency,
        hasContext: lineHasContext || prevHasContext,
      });
      prevHasContext = lineHasContext;
    }
    return aggregateFacts(facts);
  }

  function matchStandaloneRange(text) {
    const re = new RegExp(
      `^(?:${CUR_SRC})?\\s{0,3}(${NUM_SRC})\\s{0,2}(?:${CUR_SRC})?${PT_SRC}?` +
        `\\s*(?:${SEP_SRC})\\s*` +
        `(?:${CUR_SRC})?\\s{0,3}(${NUM_SRC})\\s{0,2}(?:${CUR_SRC})?${PT_SRC}?` +
        `\\s*(?:/\\s{0,2}(?:yr|year|anno))?\\s*(?:[·|].*)?$`,
      "i"
    );
    const m = re.exec(text);
    if (!m) return null;
    const a = parseNum(m[1]);
    const b = parseNum(m[2]);
    if (a === null || b === null) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  const COMPACT_ANNUAL_NUM_SRC = "(?:\\d{1,3}(?:[.,]\\d{1,2})?)";
  const COMPACT_ANNUAL_RE =
    /(?:\/\s{0,2}(?:yr|year|anno)|\b(?:yr|year|anno|annual|yearly|annuo|annua)\b|\ba year\b|\bper year\b|all['’]anno|\bper anno\b)/i;

  function toCompactAnnual(raw) {
    const value = Number.parseFloat(String(raw).replace(",", "."));
    if (!Number.isFinite(value) || value < 1 || value > 999) return null;
    return Math.round(value * 1000);
  }

  function matchCompactAnnual(text) {
    if (!COMPACT_ANNUAL_RE.test(text)) return null;
    const numSrc = COMPACT_ANNUAL_NUM_SRC;
    const annualSrc =
      "(?:\\s{0,2}/\\s{0,2}(?:yr|year|anno)|\\s+(?:a year|per year|yearly|annual|annuo|annua|anno|all['’]anno|per anno)\\b)";
    const tailSrc = "(?:\\s*(?:/\\s{0,2}(?:yr|year|anno))?\\s*(?:[·|].*)?)";

    const rangeRe = new RegExp(
      `^(${CUR_SRC})?\\s{0,3}(${numSrc})\\s{0,2}(${CUR_SRC})?${annualSrc}?` +
        `\\s*(?:${SEP_SRC})\\s*` +
        `(${CUR_SRC})?\\s{0,3}(${numSrc})\\s{0,2}(${CUR_SRC})?${annualSrc}?` +
        `${tailSrc}$`,
      "i"
    );
    const rangeMatch = rangeRe.exec(text);
    if (rangeMatch) {
      const currencyGroups = [
        rangeMatch[1],
        rangeMatch[3],
        rangeMatch[4],
        rangeMatch[6],
      ]
        .filter(Boolean)
        .map(mapCurrency);
      const distinct = [...new Set(currencyGroups)];
      if (distinct.length !== 1) return null;
      const a = toCompactAnnual(rangeMatch[2]);
      const b = toCompactAnnual(rangeMatch[5]);
      if (a === null || b === null) return null;
      return {
        info: { kind: "range", min: Math.min(a, b), max: Math.max(a, b), currency: distinct[0] },
      };
    }

    const singleRe = new RegExp(
      `^(${CUR_SRC})?\\s{0,3}(${numSrc})\\s{0,2}(${CUR_SRC})?${annualSrc}${tailSrc}$`,
      "i"
    );
    const singleMatch = singleRe.exec(text);
    if (singleMatch) {
      const currencyGroups = [singleMatch[1], singleMatch[3]]
        .filter(Boolean)
        .map(mapCurrency);
      const distinct = [...new Set(currencyGroups)];
      if (distinct.length !== 1) return null;
      const value = toCompactAnnual(singleMatch[2]);
      if (value === null) return null;
      return {
        info: { kind: "single", amount: value, bound: "approx", currency: distinct[0] },
      };
    }

    return null;
  }

  function parseCardSalaryText(fieldText, options = {}) {
    const defaultCurrency = options.defaultCurrency || null;
    const normalized = normalizeText(fieldText).trim();
    if (!normalized || normalized.length > CARD_FIELD_MAX_LENGTH) return null;
    if (PERIOD_EXCLUDE_RE.test(normalized)) return null;

    const facts = [];
    collectLineFacts(normalized, facts, { allowBare: false, defaultCurrency, hasContext: true });
    if (facts.length > 0) {
      const info = aggregateFacts(facts);
      if (info.kind === "none") return null;
      return { info, text: normalized };
    }

    const compact = matchCompactAnnual(normalized);
    if (compact) return { info: compact.info, text: normalized };

    if (!defaultCurrency) return null;
    const bare = matchStandaloneRange(normalized);
    if (!bare) return null;
    return {
      info: { kind: "range", min: bare.min, max: bare.max, currency: defaultCurrency },
      text: normalized,
    };
  }

  function inferCurrencyFromLocation(locationText) {
    const text = normalizeText(String(locationText || "")).toLowerCase();
    if (!text) return null;
    if (ANYWHERE_RE.test(text)) return "USD";
    for (const [code, patterns] of COMPILED_CITY_RULES) {
      if (patterns.some((re) => re.test(text))) return code;
    }
    for (const [code, patterns] of COMPILED_REGION_RULES) {
      if (patterns.some((re) => re.test(text))) return code;
    }
    return null;
  }

  function formatSalary(info) {
    if (!info || info.kind === "none") return "";
    const prefix = DISPLAY_PREFIX[info.currency] || info.currency + " ";
    if (info.kind === "single") {
      return `~${prefix}${Math.floor(info.amount / 1000)}k`;
    }
    return `${prefix}${Math.floor(info.min / 1000)}k - ${prefix}${Math.ceil(info.max / 1000)}k`;
  }

  return { findSalaryInfo, formatSalary, parseCardSalaryText, inferCurrencyFromLocation };
});
