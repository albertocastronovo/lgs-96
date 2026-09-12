"use strict";

importScripts("localization.js", "feedback.js");

const localizationModule = globalThis.LgsLocalization;
const feedbackModule = globalThis.LgsFeedback;
const LOCALIZATION_MSG = localizationModule
  ? localizationModule.MSG_TYPE
  : "lgs96:localizationGet";
const FEEDBACK_MSG = feedbackModule ? feedbackModule.MSG_TYPE : "lgs96:feedbackSubmit";

try {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove("lgs96:cloudCacheEnabled");
  }
} catch (error) {
  /* storage unavailable */
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== LOCALIZATION_MSG) return;
    handleLocalizationGet()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "localization_unavailable" }));
    return true;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== FEEDBACK_MSG) return;
    handleFeedbackSubmit(message)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "feedback_send_failed" }));
    return true;
  });
}

async function handleFeedbackSubmit(message) {
  if (!feedbackModule) return { ok: false, error: "feedback_unavailable" };
  return feedbackModule.submitReport(
    message && message.payload,
    (url, init) => fetch(url, init)
  );
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
