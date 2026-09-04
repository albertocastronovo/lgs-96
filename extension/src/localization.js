(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LgsLocalization = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const SETTING_KEY = "lgs96:language";
  const MSG_TYPE = "lgs96:localizationGet";
  const DEFAULT_LOCALE = "en";
  const SUPPORTED_LOCALES = ["en", "it"];
  const CATALOG_BASE_PATH = "localization/";

  const REQUIRED_KEYS = [
    "language_name",
    "extension_name",
    "extension_description",
    "extension_action_title",
    "popup_document_title",
    "popup_subtitle",
    "popup_language_label",
    "popup_request_frequency_label",
    "popup_request_frequency_slow",
    "popup_request_frequency_average",
    "popup_request_frequency_fast",
    "popup_request_frequency_hint",
    "popup_local_cache",
    "popup_cloud_cache",
    "popup_cloud_coming_soon",
    "popup_disclaimer",
    "popup_cached_jobs",
    "popup_cache_unavailable",
    "popup_clear_cache",
    "badge_loading",
    "badge_none",
    "badge_error",
    "badge_report_action",
    "feedback_reported",
    "feedback_title",
    "feedback_description",
    "feedback_expected_label",
    "feedback_expected_none",
    "feedback_expected_single",
    "feedback_expected_range",
    "feedback_correction_label",
    "feedback_correction_placeholder",
    "feedback_correction_required",
    "feedback_char_count",
    "feedback_disclosure",
    "feedback_privacy_link",
    "feedback_cancel",
    "feedback_submit",
    "feedback_submitting",
    "feedback_close",
    "feedback_thanks_title",
    "feedback_thanks",
    "feedback_error",
  ];

  const FALLBACK_CATALOG = {
    language_name: "English",
    extension_name: "LGS-96",
    extension_description:
      "Flags LinkedIn job cards with salary-information status (Italian D.Lgs. 96/2026).",
    extension_action_title: "LGS-96",
    popup_document_title: "LGS-96",
    popup_subtitle: "Settings",
    popup_language_label: "Language",
    popup_request_frequency_label: "Request frequency",
    popup_request_frequency_slow: "Slow (every 2.5 s)",
    popup_request_frequency_average: "Average (every 1.6 s)",
    popup_request_frequency_fast: "Fast (every 1 s)",
    popup_request_frequency_hint:
      "Choose a slower pace if salary checks fail or cards seem stuck.",
    popup_local_cache: "Local cache",
    popup_cloud_cache: "Cloud cache",
    popup_cloud_coming_soon: "Coming soon",
    popup_disclaimer:
      "Results are extracted automatically and may be incomplete or wrong.",
    popup_cached_jobs: "Cached jobs: {count}",
    popup_cache_unavailable: "Cache unavailable",
    popup_clear_cache: "Clear cache",
    badge_loading: "Fetching salary info...",
    badge_none: "Salary not detected",
    badge_error: "Salary check failed",
    badge_report_action: "Report an incorrect result",
    feedback_reported: "Result reported",
    feedback_title: "Report an incorrect result",
    feedback_description:
      "Report for job {jobId}. Tell us what the posting actually contains.",
    feedback_expected_label: "This posting contains",
    feedback_expected_none: "No salary information",
    feedback_expected_single: "A single salary value",
    feedback_expected_range: "A salary range",
    feedback_correction_label: "What should it show? (max 50 characters)",
    feedback_correction_placeholder: "e.g. 35k - 45k EUR",
    feedback_correction_required: "Please describe what the posting should show.",
    feedback_char_count: "{count}/50",
    feedback_disclosure:
      "Submitting sends the job ID and your feedback via FormSubmit to the extension author. See the Privacy Policy.",
    feedback_privacy_link: "Privacy Policy",
    feedback_cancel: "Cancel",
    feedback_submit: "Submit",
    feedback_submitting: "Sending...",
    feedback_close: "Close",
    feedback_thanks_title: "Thank you!",
    feedback_thanks: "Your report helps make LGS-96 more accurate.",
    feedback_error:
      "Something went wrong while sending your report. Please try again.",
  };

  function storage() {
    const chromeApi = typeof chrome !== "undefined" ? chrome : null;
    return chromeApi && chromeApi.storage && chromeApi.storage.local
      ? chromeApi.storage.local
      : null;
  }

  function parseFlatYaml(text) {
    const entries = {};
    const errors = [];
    if (typeof text !== "string") {
      return { entries, errors: ["catalog is not text"] };
    }
    const lines = text.split(/\r?\n/);
    const lineRe = /^([A-Za-z0-9_]+):\s"((?:[^"\\]|\\.)*)"\s*$/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "" || line.startsWith("#")) continue;
      const match = lineRe.exec(line);
      if (!match) {
        errors.push(`line ${i + 1}: invalid syntax`);
        continue;
      }
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(entries, key)) {
        errors.push(`line ${i + 1}: duplicate key "${key}"`);
        continue;
      }
      let value;
      try {
        value = JSON.parse(`"${match[2]}"`);
      } catch (error) {
        errors.push(`line ${i + 1}: invalid quoted value`);
        continue;
      }
      entries[key] = value;
    }
    return { entries, errors };
  }

  function validateCatalog(entries) {
    const missing = [];
    const empty = [];
    for (const key of REQUIRED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(entries, key)) {
        missing.push(key);
      } else if (typeof entries[key] !== "string" || entries[key].length === 0) {
        empty.push(key);
      }
    }
    return { valid: missing.length === 0 && empty.length === 0, missing, empty };
  }

  function buildCatalog(locale, text) {
    const { entries, errors } = parseFlatYaml(text);
    const validation = validateCatalog(entries);
    return {
      locale,
      entries,
      errors,
      missing: validation.missing,
      empty: validation.empty,
      valid: validation.valid && errors.length === 0,
      languageName: entries.language_name || null,
    };
  }

  function selectCatalogs(builtResults) {
    const catalogs = {};
    const available = [];
    for (const built of builtResults) {
      if (built && built.valid) {
        catalogs[built.locale] = built.entries;
        available.push(built.locale);
      }
    }
    return { catalogs, available };
  }

  function resolveActive(available, stored) {
    const locales = Array.isArray(available) ? available : [];
    if (locales.includes(stored)) return stored;
    if (locales.includes(DEFAULT_LOCALE)) return DEFAULT_LOCALE;
    return locales.length > 0 ? locales[0] : DEFAULT_LOCALE;
  }

  function interpolate(template, params) {
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
      params && Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match
    );
  }

  function translate(entries, key, params) {
    if (!entries || !Object.prototype.hasOwnProperty.call(entries, key)) return null;
    const template = entries[key];
    if (typeof template !== "string") return null;
    return params ? interpolate(template, params) : template;
  }

  function textFromCatalogs(catalogs, locale, key, params) {
    const entries =
      (catalogs && catalogs[locale]) ||
      (catalogs && catalogs[DEFAULT_LOCALE]) ||
      FALLBACK_CATALOG;
    const value = translate(entries, key, params);
    if (value !== null) return value;
    return translate(FALLBACK_CATALOG, key, params);
  }

  async function getLanguage() {
    const local = storage();
    if (!local) return DEFAULT_LOCALE;
    try {
      const data = await local.get(SETTING_KEY);
      const stored = data ? data[SETTING_KEY] : null;
      return SUPPORTED_LOCALES.includes(stored) ? stored : DEFAULT_LOCALE;
    } catch (error) {
      return DEFAULT_LOCALE;
    }
  }

  async function setLanguage(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) return false;
    const local = storage();
    if (!local) return false;
    try {
      await local.set({ [SETTING_KEY]: locale });
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    SETTING_KEY,
    MSG_TYPE,
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    CATALOG_BASE_PATH,
    REQUIRED_KEYS,
    FALLBACK_CATALOG,
    parseFlatYaml,
    validateCatalog,
    buildCatalog,
    selectCatalogs,
    resolveActive,
    interpolate,
    translate,
    textFromCatalogs,
    getLanguage,
    setLanguage,
  };
});
