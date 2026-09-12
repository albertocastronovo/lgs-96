(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsFeedback = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const MSG_TYPE = "lgs96:feedbackSubmit";
  const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/7c6baeb1b6d6fbd39610b0b1c092933b";
  const MAX_EXPECTED_LENGTH = 50;
  const MAX_DETECTED_LENGTH = 120;
  const MAX_RESPONSE_CHARS = 10000;
  const REQUEST_TIMEOUT_MS = 10000;

  const EXPECTED_TYPES = new Set(["none", "single", "range"]);
  const DETECTED_KINDS = new Set(["none", "single", "range", "error"]);
  const DETECTED_SOURCES = new Set([
    "card",
    "local-cache",
    "description",
    "cloud",
    "error",
    "unknown",
  ]);

  function jobUrl(jobId) {
    return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }

  function validateReport(report) {
    if (!report || typeof report !== "object") {
      return { ok: false, error: "invalid_report" };
    }
    const jobId = report.job_id;
    if (typeof jobId !== "string" || !/^\d+$/.test(jobId)) {
      return { ok: false, error: "invalid_job_id" };
    }
    const expectedType = report.expected_type;
    if (!EXPECTED_TYPES.has(expectedType)) {
      return { ok: false, error: "invalid_expected_type" };
    }
    if (typeof report.expected_value !== "string") {
      return { ok: false, error: "invalid_expected_value" };
    }
    let expectedValue = report.expected_value.trim();
    if (expectedType === "none") {
      if (expectedValue.length > 0) {
        return { ok: false, error: "unexpected_expected_value" };
      }
      expectedValue = "";
    } else if (expectedValue.length < 1 || expectedValue.length > MAX_EXPECTED_LENGTH) {
      return { ok: false, error: "invalid_expected_value" };
    }
    const detectedKind = report.detected_kind;
    if (!DETECTED_KINDS.has(detectedKind)) {
      return { ok: false, error: "invalid_detected_kind" };
    }
    let detectedValue =
      typeof report.detected_value === "string" ? report.detected_value.trim() : "";
    if (detectedValue.length > MAX_DETECTED_LENGTH) {
      detectedValue = detectedValue.slice(0, MAX_DETECTED_LENGTH);
    }
    const detectedSource = DETECTED_SOURCES.has(report.detected_source)
      ? report.detected_source
      : "unknown";
    const language =
      typeof report.language === "string" && /^[a-z]{2}$/.test(report.language)
        ? report.language
        : "en";
    const extensionVersion =
      typeof report.extension_version === "string"
        ? report.extension_version.slice(0, 20)
        : "";
    return {
      ok: true,
      payload: {
        _subject: "LGS-96 salary report",
        _template: "table",
        _captcha: "false",
        job_id: jobId,
        job_url: jobUrl(jobId),
        expected_type: expectedType,
        expected_value: expectedValue,
        detected_kind: detectedKind,
        detected_value: detectedValue,
        detected_source: detectedSource,
        language,
        extension_version: extensionVersion,
      },
    };
  }

  async function submitReport(report, fetchImpl, options = {}) {
  const validated = validateReport(report);
  if (!validated.ok) {
    console.warn("[LGS Feedback] Validation failed:", validated.error);
    return { ok: false, error: validated.error };
  }

  const doFetch =
    typeof fetchImpl === "function"
      ? fetchImpl
      : typeof fetch === "function"
        ? fetch
        : null;

  if (!doFetch) {
    console.warn("[LGS Feedback] Fetch implementation unavailable.");
    return { ok: false, error: "feedback_unavailable" };
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : REQUEST_TIMEOUT_MS;

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await doFetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(validated.payload),
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
    });

    if (!response || response.ok !== true) {
      console.warn("[LGS Feedback] HTTP Error status:", response?.status, response?.statusText);
      return { ok: false, error: "feedback_http_error" };
    }

    const contentType =
      response.headers && typeof response.headers.get === "function"
        ? response.headers.get("content-type") || ""
        : "";

    const text = await response.text();
    if (typeof text !== "string" || text.length > MAX_RESPONSE_CHARS) {
      console.warn("[LGS Feedback] Response body too long or non-string");
      return { ok: false, error: "feedback_bad_response" };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.warn("[LGS Feedback] Failed to parse JSON:", error);
      return { ok: false, error: "feedback_bad_response" };
    }

    const success = parsed && (parsed.success === true || parsed.success === "true");
    if (!success) {
      console.warn("[LGS Feedback] Server rejected request payload:", parsed);
    }
    return success
      ? { ok: true }
      : { ok: false, error: "feedback_rejected" };

  } catch (error) {
    // THIS IS WHERE CORS / NETWORK ERRORS END UP
    console.warn("[LGS Feedback] Fetch threw an exception:", error);
    return { ok: false, error: "feedback_send_failed" };
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

  return {
    MSG_TYPE,
    FEEDBACK_ENDPOINT,
    MAX_EXPECTED_LENGTH,
    REQUEST_TIMEOUT_MS,
    jobUrl,
    validateReport,
    submitReport,
  };
});
