(() => {
  "use strict";

  const cache = globalThis.LgsCache;
  const cloudCache = globalThis.LgsCloudCache;
  const localization = globalThis.LgsLocalization;

  const brand = document.getElementById("popup-brand");
  const subtitle = document.getElementById("popup-subtitle");
  const languageLabel = document.getElementById("language-label");
  const languageSelect = document.getElementById("language-select");
  const localCacheLabel = document.getElementById("local-cache-label");
  const cloudCacheText = document.getElementById("cloud-cache-text");
  const cloudPreview = document.getElementById("cloud-preview");
  const toggle = document.getElementById("cache-toggle");
  const cloudToggle = document.getElementById("cloud-toggle");
  const countLabel = document.getElementById("cache-count");
  const clearButton = document.getElementById("clear-cache");

  let catalogs = null;
  let language = localization ? localization.DEFAULT_LOCALE : "en";
  let available = [];

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          resolve(error ? null : response || null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function t(key, params) {
    if (!localization) return "";
    return localization.textFromCatalogs(catalogs, language, key, params) || "";
  }

  async function loadState() {
    if (!localization) return;
    const response = await sendRuntimeMessage({ type: localization.MSG_TYPE });
    if (response && response.ok && response.catalogs) {
      catalogs = response.catalogs;
      language = response.language;
      available = response.available || [];
      return;
    }
    catalogs = { [localization.DEFAULT_LOCALE]: localization.FALLBACK_CATALOG };
    language = localization.DEFAULT_LOCALE;
    available = [localization.DEFAULT_LOCALE];
  }

  function renderLanguageOptions() {
    languageSelect.textContent = "";
    for (const locale of available) {
      const option = document.createElement("option");
      option.value = locale;
      option.textContent =
        localization.textFromCatalogs(catalogs, locale, "language_name") || locale;
      languageSelect.appendChild(option);
    }
    languageSelect.value = language;
    languageSelect.disabled = available.length === 0;
  }

  async function refreshCount() {
    if (!cache) {
      countLabel.textContent = t("popup_cache_unavailable");
      return;
    }
    const count = await cache.getCacheSize();
    countLabel.textContent = localization.interpolate(t("popup_cached_jobs"), {
      count,
    });
  }

  async function render() {
    document.title = t("popup_document_title");
    brand.textContent = t("extension_name");
    subtitle.textContent = t("popup_subtitle");
    languageLabel.textContent = t("popup_language_label");
    renderLanguageOptions();
    localCacheLabel.textContent = t("popup_local_cache");
    cloudCacheText.textContent = t("popup_cloud_cache");
    cloudPreview.textContent = t("popup_preview");
    clearButton.textContent = t("popup_clear_cache");
    await refreshCount();
  }

  async function init() {
    if (!localization) {
      toggle.disabled = true;
      cloudToggle.disabled = true;
      clearButton.disabled = true;
      countLabel.textContent = "Cache unavailable";
      return;
    }
    await loadState();
    await render();

    if (!cache) {
      toggle.disabled = true;
      clearButton.disabled = true;
    } else {
      toggle.checked = await cache.getCacheEnabled();
      toggle.addEventListener("change", async () => {
        await cache.setCacheEnabled(toggle.checked);
        await refreshCount();
      });
      clearButton.addEventListener("click", async () => {
        clearButton.disabled = true;
        await cache.clearCache();
        await refreshCount();
        clearButton.disabled = false;
      });
    }

    if (!cloudCache) {
      cloudToggle.disabled = true;
    } else {
      cloudToggle.checked = await cloudCache.getCloudCacheEnabled();
      cloudToggle.addEventListener("change", async () => {
        await cloudCache.setCloudCacheEnabled(cloudToggle.checked);
      });
    }

    languageSelect.addEventListener("change", async () => {
      await localization.setLanguage(languageSelect.value);
      await loadState();
      await render();
    });
  }

  init();
})();
