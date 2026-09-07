# Contributing to LGS-96

Thank you for considering a contribution. LGS-96 is intentionally small,
dependency-free plain JavaScript.

## Development setup

1. Clone the repository.
2. Load `extension/` as an unpacked extension via `chrome://extensions`
   (Developer mode).
3. No build step is required. After editing `extension/localization/*.yaml`, run
   `node scripts/generate-locales.js` so `extension/_locales/` stays in sync.

## Tests

Run the full suite before opening a PR:

```
node --test tests/salary-parser.test.js tests/cache.test.js tests/scheduler.test.js tests/feedback.test.js tests/localization.test.js tests/routes.test.js tests/fixture-cards.test.js tests/cloud-cache.test.js
```

Parser behavior is locked down by `train/salary.json` fixtures plus dedicated tests
in `tests/salary-parser.test.js`. If you change parsing, add a fixture for the new
real-world phrasing.

## Conventions

- Plain JavaScript, no frameworks, no npm dependencies.
- Prefer small modules with a UMD-style wrapper so they can be unit-tested in Node.
- All user-visible strings live in `extension/localization/en.yaml` and
  `it.yaml`; every new key must be added to `REQUIRED_KEYS` and the fallback
  catalog in `extension/src/localization.js`.
- Keep `PRIVACY.md` accurate whenever data collection or network behavior changes.

## Pull requests

- Keep PRs focused; one behavior change per PR.
- Describe the user-visible behavior and the tests you added.
- Do not include personal data or raw captured HTML in PRs; the `pages/` fixtures
  must stay sanitized (run `node scripts/sanitize-fixtures.js` if in doubt).
