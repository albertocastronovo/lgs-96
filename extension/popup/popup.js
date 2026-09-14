(() => {
  const cache = globalThis.LgsCache;
  const localization = globalThis.LgsLocalization;
  const scheduler = globalThis.LgsScheduler;
  const salaryFilter = globalThis.LgsSalaryFilter;

  const brand = document.getElementById("popup-brand");
  const subtitle = document.getElementById("popup-subtitle");
  const disclaimer = document.getElementById("popup-disclaimer");
  const helpLink = document.getElementById("help-link");
  const kofiButton = document.getElementById("kofi-button");
  const languageLabel = document.getElementById("language-label");
  const languageSelect = document.getElementById("language-select");
  const frequencyLabel = document.getElementById("request-frequency-label");
  const frequencySelect = document.getElementById("request-frequency-select");
  const frequencyHint = document.getElementById("request-frequency-hint");
  const filterLabel = document.getElementById("salary-filter-label");
  const filterToggle = document.getElementById("salary-filter-toggle");
  const salaryTargetLabel = document.getElementById("salary-target-label");
  const salaryToleranceLabel = document.getElementById(
    "salary-tolerance-label",
  );
  const salaryTargetInput = document.getElementById("salary-target");
  const salaryToleranceInput = document.getElementById("salary-tolerance");
  const filterHint = document.getElementById("salary-filter-hint");
  const localCacheLabel = document.getElementById("local-cache-label");
  const cloudCacheText = document.getElementById("cloud-cache-text");
  const cloudPreview = document.getElementById("cloud-preview");
  const toggle = document.getElementById("cache-toggle");
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
      } catch {
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
        localization.textFromCatalogs(catalogs, locale, "language_name") ||
        locale;
      languageSelect.appendChild(option);
    }
    languageSelect.value = language;
    languageSelect.disabled = available.length === 0;
  }

  async function renderFrequencyOptions() {
    frequencyLabel.textContent = t("popup_request_frequency_label");
    frequencyHint.textContent = t("popup_request_frequency_hint");
    frequencySelect.textContent = "";
    if (!scheduler) {
      frequencySelect.disabled = true;
      return;
    }
    const labels = {
      slow: "popup_request_frequency_slow",
      average: "popup_request_frequency_average",
      fast: "popup_request_frequency_fast",
    };
    for (const preset of ["slow", "average", "fast"]) {
      const option = document.createElement("option");
      option.value = preset;
      option.textContent = t(labels[preset]);
      frequencySelect.appendChild(option);
    }
    frequencySelect.value = await scheduler.getRequestFrequency();
    frequencySelect.disabled = false;
  }

  function filterFieldText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  async function renderSalaryFilter() {
    filterLabel.textContent = t("popup_salary_filter_label");
    filterHint.textContent = t("popup_salary_filter_hint");
    salaryTargetLabel.textContent = t("popup_salary_filter_target");
    salaryToleranceLabel.textContent = t("popup_salary_filter_tolerance");
    if (!salaryFilter) {
      filterToggle.disabled = true;
      salaryTargetInput.disabled = true;
      salaryToleranceInput.disabled = true;
      return;
    }
    const current = await salaryFilter.getSalaryFilter();
    filterToggle.checked = current.enabled;
    salaryTargetInput.value = filterFieldText(current.target);
    salaryToleranceInput.value = filterFieldText(current.tolerance);
  }

  async function saveSalaryFilter() {
    if (!salaryFilter) return;
    await salaryFilter.setSalaryFilter({
      enabled: filterToggle.checked,
      target: salaryTargetInput.value,
      tolerance: salaryToleranceInput.value,
    });
    const current = await salaryFilter.getSalaryFilter();
    filterToggle.checked = current.enabled;
    salaryTargetInput.value = filterFieldText(current.target);
    salaryToleranceInput.value = filterFieldText(current.tolerance);
  }

  function onTargetInput() {
    if (!filterToggle.checked && salaryTargetInput.value.trim() !== "") {
      filterToggle.checked = true;
    }
    saveSalaryFilter();
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
    document.documentElement.lang = language === "it" ? "it" : "en";
    document.title = t("popup_document_title");
    brand.textContent = t("extension_name");
    subtitle.textContent = t("popup_subtitle");
    disclaimer.textContent = t("popup_disclaimer");
    helpLink.textContent = t("popup_help");
    kofiButton.textContent = t("popup_support");
    languageLabel.textContent = t("popup_language_label");
    renderLanguageOptions();
    await renderFrequencyOptions();
    await renderSalaryFilter();
    localCacheLabel.textContent = t("popup_local_cache");
    cloudCacheText.textContent = t("popup_cloud_cache");
    cloudPreview.textContent = t("popup_cloud_coming_soon");
    clearButton.textContent = t("popup_clear_cache");
    await refreshCount();
  }

  async function init() {
    if (!localization) {
      toggle.disabled = true;
      clearButton.disabled = true;
      countLabel.textContent = "Cache unavailable";
      return;
    }
    await loadState();
    await render();

    if (cache) {
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
    } else {
      toggle.disabled = true;
      clearButton.disabled = true;
    }

    languageSelect.addEventListener("change", async () => {
      await localization.setLanguage(languageSelect.value);
      await loadState();
      await render();
    });

    frequencySelect.addEventListener("change", async () => {
      if (!scheduler) return;
      await scheduler.setRequestFrequency(frequencySelect.value);
    });

    filterToggle.addEventListener("change", saveSalaryFilter);
    salaryTargetInput.addEventListener("change", onTargetInput);
    salaryToleranceInput.addEventListener("change", saveSalaryFilter);
  }

  init();
})();
