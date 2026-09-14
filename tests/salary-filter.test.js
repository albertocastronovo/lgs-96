const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function createFakeChrome() {
  const data = new Map();
  return {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            const out = {};
            for (const key of [].concat(keys))
              if (data.has(key)) out[key] = data.get(key);
            return out;
          },
          async set(operations) {
            for (const [key, value] of Object.entries(operations))
              data.set(key, value);
          },
          async remove(keys) {
            for (const key of [].concat(keys)) data.delete(key);
          },
        },
      },
    },
    data,
  };
}

const filter = require(
  path.join(__dirname, "..", "extension", "src", "salary-filter.js"),
);

test("parseTargetInput accepts plain amounts and k suffixes", () => {
  assert.equal(filter.parseTargetInput("35000"), 35000);
  assert.equal(filter.parseTargetInput(45000), 45000);
  assert.equal(filter.parseTargetInput("35k"), 35000);
  assert.equal(filter.parseTargetInput("35.5k"), 35500);
  assert.equal(filter.parseTargetInput("35 000"), 35000);
  assert.equal(filter.parseTargetInput("  60K  "), 60000);
});

test("parseTargetInput rejects empty and invalid values", () => {
  assert.equal(filter.parseTargetInput(""), null);
  assert.equal(filter.parseTargetInput(null), null);
  assert.equal(filter.parseTargetInput(undefined), null);
  assert.equal(filter.parseTargetInput("abc"), null);
  assert.equal(filter.parseTargetInput("-5000"), null);
  assert.equal(filter.parseTargetInput("0"), null);
  assert.equal(filter.parseTargetInput("99999999"), null);
});

test("parseToleranceInput defaults, clamps and rounds", () => {
  assert.equal(filter.parseToleranceInput(""), 10);
  assert.equal(filter.parseToleranceInput(null), 10);
  assert.equal(filter.parseToleranceInput(undefined), 10);
  assert.equal(filter.parseToleranceInput("abc"), 10);
  assert.equal(filter.parseToleranceInput("15"), 15);
  assert.equal(filter.parseToleranceInput("0"), 0);
  assert.equal(filter.parseToleranceInput("-5"), 0);
  assert.equal(filter.parseToleranceInput("99"), 50);
  assert.equal(filter.parseToleranceInput("12.4"), 12);
});

test("normalizeFilter requires a target and keeps tolerance", () => {
  assert.deepEqual(
    filter.normalizeFilter({ enabled: true, target: "50k", tolerance: "15" }),
    { enabled: true, target: 50000, tolerance: 15 },
  );
  assert.deepEqual(
    filter.normalizeFilter({ enabled: true, target: "", tolerance: "" }),
    { enabled: false, target: null, tolerance: 10 },
  );
  assert.deepEqual(filter.normalizeFilter(null), {
    enabled: false,
    target: null,
    tolerance: 10,
  });
});

test("normalizeFilter migrates the legacy min/max shape", () => {
  assert.deepEqual(
    filter.normalizeFilter({ enabled: true, min: "40k", max: "60k" }),
    { enabled: true, target: 40000, tolerance: 10 },
  );
  assert.deepEqual(filter.normalizeFilter({ enabled: true, max: "60k" }), {
    enabled: true,
    target: 60000,
    tolerance: 10,
  });
});

test("isActive is true only when enabled with a target", () => {
  assert.equal(
    filter.isActive({ enabled: true, target: 50000, tolerance: 10 }),
    true,
  );
  assert.equal(
    filter.isActive({ enabled: true, target: null, tolerance: 10 }),
    false,
  );
  assert.equal(
    filter.isActive({ enabled: false, target: 50000, tolerance: 10 }),
    false,
  );
  assert.equal(filter.isActive(null), false);
});

test("inactive filter matches everything, including missing salaries", () => {
  const inactive = { enabled: false, target: null, tolerance: 10 };
  assert.equal(filter.matchesSalary(null, inactive), true);
  assert.equal(filter.matchesSalary({ kind: "none" }, inactive), true);
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 20000, max: 25000 }, inactive),
    true,
  );
});

test("active filter dims salaries without a detected amount", () => {
  const active = { enabled: true, target: 50000, tolerance: 10 };
  assert.equal(filter.matchesSalary(null, active), false);
  assert.equal(filter.matchesSalary({ kind: "none" }, active), false);
  assert.equal(filter.matchesSalary({ kind: "error" }, active), false);
});

test("matchesSalary compares the lower bound against target minus tolerance", () => {
  // Target 50000, tolerance 10% -> threshold 45000.
  const active = { enabled: true, target: 50000, tolerance: 10 };
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 45000, max: 60000 }, active),
    true,
  );
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 50000, max: 90000 }, active),
    true,
  );
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 44999, max: 90000 }, active),
    false,
  );
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 20000, max: 30000 }, active),
    false,
  );
  assert.equal(
    filter.matchesSalary({ kind: "single", amount: 45000 }, active),
    true,
  );
  assert.equal(
    filter.matchesSalary({ kind: "single", amount: 44999 }, active),
    false,
  );
});

test("matchesSalary honors a custom tolerance", () => {
  // Target 50000, tolerance 0% -> threshold 50000.
  const strict = { enabled: true, target: 50000, tolerance: 0 };
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 50000, max: 70000 }, strict),
    true,
  );
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 49999, max: 70000 }, strict),
    false,
  );
  // Target 50000, tolerance 20% -> threshold 40000.
  const loose = { enabled: true, target: 50000, tolerance: 20 };
  assert.equal(
    filter.matchesSalary({ kind: "range", min: 40000, max: 42000 }, loose),
    true,
  );
  assert.equal(
    filter.matchesSalary({ kind: "single", amount: 39999 }, loose),
    false,
  );
});

test("salary filter defaults to disabled without storage", async () => {
  const saved = globalThis.chrome;
  globalThis.chrome = undefined;
  try {
    assert.deepEqual(await filter.getSalaryFilter(), {
      enabled: false,
      target: null,
      tolerance: 10,
    });
    assert.equal(
      await filter.setSalaryFilter({ enabled: true, target: "30k" }),
      false,
    );
  } finally {
    globalThis.chrome = saved;
  }
});

test("salary filter persists normalized values", async () => {
  const fake = createFakeChrome();
  globalThis.chrome = fake.chrome;
  try {
    assert.deepEqual(await filter.getSalaryFilter(), {
      enabled: false,
      target: null,
      tolerance: 10,
    });
    assert.equal(
      await filter.setSalaryFilter({
        enabled: true,
        target: "50k",
        tolerance: "15",
      }),
      true,
    );
    assert.deepEqual(fake.data.get("lgs96:salaryFilter"), {
      enabled: true,
      target: 50000,
      tolerance: 15,
    });
    assert.deepEqual(await filter.getSalaryFilter(), {
      enabled: true,
      target: 50000,
      tolerance: 15,
    });
  } finally {
    delete globalThis.chrome;
  }
});
