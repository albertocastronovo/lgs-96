"use strict";

importScripts("cloud-cache.js");

const cloudModule = globalThis.LgsCloudCache;
const CLOUD_LOOKUP_MSG = cloudModule ? cloudModule.MSG_TYPE : "lgs96:cloudLookup";

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== CLOUD_LOOKUP_MSG) return;
    handleCloudLookup(message)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "cloud_lookup_failed" }));
    return true;
  });
}

async function handleCloudLookup(message) {
  if (!cloudModule) return { ok: false, error: "cloud_unavailable" };
  const enabled = await cloudModule.getCloudCacheEnabled();
  if (!enabled) return { ok: false, error: "cloud_disabled" };
  const jobIds = cloudModule.normalizeJobIds(message && message.jobIds);
  if (jobIds.length === 0) return { ok: true, hits: {} };
  return cloudModule.lookupSalaries(jobIds, (url, init) => fetch(url, init));
}
