# LGS-96

LGS-96 is an unofficial Chrome extension that shows salary information found in
LinkedIn job postings directly on the job cards of the search results. It takes its
name from the Italian transparency decree **D.Lgs. 96/2026**, which requires salary
ranges to be published in job postings.

**LGS-96 is not affiliated with, endorsed by, or connected to LinkedIn in any way.**

## Features

- A compact badge on each LinkedIn job card summarizes what the posting contains:
  - green: a narrow salary range,
  - amber: a broad range or a single approximate value,
  - red: no salary information detected in the posting,
  - grey: the check could not be completed.
- When a card has no native salary text, the extension reads the public job-posting
  page (rate limited, with backoff) and extracts the salary range from the
  description, with regional currency defaults and support for English and Italian
  postings.
- **Request frequency** setting (Slow / Average / Fast) controls the delay between
  requests to stay gentle on LinkedIn's infrastructure.
- Local cache of parsed results (3 days, can be disabled and cleared from the popup).
- English and Italian interfaces.
- Hover any badge and use the flag to report an incorrect result.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension/` folder.

## Privacy

The extension stores only parsed results and your preferences in your browser's
local extension storage. Job descriptions are parsed transiently in memory and are
never stored or sent anywhere. The only network destinations are LinkedIn (public
job-posting pages, exactly as your browser would) and, when you explicitly submit a
report, the FormSubmit email relay.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Development

The project is dependency-free plain JavaScript. Run the test suite with:

```
node --test tests/salary-parser.test.js tests/cache.test.js tests/scheduler.test.js tests/feedback.test.js tests/localization.test.js tests/routes.test.js tests/fixture-cards.test.js tests/cloud-cache.test.js
```

Utility scripts:

- `node scripts/generate-locales.js` — regenerates `extension/_locales/` from the
  YAML catalogs in `extension/localization/`.
- `node scripts/sanitize-fixtures.js` — sanitizes the HTML fixtures in `pages/`
  (strips scripts, tracking parameters and profile handles).
- `node scripts/package.js` — builds the deterministic release ZIP in `dist/` and
  prints its SHA-256.

## License

[MIT](LICENSE)
