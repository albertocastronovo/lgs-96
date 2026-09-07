"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PAGES_DIR = path.join(__dirname, "..", "pages");

const SCRIPT_RE = /<script\b[\s\S]*?<\/script\s*>/gi;
const NOSCRIPT_RE = /<noscript\b[\s\S]*?<\/noscript\s*>/gi;

function reset(re) {
  re.lastIndex = 0;
  return re;
}
const INLINE_EVENT_RE = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const PROFILE_HANDLE_RE = /(\/in\/)[^\/"'?&\s<)]+/gi;
const URL_ATTR_RE = /\b(href|src|data-url|content)="([^"]*)"/gi;
const PROFILE_ARIA_RE = /\b(aria-label)="([^"]*profile[^"]*)"/gi;
const HIDDEN_INPUT_VALUE_RE = /(<input[^>]*type="hidden"[^>]*\bvalue=")([^"]{33,})(")/gi;

function stripTrackingParams(url) {
  if (!url || !url.includes("?")) return url;
  return url.replace(/\?([^"]*)$/, (match, query) => {
    const kept = query
      .split("&")
      .filter((pair) => pair.startsWith("currentJobId="));
    return kept.length > 0 ? `?${kept.join("&")}` : "";
  });
}

function sanitize(html) {
  return html
    .replace(SCRIPT_RE, "")
    .replace(NOSCRIPT_RE, "")
    .replace(INLINE_EVENT_RE, "")
    .replace(URL_ATTR_RE, (match, attr, value) => `${attr}="${stripTrackingParams(value)}"`)
    .replace(PROFILE_HANDLE_RE, "$1redacted-person")
    .replace(PROFILE_ARIA_RE, '$1="View profile"')
    .replace(HIDDEN_INPUT_VALUE_RE, "$1REDACTED$3");
}

function isSanitized(html) {
  const scriptFree = !reset(SCRIPT_RE).test(html) && !reset(NOSCRIPT_RE).test(html);
  reset(SCRIPT_RE);
  reset(NOSCRIPT_RE);
  return scriptFree;
}

function main() {
  const files = fs
    .readdirSync(PAGES_DIR)
    .filter((name) => name.endsWith(".html"))
    .sort();
  for (const name of files) {
    const filePath = path.join(PAGES_DIR, name);
    const original = fs.readFileSync(filePath, "utf8");
    if (isSanitized(original)) {
      console.log(`${name}: already sanitized`);
      continue;
    }
    const cleaned = sanitize(original);
    if (isSanitized(cleaned)) {
      fs.writeFileSync(filePath, cleaned);
      const before = Buffer.byteLength(original, "utf8");
      const after = Buffer.byteLength(cleaned, "utf8");
      console.log(`${name}: ${before} -> ${after} bytes (-${Math.round((1 - after / before) * 100)}%)`);
    } else {
      console.error(`${name}: sanitization incomplete, file left untouched`);
      process.exitCode = 1;
    }
  }
}

main();
