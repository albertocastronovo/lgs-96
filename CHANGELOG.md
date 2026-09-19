# Changelog

## 1.0.2 — 2026-09-19

### Added
- Firefox support: the extension is now packaged for Mozilla Add-ons through a
  generated cross-browser manifest (contribution by @davidetarsi).
- Parser: amounts with cents are recognized in both Italian ("47.101,94",
  "29.000,00€") and US ("28,800.00") formats; cents are rounded to the nearest
  hundred.
- Parser: Swiss apostrophe thousands ("45'000"), stray spaces inside amounts
  ("67 .000"), and currency symbols before the k suffix ("53€K").
- Parser: compact k-ranges where only the last bound carries the suffix
  ("60-70k", "35-55K"), with "Range economico" recognized as a salary label.
- Parser: predictable recruiter typos that omit the thousands ("25,00 €/yr",
  "€26,00 and €28,00") are corrected to 25,000 / 26,000-28,000 when the salary
  context is unambiguous.
- Parser: ranges whose bounds are split by an Italian article ("28.000 ed i
  33.000€") no longer lose the lower bound.

### Fixed
- Parser: "mensilità" (payment installments) no longer suppresses an annual
  range stated on the same line; ranges about client assets ("AUM") are no
  longer mistaken for salaries.
- Cached results from older parser versions are invalidated so improved
  parsing applies immediately.

## 1.0.1 — 2026-09-12

### Fixed
- Parser: currency codes written directly against the amount (e.g. "EUR104,500")
  are now recognized.
- Parser: phone numbers (e.g. "+44 1234 567890") are no longer mistaken for bare
  salary amounts.

### Changed
- The popup help button is restyled (brighter, larger) for better visibility.
- Repository hygiene: training fixtures scrubbed of personal data (placeholder
  names, emails and phone numbers); HTML fixtures fully anonymized and enforced
  by a dedicated guard test in CI.

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
- Local cache schema bumped to v2: results cached by older versions are purged
  automatically so corrected parsing takes effect immediately.
- Job-posting responses larger than 1 MB are rejected.
- Documentation: README, LICENSE (MIT), SECURITY, CONTRIBUTING, CHANGELOG, store
  listing draft; HTML fixtures fully anonymized (scripts and serialized state
  blobs stripped; person names, job titles, companies, locations and image URLs
  replaced with placeholders; enforced by a dedicated guard test in CI).

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
