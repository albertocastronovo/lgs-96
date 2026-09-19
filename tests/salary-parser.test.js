const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const SalaryParser = require(path.join(__dirname, "..", "extension", "src", "salary-parser.js"));
const fixtures = require(path.join(__dirname, "..", "train", "salary.json"));

function toComparable(info) {
  if (!info || info.kind === "none") return [];
  if (info.kind === "single") return [info.amount];
  return [info.min, info.max];
}

test("all salary.json fixtures produce exact expected results", () => {
  fixtures.forEach((record, index) => {
    const info = SalaryParser.findSalaryInfo(record.description, {
      defaultCurrency: "EUR",
      allowBareRange: true,
    });
    assert.deepEqual(
      toComparable(info),
      record.expected,
      `fixture ${index} failed: ${JSON.stringify(record.description.slice(0, 60))}`
    );
  });
});

test("PLN fixture keeps explicit currency", () => {
  const record = fixtures.find((r) => r.description.includes("PLN"));
  const info = SalaryParser.findSalaryInfo(record.description);
  assert.equal(info.currency, "PLN");
  assert.deepEqual(toComparable(info), record.expected);
});

test("currencyless fixture defaults to EUR for Italian context", () => {
  const record = fixtures.find((r) => r.description.includes("fixed salary range"));
  const info = SalaryParser.findSalaryInfo(record.description, {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.equal(info.currency, "EUR");
  assert.deepEqual(toComparable(info), record.expected);
});

test("currencyless fixture without defaults stays unrecognized", () => {
  const record = fixtures.find((r) => r.description.includes("fixed salary range"));
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo(record.description)), []);
});

test("bare RAL single value defaults to EUR", () => {
  const record = fixtures.find((r) => r.description.includes("incentivo produttività"));
  const info = SalaryParser.findSalaryInfo(record.description, {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.equal(info.kind, "single");
  assert.equal(info.amount, 28000);
  assert.equal(info.bound, "approx");
  assert.equal(info.currency, "EUR");
});

test("incentive amount is not treated as open-ended minimum", () => {
  const info = SalaryParser.findSalaryInfo("RAL 28.000 + 1750 incentivo produttività", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [28000]);
  assert.equal(info.bound, "approx");
});

test("signing bonus is excluded from salary aggregation", () => {
  const info = SalaryParser.findSalaryInfo(
    "Compensation Salary: $150,000–$250,000 USD $20,000 signing bonus 4 weeks vacation + country-specific holidays Fully remote"
  );
  assert.equal(info.currency, "USD");
  assert.deepEqual(toComparable(info), [150000, 250000]);
});

test("signing bonus before the salary does not pollute the range", () => {
  const info = SalaryParser.findSalaryInfo(
    "Signing bonus: $20,000. Salary: $150,000-$250,000."
  );
  assert.deepEqual(toComparable(info), [150000, 250000]);
});

test("stacked modifiers before the label are excluded", () => {
  const info = SalaryParser.findSalaryInfo(
    "Compensation Salary: $150,000–$250,000 USD $20,000 one-time signing bonus 4 weeks vacation + country-specific holidayFully remote"
  );
  assert.equal(info.currency, "USD");
  assert.deepEqual(toComparable(info), [150000, 250000]);
});

test("sign-on bonus is excluded from salary aggregation", () => {
  const info = SalaryParser.findSalaryInfo(
    "Compensation Salary: $150,000-$250,000 USD $20,000 sign-on bonus 4 weeks vacation Fully remote"
  );
  assert.deepEqual(toComparable(info), [150000, 250000]);
});

test("annual performance bonus is excluded from salary aggregation", () => {
  const info = SalaryParser.findSalaryInfo(
    "Compensation Salary: $150,000-$250,000 USD $20,000 annual performance bonus Fully remote"
  );
  assert.deepEqual(toComparable(info), [150000, 250000]);
});

test("supplemental range is excluded but the salary range survives", () => {
  const info = SalaryParser.findSalaryInfo(
    "Signing bonus: $10,000 - $15,000. Salary: $150,000-$250,000."
  );
  assert.deepEqual(toComparable(info), [150000, 250000]);
});

test("salary plus bonus clause keeps the salary value", () => {
  const info = SalaryParser.findSalaryInfo("Salary: $100,000 plus a performance bonus.");
  assert.deepEqual(toComparable(info), [100000]);
});

test("italian bonus amounts are excluded", () => {
  const info = SalaryParser.findSalaryInfo("Retribuzione: 30.000€ di bonus annuale.");
  assert.deepEqual(toComparable(info), []);
});

test("productivity incentive clause keeps the RAL value", () => {
  const info = SalaryParser.findSalaryInfo("RAL 40.000 EUR + incentivo produttività", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [40000]);
});

test("currency code glued to the amount is recognized", () => {
  const info = SalaryParser.findSalaryInfo("Italy- EUR104,500 gross annually.");
  assert.equal(info.currency, "EUR");
  assert.deepEqual(toComparable(info), [104500]);

  const usd = SalaryParser.findSalaryInfo("Base pay USD120,000 per year.");
  assert.equal(usd.currency, "USD");
  assert.deepEqual(toComparable(usd), [120000]);
});

test("currency word inside a longer word is still ignored", () => {
  const info = SalaryParser.findSalaryInfo("EUROzone 30.000 - 45.000.");
  assert.deepEqual(toComparable(info), []);
});

test("phone number with country code is not a salary", () => {
  const info = SalaryParser.findSalaryInfo(
    "You can expect a very attractive salary, bonus and full benefit package. For further information or to apply contact John Doe on +44 1234 567890 or email your CV.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), []);
});

test("leading-zero phone chain is not a salary", () => {
  const info = SalaryParser.findSalaryInfo(
    "Chiamaci allo 0118 984 0948 per informazioni sulla retribuzione.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), []);
});

test("keyword-adjacent phone number is not a salary", () => {
  const info = SalaryParser.findSalaryInfo(
    "Call 5551234 for a great salary package.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), []);
});

test("glued international phone number is not a salary", () => {
  const info = SalaryParser.findSalaryInfo(
    "Telefono +393351234567. Ottima retribuzione garantita.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), []);
});

test("real salary survives next to a phone number", () => {
  const info = SalaryParser.findSalaryInfo(
    "Salary: EUR 30,000 per year. Contact us on +44 1234 567890.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.equal(info.currency, "EUR");
  assert.deepEqual(toComparable(info), [30000]);
});

test("compact bare range still parses", () => {
  const info = SalaryParser.findSalaryInfo("salary 30000 - 45000 per year", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [30000, 45000]);
});

test("range promised before interview stays unrecognized", () => {
  const record = fixtures.find((r) => r.description.includes("verrà sempre condiviso"));
  const info = SalaryParser.findSalaryInfo(record.description, {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), []);
});

test("USD annual range", () => {
  const info = SalaryParser.findSalaryInfo("Compensation: $85,000 - $110,000 per year");
  assert.equal(info.kind, "range");
  assert.equal(info.currency, "USD");
  assert.equal(info.min, 85000);
  assert.equal(info.max, 110000);
});

test("GBP single value", () => {
  const info = SalaryParser.findSalaryInfo("Salary: £32k (depending on experience)");
  assert.deepEqual(toComparable(info), [32000]);
  assert.equal(info.currency, "GBP");
});

test("monthly amounts are rejected", () => {
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("Retribuzione: €2.800 al mese")), []);
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("Salary: 3,500 USD monthly")), []);
});

test("hourly, weekly and daily amounts are rejected", () => {
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("Pay: $25.50/hour")), []);
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("€600 per settimana")), []);
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("Rate: £180 a day")), []);
});

test("mixed currencies prefer EUR", () => {
  const info = SalaryParser.findSalaryInfo("€30.000 - €35.000; equivalent to $80,000 - $90,000");
  assert.equal(info.kind, "range");
  assert.equal(info.currency, "EUR");
  assert.deepEqual(toComparable(info), [30000, 35000]);
});

test("open-ended minimum with exact full number", () => {
  const info = SalaryParser.findSalaryInfo("Retribuzione: 45.900€ +");
  assert.equal(info.kind, "single");
  assert.equal(info.amount, 45900);
  assert.equal(info.bound, "min");
  assert.deepEqual(toComparable(info), [45900]);
});

test("open-ended maximum", () => {
  const info = SalaryParser.findSalaryInfo("up to €50.500 RAL");
  assert.equal(info.kind, "single");
  assert.equal(info.amount, 50500);
  assert.equal(info.bound, "max");
  assert.deepEqual(toComparable(info), [50500]);
});

test("k-suffixed range", () => {
  const info = SalaryParser.findSalaryInfo("€28k - €34k RAL");
  assert.deepEqual(toComparable(info), [28000, 34000]);
});

test("benefit amounts are ignored", () => {
  const info = SalaryParser.findSalaryInfo("Benefits: meal vouchers €6.50, discounts");
  assert.deepEqual(toComparable(info), []);
});

test("display formatting rounds min down and max up", () => {
  assert.equal(
    SalaryParser.formatSalary({ kind: "range", min: 29302, max: 65054, currency: "EUR" }),
    "€29k - €66k"
  );
});

test("display formatting for open-ended values floors and prefixes tilde", () => {
  assert.equal(
    SalaryParser.formatSalary({ kind: "single", amount: 45900, currency: "EUR" }),
    "~€45k"
  );
  assert.equal(
    SalaryParser.formatSalary({ kind: "single", amount: 50500, currency: "EUR" }),
    "~€50k"
  );
});

test("display formatting uses currency symbols", () => {
  assert.equal(
    SalaryParser.formatSalary({ kind: "range", min: 40000, max: 75000, currency: "USD" }),
    "$40k - $75k"
  );
  assert.equal(
    SalaryParser.formatSalary({ kind: "range", min: 30000, max: 35000, currency: "GBP" }),
    "£30k - £35k"
  );
});

test("PLN display uses code prefix", () => {
  assert.equal(
    SalaryParser.formatSalary({ kind: "range", min: 292500, max: 650000, currency: "PLN" }),
    "PLN 292k - PLN 650k"
  );
});

test("location to currency inference", () => {
  const infer = SalaryParser.inferCurrencyFromLocation;
  assert.equal(infer("Toronto, Ontario, Canada"), "CAD");
  assert.equal(infer("Warsaw, Poland"), "PLN");
  assert.equal(infer("Milano (In sede)"), "EUR");
  assert.equal(infer("Vimercate (MB)"), "EUR");
  assert.equal(infer("London, UK"), "GBP");
  assert.equal(infer("New York, NY"), "USD");
  assert.equal(infer("Zurich, Switzerland"), "CHF");
  assert.equal(infer("Anywhere"), "USD");
  assert.equal(infer("Remote"), "USD");
  assert.equal(infer("Atlantis"), null);
});

test("card native salary with LinkedIn /yr format", () => {
  const parsed = SalaryParser.parseCardSalaryText("25K €/yr - 35K €/yr", {
    defaultCurrency: "EUR",
  });
  assert.deepEqual(toComparable(parsed.info), [25000, 35000]);
  assert.equal(parsed.info.currency, "EUR");
  assert.equal(parsed.text, "25K €/yr - 35K €/yr");
});

test("compact annual card notation without K multiplier", () => {
  const parsed = SalaryParser.parseCardSalaryText("26 €/anno - 28 €/anno", {
    defaultCurrency: "EUR",
  });
  assert.deepEqual(toComparable(parsed.info), [26000, 28000]);
  assert.equal(parsed.info.currency, "EUR");
  assert.equal(parsed.text, "26 €/anno - 28 €/anno");
});

test("compact annual with NBSP and K suffix", () => {
  const parsed = SalaryParser.parseCardSalaryText("24K\u00A0€/anno - 28K\u00A0€/anno", {
    defaultCurrency: "EUR",
  });
  assert.deepEqual(toComparable(parsed.info), [24000, 28000]);
});

test("compact annual single value", () => {
  const parsed = SalaryParser.parseCardSalaryText("€30/yr", { defaultCurrency: "EUR" });
  assert.equal(parsed.info.kind, "single");
  assert.deepEqual(toComparable(parsed.info), [30000]);
});

test("compact annual requires period marker", () => {
  assert.equal(SalaryParser.parseCardSalaryText("26 - 28", { defaultCurrency: "EUR" }), null);
  assert.equal(SalaryParser.parseCardSalaryText("€26 - €28", { defaultCurrency: "EUR" }), null);
});

test("card native salary with full currency and /yr", () => {
  const parsed = SalaryParser.parseCardSalaryText("€40,000/yr - €55,000/yr", {
    defaultCurrency: "EUR",
  });
  assert.deepEqual(toComparable(parsed.info), [40000, 55000]);
});

test("card bare standalone range uses default currency", () => {
  const parsed = SalaryParser.parseCardSalaryText("30.000 - 45.000", {
    defaultCurrency: "EUR",
  });
  assert.deepEqual(toComparable(parsed.info), [30000, 45000]);
  assert.equal(parsed.info.currency, "EUR");
});

test("card metadata fields are ignored", () => {
  const fields = [
    "Pubblicata 2 settimane fa · Promosso",
    "54 ex studenti lavorano qui",
    "Hardware Test Engineer",
    "Milano (In sede)",
    "Valutazione attiva delle candidature",
    "TÜV Rheinland Europe",
  ];
  for (const field of fields) {
    assert.equal(
      SalaryParser.parseCardSalaryText(field, { defaultCurrency: "EUR" }),
      null,
      `field should not match: ${field}`
    );
  }
});

test("card non-annual salary is ignored", () => {
  assert.equal(
    SalaryParser.parseCardSalaryText("€10/hour - €15/hour", { defaultCurrency: "EUR" }),
    null
  );
  assert.equal(
    SalaryParser.parseCardSalaryText("€2.800 al mese - €3.200 al mese", { defaultCurrency: "EUR" }),
    null
  );
});

test("US cents format range is recognized", () => {
  const info = SalaryParser.findSalaryInfo(
    "The typical base pay range for this role across Italy is € 28,800.00 - € 38,200.00 per year.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.equal(info.currency, "EUR");
  assert.deepEqual(toComparable(info), [28800, 38200]);
});

test("cents are rounded to the nearest hundred", () => {
  const us = SalaryParser.findSalaryInfo(
    "Annual Base Salary Range: 25,666.67 - 47,666.67 Euro",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(us), [25700, 47700]);

  const italian = SalaryParser.findSalaryInfo(
    "Inquadramento e retribuzione range RAL € 25.731,81 – 26.843,44",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(italian), [25700, 26800]);

  const single = SalaryParser.findSalaryInfo("Salary: €25,666.67 per year", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(single), [25700]);
});

test("Italian cents format range is recognized", () => {
  const glued = SalaryParser.findSalaryInfo("RAL: range retributivo 29.000,00€ – 32.000,00€", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(glued), [29000, 32000]);

  const prefixed = SalaryParser.findSalaryInfo(
    "La retribuzione prevista per questa posizione è compresa tra EUR 22.000,00 e EUR 25.000,00 lordi annui.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(prefixed), [22000, 25000]);
});

test("space before the thousands separator is tolerated", () => {
  const info = SalaryParser.findSalaryInfo("Annual Gross Salary: 67 .000 Eur – 100.000 Eur", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [67000, 100000]);
});

test("Swiss apostrophe thousands are recognized", () => {
  const info = SalaryParser.findSalaryInfo(
    "Attractive packages - the salary band we have for this position is of 45'000-50'000 € (Gross Annual Salary)",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), [45000, 50000]);
});

test("currency symbol before the k suffix is recognized", () => {
  const info = SalaryParser.findSalaryInfo("RAL: €47K - 53€K + Ticket, welfare", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [47000, 53000]);
});

test("shared k-suffix range parses both bounds", () => {
  const info = SalaryParser.findSalaryInfo("Salary: 60-70k (depending on experience)", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [60000, 70000]);

  const ral = SalaryParser.findSalaryInfo("CCNL Metalmeccanica industria - RAL 35-37K;", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(ral), [35000, 37000]);
});

test("economic range label provides bare-range context", () => {
  const info = SalaryParser.findSalaryInfo(
    "Inquadramento a tempo indeterminato, CCNL Commercio;\nRange economico: 35-55K",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), [35000, 55000]);
});

test("client asset ranges are not salaries", () => {
  const info = SalaryParser.findSalaryInfo(
    "Administrează relația cu clienții persoane fizice care îndeplinesc condițiile de încadrare în segmentul Premium Invest (AUM între 60k – 250k EUR)",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), []);

  const english = SalaryParser.findSalaryInfo(
    "Manage high-net-worth clients with assets under management between 60k and 250k EUR.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(english), []);
});

test("mensilità installments do not suppress the annual range", () => {
  const info = SalaryParser.findSalaryInfo(
    "La corrispondente RAL di base per il contratto a tempo indeterminato è prevista nell'intervallo tra 40.000 e 50.000 €, distribuita su 14 mensilità.",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(info), [40000, 50000]);
});

test("monthly pay is still rejected", () => {
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("Retribuzione: €2.800 al mese")), []);
  assert.deepEqual(toComparable(SalaryParser.findSalaryInfo("Retribuzione mensile: €2.800")), []);
});

test("missing-zero recruiter error is corrected to thousands", () => {
  const info = SalaryParser.findSalaryInfo("Livello retribuzione di base\n25,00 €/yr - 28,00 €/anno", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(info), [25000, 28000]);

  const prose = SalaryParser.findSalaryInfo("Salary between €26,00 and €28,00.", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(prose), [26000, 28000]);
});

test("missing-zero correction stays conservative", () => {
  assert.deepEqual(
    toComparable(
      SalaryParser.findSalaryInfo("Pay: €25,00/hour", { defaultCurrency: "EUR", allowBareRange: true })
    ),
    []
  );
  assert.deepEqual(
    toComparable(
      SalaryParser.findSalaryInfo("Salary: 3,500.00 USD monthly", { defaultCurrency: "EUR", allowBareRange: true })
    ),
    []
  );
  assert.deepEqual(
    toComparable(
      SalaryParser.findSalaryInfo("Target Incentive: 5 - 7.50%", { defaultCurrency: "EUR", allowBareRange: true })
    ),
    []
  );
  assert.deepEqual(
    toComparable(
      SalaryParser.findSalaryInfo("RAL 28.000 + 1750 incentivo produttività", {
        defaultCurrency: "EUR",
        allowBareRange: true,
      })
    ),
    [28000]
  );
});

test("compact annual card notation with zero cents", () => {
  const parsed = SalaryParser.parseCardSalaryText("€26,00/yr - €28,00/yr", { defaultCurrency: "EUR" });
  assert.deepEqual(toComparable(parsed.info), [26000, 28000]);
});

test("italian article between the bounds does not break the range", () => {
  const reported = SalaryParser.findSalaryInfo(
    "L'inquadramento definitivo sarà determinato in base alle competenze e all'esperienza maturata, con una ral tra i 28.000 ed i 33.000€",
    { defaultCurrency: "EUR", allowBareRange: true }
  );
  assert.deepEqual(toComparable(reported), [28000, 33000]);

  const ei = SalaryParser.findSalaryInfo("con una ral tra i 28.000 e i 33.000€", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(ei), [28000, 33000]);

  const eil = SalaryParser.findSalaryInfo("con una ral tra 28.000 e il 33.000€", {
    defaultCurrency: "EUR",
    allowBareRange: true,
  });
  assert.deepEqual(toComparable(eil), [28000, 33000]);
});
