"use strict";

// Firefox exposes both `browser` (promise-based) and `chrome` (callback-only).
// Every module in this extension calls `chrome.*` and awaits the result, which
// only works on the promise-based namespace. Aliasing `chrome` to `browser` on
// Firefox makes the same calls work unmodified on both browsers. On Chrome,
// `browser` is undefined, so this is a no-op.
if (typeof globalThis.browser !== "undefined") {
  globalThis.chrome = globalThis.browser;
}
