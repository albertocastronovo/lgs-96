"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const EXTENSION_DIR = path.join(ROOT, "extension");
const DIST_DIR = path.join(ROOT, "dist");

const ZIP_INCLUDE = [
  "icons/favicon-16x16.png",
  "icons/favicon-32x32.png",
  "icons/android-chrome-192x192.png",
  "icons/android-chrome-512x512.png",
  "manifest.json",
  "popup/",
  "rules.json",
  "src/",
  "localization/",
  "_locales/",
];

const ROOT_FILES = ["PRIVACY.md"];

const ICONS_REQUIRED = [
  "icons/favicon-16x16.png",
  "icons/favicon-32x32.png",
  "icons/android-chrome-192x192.png",
  "icons/android-chrome-512x512.png",
];

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isIncludedDir(relative, include) {
  return include.some((pattern) =>
    pattern.endsWith("/")
      ? relative.startsWith(pattern) || pattern.startsWith(`${relative}/`)
      : pattern.startsWith(`${relative}/`)
  );
}

function isIncludedFile(relative, include) {
  return include.some((pattern) =>
    pattern.endsWith("/") ? relative.startsWith(pattern) : relative === pattern
  );
}

function collectFiles(baseDir, prefix, include, files) {
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (isIncludedDir(relative, include)) {
        collectFiles(path.join(baseDir, entry.name), relative, include, files);
      }
    } else if (entry.isFile() && isIncludedFile(relative, include)) {
      files.push(relative);
    }
  }
}

function assertManifestVersion() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf8")
  );
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error(`invalid manifest version: ${manifest.version}`);
  }
  return manifest.version;
}

function assertIcons() {
  for (const icon of ICONS_REQUIRED) {
    if (!fs.existsSync(path.join(EXTENSION_DIR, icon))) {
      throw new Error(
        `missing required icon: ${icon} (place ${ICONS_REQUIRED.join(", ")} in extension/icons/)`
      );
    }
  }
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function main() {
  const version = assertManifestVersion();
  assertIcons();

  const files = [];
  collectFiles(EXTENSION_DIR, "", ZIP_INCLUDE, files);
  for (const name of ROOT_FILES) {
    if (!fs.existsSync(path.join(ROOT, name))) {
      throw new Error(`missing required root file: ${name}`);
    }
    files.push(name);
  }
  files.sort();

  const entries = files.map((relative) => [
    relative,
    relative.endsWith(".md") && fs.existsSync(path.join(ROOT, relative)) &&
      !fs.existsSync(path.join(EXTENSION_DIR, relative))
      ? fs.readFileSync(path.join(ROOT, relative))
      : fs.readFileSync(path.join(EXTENSION_DIR, relative)),
  ]);

  const zip = buildZip(entries);
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const zipPath = path.join(DIST_DIR, `lgs-96-${version}.zip`);
  fs.writeFileSync(zipPath, zip);

  const sha256 = crypto.createHash("sha256").update(zip).digest("hex");
  fs.writeFileSync(path.join(DIST_DIR, `lgs-96-${version}.zip.sha256`), `${sha256}  lgs-96-${version}.zip\n`);

  console.log(`dist/lgs-96-${version}.zip (${zip.length} bytes, ${entries.length} files)`);
  console.log(`SHA-256: ${sha256}`);
}

main();
