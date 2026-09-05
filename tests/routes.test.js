const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const routes = require(path.join(__dirname, "..", "extension", "src", "routes.js"));

test("supported jobs-list routes", () => {
  const supported = [
    "/jobs",
    "/jobs/",
    "/jobs/search",
    "/jobs/search/",
    "/jobs/search-results",
    "/jobs/search-results/",
    "/jobs/collections",
    "/jobs/collections/",
    "/jobs/collections/recommended",
    "/jobs/collections/recommended/",
    "/search/results/all",
    "/search/results/all/",
  ];
  for (const pathname of supported) {
    assert.equal(routes.isSupportedJobsList(pathname), true, pathname);
  }
});

test("unsupported routes", () => {
  const unsupported = [
    "/",
    "/feed",
    "/jobs/view/4409689585",
    "/jobs/view/",
    "/jobs/preferences/",
    "/jobs/candidate/123",
    "/jobsearch",
    "/jobs2",
    "/jobs/search-resultsfoo",
    "/myprefs",
    "/search/results/people",
    "/search/results/content",
    "/search/results/jobs",
    "/search/results/allies",
    "/search",
    "/search/results",
  ];
  for (const pathname of unsupported) {
    assert.equal(routes.isSupportedJobsList(pathname), false, pathname);
  }
});

test("extract job id from card hrefs", () => {
  const base = "https://www.linkedin.com/jobs/";
  assert.equal(
    routes.extractJobIdFromHref("/jobs/search-results/?currentJobId=4442308589&keywords=test", base),
    "4442308589"
  );
  assert.equal(routes.extractJobIdFromHref("/jobs/search/?foo=1", base), null);
  assert.equal(routes.extractJobIdFromHref("/jobs/search-results/?currentJobId=abc", base), null);
  assert.equal(routes.extractJobIdFromHref("", base), null);
  assert.equal(routes.extractJobIdFromHref("javascript:void(0)", base), null);
  assert.equal(
    routes.extractJobIdFromHref(
      "https://www.linkedin.com/jobs/search-results/?trk=x&currentJobId=4457225503",
      base
    ),
    "4457225503"
  );
});

test("extract job id from exact view-path hrefs", () => {
  const base = "https://www.linkedin.com/jobs/collections/recommended/";
  assert.equal(routes.extractJobIdFromHref("/jobs/view/4357401933/", base), "4357401933");
  assert.equal(
    routes.extractJobIdFromHref("/jobs/view/4357401933/?trackingId=x", base),
    "4357401933"
  );
  assert.equal(routes.extractJobIdFromHref("/jobs/view/4357401933/apply/", base), null);
  assert.equal(routes.extractJobIdFromHref("/jobs/view/", base), null);
});
