"use strict";

/**
 * Generates extension/manifest.firefox.json from extension/manifest.json.
 *
 * Also usable as a module: scripts/package.js requires buildFirefoxManifest()
 * and serializeManifest() to verify that the committed file is in sync before
 * it builds the Firefox ZIP.
 *
 * The two manifests differ in exactly three ways:
 *   1. background.service_worker  ->  background.scripts (Firefox MV3 has no
 *      service worker background; it uses non-persistent event pages).
 *   2. browser_specific_settings.gecko is added (required to sign on AMO).
 *   3. nothing else. Everything else must stay byte-identical, which is the
 *      whole point of generating instead of hand-maintaining a second file.
 *
 * Usage:
 *   node scripts/build-firefox-manifest.js          # write the file
 *   node scripts/build-firefox-manifest.js --check  # fail if out of sync (CI)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXTENSION_DIR = path.join(ROOT, "extension");
const SOURCE = path.join(EXTENSION_DIR, "manifest.json");
const TARGET = path.join(EXTENSION_DIR, "manifest.firefox.json");

const GECKO_ID = "lgs-96@albertocastronovo.dev";
const STRICT_MIN_VERSION = "128.0";

// Order matters: these are loaded into a single shared global scope, exactly
// like the importScripts() call at the top of background.js does on Chrome.
const BACKGROUND_SCRIPTS = [
  "src/compat.js",
  "src/localization.js",
  "src/feedback.js",
  "src/background.js"
];

function buildFirefoxManifest(chromeManifest) {
  const manifest = JSON.parse(JSON.stringify(chromeManifest));

  if (!manifest.background || !manifest.background.service_worker) {
    throw new Error(
      "expected background.service_worker in the Chrome manifest; " +
      "the generator needs updating"
    );
  }

  manifest.background = { scripts: BACKGROUND_SCRIPTS.slice() };
  manifest.browser_specific_settings = {
    gecko: { id: GECKO_ID, strict_min_version: STRICT_MIN_VERSION }
  };

  return manifest;
}

function assertScriptsExist(scripts) {
  const missing = scripts.filter(
    (relative) => !fs.existsSync(path.join(EXTENSION_DIR, relative))
  );
  if (missing.length) {
    throw new Error("background scripts not found: " + missing.join(", "));
  }
}

function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2) + "\n";
}

function main() {
  const chromeManifest = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const firefoxManifest = buildFirefoxManifest(chromeManifest);
  assertScriptsExist(firefoxManifest.background.scripts);

  const output = serializeManifest(firefoxManifest);

  if (process.argv.includes("--check")) {
    const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : "";
    if (current !== output) {
      console.error(
        "manifest.firefox.json is out of sync with manifest.json.\n" +
        "Run: node scripts/build-firefox-manifest.js"
      );
      process.exit(1);
    }
    console.log("manifest.firefox.json is in sync.");
    return;
  }

  fs.writeFileSync(TARGET, output);
  console.log("wrote " + path.relative(ROOT, TARGET));
}

if (require.main === module) {
  main();
}

module.exports = { buildFirefoxManifest, serializeManifest, SOURCE, TARGET };
