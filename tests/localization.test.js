const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

function createFakeChrome() {
  const data = new Map();
  return {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (keys === null || keys === undefined) return Object.fromEntries(data);
            const out = {};
            for (const key of [].concat(keys)) if (data.has(key)) out[key] = data.get(key);
            return out;
          },
          async set(operations) {
            for (const [key, value] of Object.entries(operations)) data.set(key, value);
          },
          async remove(keys) {
            for (const key of [].concat(keys)) data.delete(key);
          },
        },
      },
    },
    data,
  };
}

function install(fake) {
  globalThis.chrome = fake.chrome;
  return fake;
}

install(createFakeChrome());
const root = path.join(__dirname, "..");
const loc = require(path.join(root, "extension", "src", "localization.js"));
const generator = require(path.join(root, "scripts", "generate-locales.js"));

const enText = fs.readFileSync(path.join(root, "extension", "localization", "en.yaml"), "utf8");
const itText = fs.readFileSync(path.join(root, "extension", "localization", "it.yaml"), "utf8");
const enBuilt = loc.buildCatalog("en", enText);
const itBuilt = loc.buildCatalog("it", itText);

test("english catalog parses without errors and contains every required key", () => {
  assert.deepEqual(enBuilt.errors, []);
  assert.equal(enBuilt.valid, true);
  assert.equal(enBuilt.languageName, "English");
  const parsed = loc.parseFlatYaml(enText);
  for (const key of loc.REQUIRED_KEYS) {
    assert.equal(typeof parsed.entries[key], "string", key);
    assert.ok(parsed.entries[key].length > 0, key);
  }
});

test("italian catalog is complete, valid and selectable", () => {
  assert.deepEqual(itBuilt.errors, []);
  assert.equal(itBuilt.valid, true);
  assert.equal(itBuilt.languageName, "Italiano");
  for (const key of loc.REQUIRED_KEYS) {
    assert.equal(typeof itBuilt.entries[key], "string", key);
    assert.ok(itBuilt.entries[key].length > 0, key);
  }
});

test("salary-not-detected wording replaces definitive absence", () => {
  assert.equal(enBuilt.entries.badge_none, "Salary not detected");
  assert.equal(itBuilt.entries.badge_none, "RAL non rilevata");
});

test("cloud cache is presented as coming soon in both catalogs", () => {
  assert.equal(enBuilt.entries.popup_cloud_coming_soon, "Coming soon");
  assert.equal(itBuilt.entries.popup_cloud_coming_soon, "Prossimamente");
});

test("built-in fallback matches the english yaml exactly", () => {
  assert.deepEqual(loc.FALLBACK_CATALOG, enBuilt.entries);
});

test("parser accepts comments, blank lines and escaped quotes", () => {
  const parsed = loc.parseFlatYaml(
    '# header comment\n\na_key: "He said \\"hi\\""\nanother: "back\\\\slash"\n   # indented comment\n'
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries.a_key, 'He said "hi"');
  assert.equal(parsed.entries.another, "back\\slash");
});

test("parser rejects invalid syntax", () => {
  const parsed = loc.parseFlatYaml(
    'good: "yes"\nbad line here\nsingle: \'nope\'\nplain: unquoted\n'
  );
  assert.deepEqual(parsed.entries, { good: "yes" });
  assert.equal(parsed.errors.length, 3);
  const built = loc.buildCatalog("en", 'good: "yes"\nbroken line\n');
  assert.equal(built.valid, false);
});

test("duplicate keys are rejected and the first value is kept", () => {
  const parsed = loc.parseFlatYaml('k: "first"\nk: "second"\n');
  assert.equal(parsed.entries.k, "first");
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /duplicate key "k"/);
});

test("empty values invalidate a catalog", () => {
  const entries = Object.assign({}, loc.FALLBACK_CATALOG, { badge_none: "" });
  const validation = loc.validateCatalog(entries);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.empty, ["badge_none"]);
});

test("missing required keys are reported", () => {
  const validation = loc.validateCatalog({});
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.missing, loc.REQUIRED_KEYS);
});

test("interpolation replaces known params and keeps unknown ones", () => {
  assert.equal(loc.interpolate("Cached jobs: {count}", { count: 7 }), "Cached jobs: 7");
  assert.equal(loc.interpolate("{keep}", {}), "{keep}");
  assert.equal(loc.interpolate("{a}{b}", { a: 1, b: "x" }), "1x");
});

test("selectCatalogs keeps every valid catalog", () => {
  const { catalogs, available } = loc.selectCatalogs([enBuilt, itBuilt, null]);
  assert.deepEqual(available, ["en", "it"]);
  assert.deepEqual(catalogs.en, enBuilt.entries);
  assert.deepEqual(catalogs.it, itBuilt.entries);
});

test("resolveActive prefers stored, then default, then first available", () => {
  assert.equal(loc.resolveActive(["en", "it"], "it"), "it");
  assert.equal(loc.resolveActive(["en"], "it"), "en");
  assert.equal(loc.resolveActive(["it"], "fr"), "it");
  assert.equal(loc.resolveActive([], "en"), "en");
});

test("textFromCatalogs resolves selected, then default, then builtin fallback", () => {
  const catalogs = { en: { badge_none: "Niente" } };
  assert.equal(loc.textFromCatalogs(catalogs, "en", "badge_none"), "Niente");
  assert.equal(
    loc.textFromCatalogs(catalogs, "en", "badge_loading"),
    "Fetching salary info..."
  );
  assert.equal(
    loc.textFromCatalogs(catalogs, "en", "popup_cached_jobs", { count: 2 }),
    "Cached jobs: 2"
  );
  assert.equal(
    loc.textFromCatalogs(null, "it", "badge_error"),
    "Salary check failed"
  );
  assert.equal(loc.textFromCatalogs(catalogs, "en", "not_a_key"), null);
});

test("language defaults to english and persists; unsupported codes rejected", async () => {
  install(createFakeChrome());
  assert.equal(await loc.getLanguage(), "en");
  assert.equal(await loc.setLanguage("fr"), false);
  assert.equal(await loc.getLanguage(), "en");
  assert.equal(await loc.setLanguage("it"), true);
  assert.equal(await loc.getLanguage(), "it");
  assert.equal(await loc.setLanguage("en"), true);
  assert.equal(await loc.getLanguage(), "en");
});

test("language defaults to english without storage", async () => {
  const saved = globalThis.chrome;
  globalThis.chrome = undefined;
  try {
    assert.equal(await loc.getLanguage(), "en");
    assert.equal(await loc.setLanguage("it"), false);
  } finally {
    globalThis.chrome = saved;
  }
});

test("generated chrome locales match every yaml catalog", () => {
  for (const built of [enBuilt, itBuilt]) {
    const messagesPath = path.join(
      root,
      "extension",
      "_locales",
      built.locale,
      "messages.json"
    );
    const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
    for (const [key, value] of Object.entries(built.entries)) {
      assert.equal(messages[key].message, value, `${built.locale}:${key}`);
    }
    assert.deepEqual(generator.buildMessagesForCatalog(built.entries), messages);
  }
});

test("manifest packages the MVP: no cloud, feedback reporting enabled", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8")
  );
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extension_name__");
  assert.equal(manifest.description, "__MSG_extension_description__");
  assert.equal(manifest.action.default_title, "__MSG_extension_action_title__");
  assert.equal(manifest.version, "0.11.1");
  assert.deepEqual(manifest.host_permissions, ["https://formsubmit.co/*"]);

  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.includes("src/feedback.js"), "feedback.js loaded");
  assert.ok(scripts.includes("src/scheduler.js"), "scheduler.js loaded");
  assert.ok(scripts.includes("src/localization.js"), "localization.js loaded");
  assert.equal(scripts.includes("src/cloud-cache.js"), false, "cloud-cache.js not loaded");
});

test("popup hard-disables cloud cache and drops its module", () => {
  const html = fs.readFileSync(
    path.join(root, "extension", "popup", "popup.html"),
    "utf8"
  );
  assert.equal(/input[^>]*id="cloud-toggle"/.test(html), false);
  assert.equal(html.includes("src/cloud-cache.js"), false);
  assert.ok(html.includes('id="cloud-preview"'), "coming-soon tag present");
  assert.ok(html.includes("popup__row--disabled"), "cloud row disabled");
  assert.ok(html.includes('id="popup-disclaimer"'), "disclaimer present");
  assert.ok(html.indexOf("language-select") < html.indexOf("cache-toggle"), "language first");
});
