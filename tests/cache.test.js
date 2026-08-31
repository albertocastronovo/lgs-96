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
        onChanged: {
          addListener() {},
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
const cache = require(path.join(__dirname, "..", "extension", "src", "cache.js"));

const RANGE = { kind: "range", min: 24000, max: 28000, currency: "EUR" };

test("cache is enabled by default; range results round-trip", async () => {
  const fake = install(createFakeChrome());
  assert.equal(await cache.getCacheEnabled(), true);
  assert.equal(await cache.getCachedResult("123"), null);

  await cache.saveCachedResult("123", RANGE, null, "description");
  const entry = await cache.getCachedResult("123");
  assert.equal(entry.v, 1);
  assert.equal(entry.source, "description");
  assert.equal(entry.displayText, null);
  assert.deepEqual(entry.result, RANGE);
  assert.ok(fake.data.has("lgs96:job:123"));
});

test("native card display text is stored and returned", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult(
    "456",
    { kind: "single", amount: 30000, bound: "approx", currency: "EUR" },
    "€30/yr",
    "card"
  );
  const entry = await cache.getCachedResult("456");
  assert.equal(entry.source, "card");
  assert.equal(entry.displayText, "€30/yr");
  assert.equal(entry.result.amount, 30000);
});

test("no-salary results are cached", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult("789", { kind: "none" }, null, "description");
  const entry = await cache.getCachedResult("789");
  assert.deepEqual(entry.result, { kind: "none" });
});

test("entries expire after three days and are removed", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("1", RANGE, null, "description");
  const stored = fake.data.get("lgs96:job:1");
  stored.savedAt = Date.now() - cache.TTL_MS - 1000;
  assert.equal(await cache.getCachedResult("1"), null);
  assert.equal(fake.data.has("lgs96:job:1"), false);
});

test("corrupt entries are rejected and removed", async () => {
  const fake = install(createFakeChrome());
  fake.data.set("lgs96:job:2", { garbage: true });
  fake.data.set("lgs96:job:22", { v: 1, savedAt: Date.now(), result: { kind: "wat" } });
  assert.equal(await cache.getCachedResult("2"), null);
  assert.equal(fake.data.has("lgs96:job:2"), false);
  assert.equal(await cache.getCachedResult("22"), null);
  assert.equal(fake.data.has("lgs96:job:22"), false);
});

test("invalid results and non-numeric ids are never stored", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("3", { kind: "error" }, null, "description");
  await cache.saveCachedResult("abc", RANGE, null, "description");
  assert.equal(fake.data.has("lgs96:job:3"), false);
  assert.equal(fake.data.has("lgs96:job:abc"), false);
  assert.equal(await cache.getCachedResult("abc"), null);
});

test("disabled cache ignores reads and writes but retains entries", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("4", RANGE, null, "description");
  await cache.setCacheEnabled(false);
  assert.equal(await cache.getCacheEnabled(), false);
  assert.equal(await cache.getCachedResult("4"), null);
  assert.equal(await cache.saveCachedResult("5", RANGE, null, "description"), false);
  assert.equal(fake.data.has("lgs96:job:5"), false);
  assert.ok(fake.data.has("lgs96:job:4"), "entry retained while disabled");
  await cache.setCacheEnabled(true);
  const entry = await cache.getCachedResult("4");
  assert.deepEqual(entry.result, RANGE);
});

test("clear removes job entries but keeps the setting", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("6", RANGE, null, "description");
  await cache.saveCachedResult("7", { kind: "none" }, null, "description");
  await cache.setCacheEnabled(false);
  const removed = await cache.clearCache();
  assert.equal(removed, 2);
  assert.equal(fake.data.has("lgs96:job:6"), false);
  assert.equal(fake.data.has("lgs96:job:7"), false);
  assert.equal(await cache.getCacheEnabled(), false);
  assert.equal(await cache.getCacheSize(), 0);
});

test("cloud-sourced entries round-trip with cloud provenance", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult("321", RANGE, null, "cloud");
  const entry = await cache.getCachedResult("321");
  assert.equal(entry.source, "cloud");
  assert.deepEqual(entry.result, RANGE);
});

test("cache size counts only valid fresh entries", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("8", RANGE, null, "description");
  await cache.saveCachedResult("9", { kind: "none" }, null, "description");
  fake.data.set("lgs96:job:8", { v: 1, savedAt: 0, result: RANGE, displayText: null, source: "description" });
  fake.data.set("lgs96:setting", true);
  assert.equal(await cache.getCacheSize(), 1);
});
