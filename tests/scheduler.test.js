const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const scheduler = require(path.join(__dirname, "..", "extension", "src", "scheduler.js"));

const BASE = 1500;

test("computeDelay applies jitter symmetrically around the base", () => {
  const now = 1000000;
  assert.equal(
    scheduler.computeDelay({ baseMs: BASE, jitterRatio: 0.2, now, random: 0.5 }),
    BASE
  );
  assert.equal(
    scheduler.computeDelay({ baseMs: BASE, jitterRatio: 0.2, now, random: 0 }),
    BASE * 0.8
  );
  assert.equal(
    scheduler.computeDelay({ baseMs: BASE, jitterRatio: 0.2, now, random: 1 }),
    BASE * 1.2
  );
});

test("computeDelay never returns negative values", () => {
  assert.equal(scheduler.computeDelay({ baseMs: -5, now: 0, random: 0 }), 0);
  assert.equal(
    scheduler.computeDelay({ baseMs: BASE, backoffUntil: -100, now: 0, random: 0.5 }),
    BASE
  );
});

test("computeDelay extends the delay while backoff is active", () => {
  const now = 1000000;
  assert.equal(
    scheduler.computeDelay({
      baseMs: 300,
      backoffUntil: now + 40000,
      now,
      random: 0.5,
    }),
    40000
  );
  assert.equal(
    scheduler.computeDelay({
      baseMs: 300,
      backoffUntil: now + 400,
      now,
      random: 0.5,
    }),
    400
  );
  assert.equal(
    scheduler.computeDelay({
      baseMs: BASE,
      backoffUntil: now + 400,
      now,
      random: 0.5,
    }),
    BASE
  );
});

test("parseRetryAfter supports delta seconds", () => {
  assert.equal(scheduler.parseRetryAfter("30", 1000), 30000);
  assert.equal(scheduler.parseRetryAfter("0", 1000), 0);
});

test("parseRetryAfter supports HTTP dates", () => {
  const now = Date.UTC(2026, 7, 28, 12, 0, 0);
  const future = new Date(now + 45000).toUTCString();
  const past = new Date(now - 45000).toUTCString();
  const parsed = scheduler.parseRetryAfter(future, now);
  assert.ok(parsed > 44000 && parsed <= 45000, `got ${parsed}`);
  assert.equal(scheduler.parseRetryAfter(past, now), 0);
});

test("parseRetryAfter rejects garbage and empty values", () => {
  assert.equal(scheduler.parseRetryAfter(null), null);
  assert.equal(scheduler.parseRetryAfter(""), null);
  assert.equal(scheduler.parseRetryAfter("soon"), null);
});

test("frequency presets map to the agreed intervals", () => {
  assert.deepEqual(scheduler.FREQUENCY_PRESETS, { slow: 2500, average: 1600, fast: 1000 });
  assert.equal(scheduler.DEFAULT_FREQUENCY, "average");
  assert.equal(scheduler.DEFAULT_INTERVAL_MS, 1600);
});

test("request frequency defaults to average without storage", async () => {
  delete globalThis.chrome;
  assert.equal(await scheduler.getRequestFrequency(), "average");
  assert.equal(await scheduler.getRequestIntervalMs(), 1600);
  assert.equal(await scheduler.setRequestFrequency("fast"), false);
  delete globalThis.chrome;
});

test("request frequency persists and falls back on invalid values", async () => {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
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
  };
  assert.equal(await scheduler.getRequestFrequency(), "average");
  assert.equal(await scheduler.setRequestFrequency("slow"), true);
  assert.equal(data.get("lgs96:requestFrequency"), "slow");
  assert.equal(await scheduler.getRequestFrequency(), "slow");
  assert.equal(await scheduler.getRequestIntervalMs(), 2500);
  await scheduler.setRequestFrequency("fast");
  assert.equal(await scheduler.getRequestIntervalMs(), 1000);
  data.set("lgs96:requestFrequency", "turbo");
  assert.equal(await scheduler.getRequestFrequency(), "average");
  data.set("lgs96:requestFrequency", 1);
  assert.equal(await scheduler.getRequestFrequency(), "average");
  delete globalThis.chrome;
});
