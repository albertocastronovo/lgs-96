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
    const info = SalaryParser.findSalaryInfo(record.description);
    assert.deepEqual(
      toComparable(info),
      record.expected,
      `fixture ${index} failed: ${JSON.stringify(record.description.slice(0, 60))}`
    );
  });
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
