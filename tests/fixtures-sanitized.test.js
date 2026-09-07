const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PAGES_DIR = path.join(__dirname, "..", "pages");

const FORBIDDEN = [
  [/media\.licdn\.com/gi, "licdn image URLs"],
  [/ACoAA[A-Za-z0-9_-]{10,}/g, "LinkedIn profile tokens"],
  [/urn:li:member:\d/g, "numeric member URNs"],
  [/Alberto|Castronovo|Politecnico/gi, "author identity"],
  [/applied scientist/gi, "captured search query"],
  [/\/in\/(?!redacted-person)[^"'\s>/?&]+/g, "real /in/ profile handles"],
  [/<code\b/gi, "serialized state blocks"],
];

test("fixtures carry no personal or third-party data", () => {
  const files = fs
    .readdirSync(PAGES_DIR)
    .filter((name) => name.endsWith(".html"))
    .sort();
  assert.ok(files.length >= 5, "all fixtures present");
  for (const name of files) {
    const html = fs.readFileSync(path.join(PAGES_DIR, name), "utf8");
    for (const [pattern, label] of FORBIDDEN) {
      const matches = [...html.matchAll(pattern)];
      assert.equal(matches.length, 0, `${name}: ${label}`);
    }
    const emails = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g) || []).filter(
      (match) => !/@\dx\.png$/i.test(match)
    );
    assert.equal(emails.length, 0, `${name}: email addresses`);
  }
});
