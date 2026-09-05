# Changelog

## 1.0.0 — 2026-09-02

First stable release prepared for the Chrome Web Store.

### Added
- Support for the general LinkedIn search results page (/search/results/all):
  salary badges are added to the job cards of the "Offerte di lavoro" / "Job offers"
  module.
- "Request frequency" setting (Slow 2.5 s / Average 1.6 s / Fast 1 s) that controls
  the delay between job-posting requests; changes apply live without reloading.
- Help button in the popup (top-right) linking to the GitHub README.
- "Buy me a coffee" support button in the popup linking to the author's Ko-Fi page.
- Visible-first scheduling: cards on screen are checked before cards outside the
  viewport.
- Session request budget (80 job-posting requests per page session) and a circuit
  breaker that stops fetching after three consecutive rate-limit/challenge
  responses.
- Release packaging: deterministic ZIP build (`scripts/package.js`) with SHA-256,
  GitHub Actions CI, extension icons.

### Changed
- Parser: supplemental amounts (signing bonus, sign-on bonus, one-time/performance
  bonuses, productivity incentives, superminimo) can no longer pollute detected
  ranges, including stacked modifiers and bonus ranges.
- Parser: currency codes written directly against the amount (e.g. "EUR104,500")
  are now recognized.
- Local cache schema bumped to v2: results cached by older versions are purged
  automatically so corrected parsing takes effect immediately.
- Job-posting responses larger than 1 MB are rejected.
- Documentation: README, LICENSE (MIT), SECURITY, CONTRIBUTING, CHANGELOG, store
  listing draft; HTML fixtures sanitized (scripts, tracking parameters and profile
  handles removed).

## 0.11.1 — 2026-09-01

### Fixed
- Amounts immediately labeled as a bonus or incentive (English and Italian) are no
  longer mistaken for salary values (e.g. "$20,000 signing bonus" no longer lowers
  a detected range).
- The report dialog and the thank-you message are two separate popups shown in
  sequence; the "This posting contains" label is rendered above the dropdown.
- Hidden panels can no longer appear due to CSS display overrides.

## 0.11.0 — 2026-09-02

### Added
- Feedback reporting: hover a badge, flag an incorrect result, submit a short report
  via FormSubmit (job ID, expected vs detected salary, extension version, language).
- Localized interface: English and Italian catalogs with a language selector in the
  popup.

### Changed
- "Salary not detected" wording replaces a definitive absence statement.
- Request pacing moved to a scheduler with jitter and Retry-After backoff.
- Cloud cache is presented as "Coming soon" and is fully disabled; no data leaves
  the browser except feedback reports.

## 0.10.0 — 2026-09-01

- Localization framework (flat YAML catalogs, popup language selector, generated
  `_locales`).

## 0.9.0 — 2026-08-31

- Experimental cloud cache (later disabled in 0.11.0), local cache hardening.

## 0.8.0 — 2026-08-28

- Salary range recognition on job cards, regional currency defaults, support for
  the /jobs/collections/recommended page.
