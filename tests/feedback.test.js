const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const feedback = require(path.join(__dirname, "..", "extension", "src", "feedback.js"));

const REPORT = {
  job_id: "4441110001",
  expected_type: "range",
  expected_value: "35k - 45k EUR",
  detected_kind: "range",
  detected_value: "25k - 30k",
  detected_source: "description",
  language: "en",
  extension_version: "0.11.0",
};

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

test("validateReport accepts a complete report and builds the FormSubmit payload", () => {
  const result = feedback.validateReport(REPORT);
  assert.equal(result.ok, true);
  assert.equal(result.payload.job_id, "4441110001");
  assert.equal(result.payload.job_url, "https://www.linkedin.com/jobs/view/4441110001/");
  assert.equal(result.payload.expected_value, "35k - 45k EUR");
  assert.equal(result.payload._subject, "LGS-96 salary report");
  assert.equal(result.payload._captcha, "false");
  assert.equal(result.payload.language, "en");
  assert.equal("description_text" in result.payload, false);
});

test("validateReport requires a numeric job id", () => {
  for (const job_id of [undefined, null, "", "abc", "12a", 444]) {
    const result = feedback.validateReport({ ...REPORT, job_id });
    assert.equal(result.ok, false, String(job_id));
    assert.equal(result.error, "invalid_job_id");
  }
});

test("validateReport enforces the expected type and value rules", () => {
  assert.equal(feedback.validateReport({ ...REPORT, expected_type: "wrong" }).ok, false);
  assert.equal(
    feedback.validateReport({ ...REPORT, expected_type: "none", expected_value: "" }).ok,
    true
  );
  assert.equal(
    feedback.validateReport({ ...REPORT, expected_type: "none", expected_value: "  " }).ok,
    true
  );
  assert.equal(
    feedback.validateReport({ ...REPORT, expected_type: "none", expected_value: "oops" }).ok,
    false
  );
  assert.equal(
    feedback.validateReport({ ...REPORT, expected_type: "single", expected_value: "   " }).ok,
    false
  );
  assert.equal(
    feedback.validateReport({
      ...REPORT,
      expected_type: "single",
      expected_value: "x".repeat(51),
    }).ok,
    false
  );
  assert.equal(
    feedback.validateReport({
      ...REPORT,
      expected_type: "single",
      expected_value: "  x  ",
    }).payload.expected_value,
    "x"
  );
});

test("validateReport validates detected fields and defaults leniently", () => {
  assert.equal(feedback.validateReport({ ...REPORT, detected_kind: "wat" }).ok, false);
  const lenient = feedback.validateReport({
    job_id: "123",
    expected_type: "none",
    expected_value: "",
    detected_kind: "error",
  });
  assert.equal(lenient.ok, true);
  assert.equal(lenient.payload.detected_source, "unknown");
  assert.equal(lenient.payload.language, "en");
  assert.equal(lenient.payload.detected_value, "");
});

test("submitReport sends the agreed POST contract", async () => {
  const captured = [];
  const fetchImpl = async (url, init) => {
    captured.push({ url, init });
    return fakeResponse(JSON.stringify({ success: "true" }));
  };
  const result = await feedback.submitReport(REPORT, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, feedback.FEEDBACK_ENDPOINT);
  assert.equal(captured[0].init.method, "POST");
  assert.equal(captured[0].init.headers["Content-Type"], "application/json");
  assert.equal(captured[0].init.headers.Accept, "application/json");
  assert.equal(captured[0].init.credentials, "omit");
  assert.equal(captured[0].init.cache, "no-store");
  assert.equal(captured[0].init.referrerPolicy, "no-referrer");
  const body = JSON.parse(captured[0].init.body);
  assert.equal(body.job_id, "4441110001");
  assert.equal(body.expected_value, "35k - 45k EUR");
});

test("submitReport treats string and boolean success as delivered", async () => {
  const okTrue = await feedback.submitReport(
    REPORT,
    async () => fakeResponse(JSON.stringify({ success: true }))
  );
  assert.equal(okTrue.ok, true);
  const okString = await feedback.submitReport(
    REPORT,
    async () => fakeResponse(JSON.stringify({ success: "true" }))
  );
  assert.equal(okString.ok, true);
});

test("submitReport rejects failures without claiming success", async () => {
  const httpFail = await feedback.submitReport(
    REPORT,
    async () => fakeResponse("{}", { ok: false })
  );
  assert.equal(httpFail.ok, false);

  const rejected = await feedback.submitReport(
    REPORT,
    async () => fakeResponse(JSON.stringify({ success: "false" }))
  );
  assert.equal(rejected.ok, false);

  const notJson = await feedback.submitReport(
    REPORT,
    async () => fakeResponse("<html>blocked</html>", { contentType: "text/html" })
  );
  assert.equal(notJson.ok, false);

  const garbage = await feedback.submitReport(
    REPORT,
    async () => fakeResponse("not-json{")
  );
  assert.equal(garbage.ok, false);

  const thrown = await feedback.submitReport(REPORT, async () => {
    throw new Error("network down");
  });
  assert.equal(thrown.ok, false);
});

test("submitReport rejects invalid reports before any network call", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return fakeResponse(JSON.stringify({ success: "true" }));
  };
  const result = await feedback.submitReport({ job_id: "abc" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("submitReport times out hung requests", async () => {
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      if (init && init.signal) {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }
    });
  const result = await feedback.submitReport(REPORT, fetchImpl, { timeoutMs: 25 });
  assert.equal(result.ok, false);
});
