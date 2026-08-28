(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsRoutes = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const SUPPORTED_PATH_RE =
    /^\/jobs\/?(?:$|\/(?:search|search-results|collections)(?:\/.*)?$)/;
  const VIEW_PATH_RE = /^\/jobs\/view\/(\d+)\/?$/;

  function isSupportedJobsList(pathname) {
    return SUPPORTED_PATH_RE.test(String(pathname || ""));
  }

  function extractJobIdFromHref(href, baseURL) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, baseURL);
    } catch (error) {
      return null;
    }
    if (!url.pathname.startsWith("/jobs/")) return null;
    const queryId = url.searchParams.get("currentJobId");
    if (queryId && /^\d+$/.test(queryId)) return queryId;
    const viewMatch = url.pathname.match(VIEW_PATH_RE);
    return viewMatch ? viewMatch[1] : null;
  }

  return { isSupportedJobsList, extractJobIdFromHref };
});
