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
            if (keys === null || keys === undefined) return Object.fromEntries(data);
            const out = {};
            for (const key of [].concat(keys)) if (data.has(key)) out[key] = data.get(key);
            return out;
          },
          async set(operations) {
            for (const [key, value] of Object.entries(operations)) data.set(key, value);
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

function install(fake) {
  globalThis.chrome = fake.chrome;
  return fake;
}

install(createFakeChrome());
const cloud = require(path.join(__dirname, "..", "extension", "src", "cloud-cache.js"));
const localCache = require(path.join(__dirname, "..", "extension", "src", "cache.js"));

const RANGE = { kind: "range", min: 30000, max: 45000, currency: "EUR" };
const SINGLE = { kind: "single", amount: 28000, bound: "approx", currency: "EUR" };

function fakeResponse(body, { ok = true, contentType = "application/json" } = {}) {
  return {
    ok,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === "content-type" ? contentType : null,
    },
    text: async () => body,
  };
}

test("cloud cache defaults to disabled", async () => {
  install(createFakeChrome());
  assert.equal(await cloud.getCloudCacheEnabled(), false);
});

test("cloud cache defaults to disabled without storage", async () => {
  const saved = globalThis.chrome;
  globalThis.chrome = undefined;
  try {
    assert.equal(await cloud.getCloudCacheEnabled(), false);
  } finally {
    globalThis.chrome = saved;
  }
});

test("cloud setting persists and is independent from local cache setting", async () => {
  install(createFakeChrome());
  await localCache.setCacheEnabled(true);
  await cloud.setCloudCacheEnabled(true);
  assert.equal(await cloud.getCloudCacheEnabled(), true);

  await localCache.setCacheEnabled(false);
  assert.equal(await cloud.getCloudCacheEnabled(), true);
  assert.equal(await localCache.getCacheEnabled(), false);

  await cloud.setCloudCacheEnabled(false);
  assert.equal(await cloud.getCloudCacheEnabled(), false);
  assert.equal(await localCache.getCacheEnabled(), false);
});

test("normalizeJobIds filters, dedupes and caps at 50", () => {
  const input = ["111", "111", "abc", 42, null, "", "222", " 333 ", "00444"];
  assert.deepEqual(cloud.normalizeJobIds(input), ["111", "222", "00444"]);
  assert.deepEqual(cloud.normalizeJobIds("not-an-array"), []);
  const sixty = Array.from({ length: 60 }, (_, i) => String(1000 + i));
  const normalized = cloud.normalizeJobIds(sixty);
  assert.equal(normalized.length, cloud.MAX_BATCH_SIZE);
  assert.equal(normalized[0], "1000");
  assert.equal(normalized[49], "1049");
});

test("buildRequestBody produces the agreed POST body", () => {
  assert.deepEqual(cloud.buildRequestBody(["1", "1", "x", "2"]), {
    jobIds: ["1", "2"],
  });
});

test("validateHit accepts none, range and every single bound", () => {
  assert.deepEqual(cloud.validateHit({ kind: "none" }), { kind: "none" });
  assert.deepEqual(cloud.validateHit(RANGE), RANGE);
  assert.deepEqual(cloud.validateHit(SINGLE), SINGLE);
  assert.deepEqual(
    cloud.validateHit({ kind: "single", amount: 45000, bound: "min", currency: "EUR" }),
    { kind: "single", amount: 45000, bound: "min", currency: "EUR" }
  );
  assert.deepEqual(
    cloud.validateHit({ kind: "single", amount: 50000, bound: "max", currency: "USD" }),
    { kind: "single", amount: 50000, bound: "max", currency: "USD" }
  );
});

test("validateHit accepts every supported currency", () => {
  const currencies = [
    "EUR", "USD", "GBP", "PLN", "CAD", "AUD", "NZD", "CHF",
    "SEK", "NOK", "DKK", "INR", "JPY", "SGD",
  ];
  for (const currency of currencies) {
    const hit = cloud.validateHit({ kind: "range", min: 20000, max: 30000, currency });
    assert.equal(hit.currency, currency);
  }
});

test("validateHit rejects unsure, error, unknown and malformed entries", () => {
  assert.equal(cloud.validateHit({ kind: "unsure", reason: "ambiguous_salary_text" }), null);
  assert.equal(cloud.validateHit({ kind: "error", code: "posting_fetch_failed" }), null);
  assert.equal(cloud.validateHit({ kind: "wat" }), null);
  assert.equal(cloud.validateHit(null), null);
  assert.equal(cloud.validateHit("range"), null);
  assert.equal(cloud.validateHit([RANGE]), null);

  assert.equal(
    cloud.validateHit({ kind: "range", min: 40000, max: 30000, currency: "EUR" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "range", min: 4999, max: 30000, currency: "EUR" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "range", min: 20000, max: 20000001, currency: "EUR" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "range", min: 20000, max: 30000, currency: "eur" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "range", min: 20000, max: 30000 }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "range", min: Number.NaN, max: 30000, currency: "EUR" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "single", amount: 4999, bound: "approx", currency: "EUR" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "single", amount: 28000, bound: "maybe", currency: "EUR" }),
    null
  );
  assert.equal(
    cloud.validateHit({ kind: "single", amount: 28000, bound: "approx" }),
    null
  );
});

test("extractHits keeps valid requested entries and misses unsure/error/unknown", () => {
  const parsed = {
    1: { kind: "range", min: 30000, max: 40000, currency: "EUR" },
    2: { kind: "unsure", reason: "ambiguous_salary_text" },
    3: { kind: "error", code: "posting_fetch_failed" },
    4: { kind: "single", amount: 28000, bound: "approx", currency: "EUR" },
    5: { kind: "range", min: 100, max: 200, currency: "EUR" },
    999: { kind: "none" },
  };
  const { hits, misses } = cloud.extractHits(parsed, ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(Object.keys(hits).sort(), ["1", "4"]);
  assert.deepEqual(misses, ["2", "3", "5", "6"]);
});

test("extractHits treats non-object responses as full misses", () => {
  for (const parsed of [null, undefined, [RANGE], "ok", 42]) {
    const { hits, misses } = cloud.extractHits(parsed, ["1", "2"]);
    assert.deepEqual(hits, {});
    assert.deepEqual(misses, ["1", "2"]);
  }
});

test("isResponseSizeOk bounds the body size", () => {
  assert.equal(cloud.isResponseSizeOk("{}"), true);
  assert.equal(cloud.isResponseSizeOk("x".repeat(cloud.MAX_RESPONSE_CHARS)), true);
  assert.equal(cloud.isResponseSizeOk("x".repeat(cloud.MAX_RESPONSE_CHARS + 1)), false);
  assert.equal(cloud.isResponseSizeOk(null), false);
});

test("lookupSalaries skips the network for empty id lists", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return fakeResponse("{}");
  };
  const result = await cloud.lookupSalaries(["abc", 42, null], fetchImpl);
  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: true, hits: {} });
});

test("lookupSalaries sends POST JSON with the agreed contract", async () => {
  const captured = [];
  const fetchImpl = async (url, init) => {
    captured.push({ url, init });
    return fakeResponse(JSON.stringify({ 111: { kind: "none" } }));
  };
  const result = await cloud.lookupSalaries(["111", "111", "abc", 42], fetchImpl);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, cloud.CLOUD_ENDPOINT);
  assert.equal(captured[0].init.method, "POST");
  assert.equal(captured[0].init.headers["Content-Type"], "application/json");
  assert.equal(captured[0].init.credentials, "omit");
  assert.equal(captured[0].init.cache, "no-store");
  assert.deepEqual(JSON.parse(captured[0].init.body), { jobIds: ["111"] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.hits, { 111: { kind: "none" } });
});

test("lookupSalaries keeps valid entries from a partially malformed response", async () => {
  const body = JSON.stringify({
    1: RANGE,
    2: { kind: "unsure" },
    3: { kind: "error", code: "posting_not_found" },
    4: { kind: "range", min: 1, max: 2, currency: "EUR" },
    5: SINGLE,
  });
  const result = await cloud.lookupSalaries(["1", "2", "3", "4", "5"], async () =>
    fakeResponse(body)
  );
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.hits).sort(), ["1", "5"]);
});

test("lookupSalaries reports failure on HTTP error", async () => {
  const result = await cloud.lookupSalaries(["1"], async () =>
    fakeResponse("{}", { ok: false })
  );
  assert.equal(result.ok, false);
});

test("lookupSalaries reports failure on non-JSON content type", async () => {
  const result = await cloud.lookupSalaries(["1"], async () =>
    fakeResponse("{}", { contentType: "text/html" })
  );
  assert.equal(result.ok, false);
});

test("lookupSalaries reports failure on oversized body", async () => {
  const result = await cloud.lookupSalaries(["1"], async () =>
    fakeResponse("x".repeat(cloud.MAX_RESPONSE_CHARS + 1))
  );
  assert.equal(result.ok, false);
});

test("lookupSalaries reports failure on invalid JSON", async () => {
  const result = await cloud.lookupSalaries(["1"], async () =>
    fakeResponse("not-json{")
  );
  assert.equal(result.ok, false);
});

test("lookupSalaries reports failure when fetch throws", async () => {
  const result = await cloud.lookupSalaries(["1"], async () => {
    throw new Error("network down");
  });
  assert.equal(result.ok, false);
});

test("lookupSalaries reports failure on timeout", async () => {
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      if (init && init.signal) {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }
    });
  const result = await cloud.lookupSalaries(["1"], fetchImpl, { timeoutMs: 25 });
  assert.equal(result.ok, false);
});
