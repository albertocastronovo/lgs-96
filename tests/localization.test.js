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

test("italian placeholder parses but is not yet a selectable catalog", () => {
  assert.deepEqual(itBuilt.errors, []);
  assert.deepEqual(itBuilt.entries, {});
  assert.equal(itBuilt.valid, false);
  assert.deepEqual(itBuilt.missing, loc.REQUIRED_KEYS);
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
  const built = loc.buildCatalog("en", "good: \"yes\"\nbroken line\n");
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

test("selectCatalogs keeps only valid catalogs", () => {
  const { catalogs, available } = loc.selectCatalogs([enBuilt, itBuilt, null]);
  assert.deepEqual(available, ["en"]);
  assert.deepEqual(catalogs.en, enBuilt.entries);
  assert.equal(catalogs.it, undefined);
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
    "Fetching salary info"
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

test("generated chrome locales match the yaml catalogs", () => {
  const messagesPath = path.join(root, "extension", "_locales", "en", "messages.json");
  const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
  for (const [key, value] of Object.entries(enBuilt.entries)) {
    assert.equal(messages[key].message, value, key);
  }
  assert.equal(fs.existsSync(path.join(root, "extension", "_locales", "it")), false);
  const generated = generator.buildMessagesForCatalog(enBuilt.entries);
  assert.deepEqual(generated, messages);
});

test("manifest uses chrome locale placeholders and the new version", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8")
  );
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extension_name__");
  assert.equal(manifest.description, "__MSG_extension_description__");
  assert.equal(manifest.action.default_title, "__MSG_extension_action_title__");
  assert.equal(manifest.version, "0.10.0");
  assert.ok(manifest.content_scripts[0].js.includes("src/localization.js"));
});
