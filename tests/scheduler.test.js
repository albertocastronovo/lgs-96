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
