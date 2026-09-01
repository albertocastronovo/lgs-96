"use strict";

importScripts("localization.js", "cloud-cache.js");

const cloudModule = globalThis.LgsCloudCache;
const localizationModule = globalThis.LgsLocalization;
const CLOUD_LOOKUP_MSG = cloudModule ? cloudModule.MSG_TYPE : "lgs96:cloudLookup";
const LOCALIZATION_MSG = localizationModule
  ? localizationModule.MSG_TYPE
  : "lgs96:localizationGet";

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== CLOUD_LOOKUP_MSG) return;
    handleCloudLookup(message)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "cloud_lookup_failed" }));
    return true;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== LOCALIZATION_MSG) return;
    handleLocalizationGet()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "localization_unavailable" }));
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

async function loadCatalog(locale) {
  const url = chrome.runtime.getURL(
    localizationModule.CATALOG_BASE_PATH + locale + ".yaml"
  );
  const response = await fetch(url);
  if (!response.ok) return null;
  const text = await response.text();
  const built = localizationModule.buildCatalog(locale, text);
  return built.valid ? built : null;
}

async function handleLocalizationGet() {
  if (!localizationModule) return { ok: false, error: "localization_unavailable" };
  const results = [];
  for (const locale of localizationModule.SUPPORTED_LOCALES) {
    try {
      results.push(await loadCatalog(locale));
    } catch (error) {
      results.push(null);
    }
  }
  const selected = localizationModule.selectCatalogs(results);
  let catalogs = selected.catalogs;
  let available = selected.available;
  if (!available.includes(localizationModule.DEFAULT_LOCALE)) {
    catalogs = Object.assign({}, catalogs);
    catalogs[localizationModule.DEFAULT_LOCALE] =
      localizationModule.FALLBACK_CATALOG;
    available = [localizationModule.DEFAULT_LOCALE].concat(available);
  }
  const stored = await localizationModule.getLanguage();
  const language = localizationModule.resolveActive(available, stored);
  if (language !== stored) await localizationModule.setLanguage(language);
  return { ok: true, language, available, catalogs };
}
