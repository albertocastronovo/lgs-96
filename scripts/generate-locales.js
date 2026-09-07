const fs = require("fs");
const path = require("path");

const localization = require("../extension/src/localization.js");

const root = path.join(__dirname, "..");
const localizationDir = path.join(root, "extension", "localization");
const localesDir = path.join(root, "extension", "_locales");

function buildMessagesForCatalog(entries) {
  const messages = {};
  for (const [key, value] of Object.entries(entries)) {
    messages[key] = { message: value };
  }
  return messages;
}

function generateLocale(file) {
  const locale = file.slice(0, -".yaml".length);
  if (!localization.SUPPORTED_LOCALES.includes(locale)) {
    return { locale, generated: false, reason: "unsupported locale code" };
  }
  const text = fs.readFileSync(path.join(localizationDir, file), "utf8");
  const built = localization.buildCatalog(locale, text);
  if (!built.valid) {
    const parts = [];
    if (built.errors.length > 0) parts.push(built.errors.join("; "));
    if (built.missing.length > 0) parts.push(`missing keys: ${built.missing.join(", ")}`);
    if (built.empty.length > 0) parts.push(`empty values: ${built.empty.join(", ")}`);
    return { locale, generated: false, reason: parts.join(" | ") };
  }
  const outDir = path.join(localesDir, locale);
  fs.mkdirSync(outDir, { recursive: true });
  const messages = buildMessagesForCatalog(built.entries);
  fs.writeFileSync(
    path.join(outDir, "messages.json"),
    `${JSON.stringify(messages, null, 2)}\n`
  );
  return { locale, generated: true };
}

function main() {
  if (!fs.existsSync(localizationDir)) {
    throw new Error(`localization folder not found: ${localizationDir}`);
  }
  fs.mkdirSync(localesDir, { recursive: true });
  const files = fs
    .readdirSync(localizationDir)
    .filter((file) => file.endsWith(".yaml"))
    .sort();
  const generated = [];
  for (const file of files) {
    const outcome = generateLocale(file);
    if (outcome.generated) {
      generated.push(outcome.locale);
      console.log(`generated _locales/${outcome.locale}/messages.json`);
    } else {
      console.warn(`skipped ${file}: ${outcome.reason}`);
    }
  }
  if (!generated.includes(localization.DEFAULT_LOCALE)) {
    throw new Error("default locale catalog is missing or invalid; cannot package");
  }
  console.log(`done: ${generated.join(", ")}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildMessagesForCatalog, generateLocale };
