# Chrome Web Store listing draft — LGS-96

Store language: English (primary) + Italian (additional locale).

## Name

- EN: `LGS-96 — Salary ranges on LinkedIn`
- IT: `LGS-96 — Range retributivi su LinkedIn`

## Short description (132 chars max)

- EN: `Shows salary ranges found in LinkedIn job postings directly on the job cards. Unofficial, independent, privacy-first.`
- IT: `Mostra le fasce retributive presenti negli annunci LinkedIn direttamente sulle card dei risultati. Non ufficiale e privacy-first.`

## Detailed description

- EN:

```
LGS-96 adds a small badge to every job card in your LinkedIn job searches, telling
you at a glance what the posting contains:

- a green badge for a narrow salary range,
- an amber badge for a broad range or a single approximate value,
- a red badge when the posting does not mention any salary,
- a grey badge when the check could not be completed.

When a card does not show salary text, LGS-96 reads the public job-posting page
politely (one request every 1-2.5 seconds, configurable in the popup, with
automatic backoff and a per-session request budget) and extracts the range from
the description, with regional currency defaults and support for English and
Italian postings. Results are cached locally for 3 days and never sent anywhere.

You can report an incorrect result by hovering a badge and clicking the flag.

The name comes from the Italian transparency decree D.Lgs. 96/2026, which requires
salary ranges to be published in job postings. LGS-96 is an independent, unofficial
tool and is not affiliated with, endorsed by, or connected to LinkedIn in any way.

Privacy: no account, no analytics, no tracking, no data collection. See the privacy
policy for the full details.
```

- IT: same structure, localized.

## Category

- Productivity

## Language

- English (default), Italian

## Single purpose

- Display salary information contained in LinkedIn job postings on the job cards.

## Permission justifications

- `storage` — used to keep parsed salary results (local cache, max 3 days) and the
  user preferences (language, request frequency, cache enabled) in the browser's
  local extension storage. Nothing is synced or transmitted.
- `declarativeNetRequest` with `host_permissions: https://formsubmit.co/*` — the
  optional, user-initiated "report an incorrect result" feature submits a short
  form through formsubmit.co. That service requires a web-origin Referer header on
  AJAX submissions; a single static declarativeNetRequest rule sets that Referer
  for requests to formsubmit.co only. No other request, site, or header is touched,
  and no request is blocked or redirected.
- Content script on `https://www.linkedin.com/*` — required to read the job cards
  the user is already browsing and to render the badges.

## Data-use disclosures (review form)

- Data collected: none. The extension does not collect, store off-device, or
  transmit personal data. Feedback reports are only sent when the user explicitly
  submits one and contain the job posting ID, the expected/detected salary text,
  the extension version and the interface language.
- Website data (linkedin.com): read-only access to job listing pages the user
  browses; job descriptions are fetched from the public guest endpoint and parsed
  in memory only.
- Authentication data: none. No cookies, tokens, or credentials are read or
  stored for reports (fetch omits credentials).
- Compliance certifications: no data sale, no advertising, no creditworthiness.

## Screenshots (1280x800 or 640x400)

1. Search results with green/amber/red badges on cards (EN interface).
2. Close-up of a narrow-range badge and a broad-range badge.
3. Popup: language + request frequency + cache settings.
4. Report dialog and thank-you dialog (hover flag).
5. Italian interface of the popup.

## Store icon

- The 128x128 store-listing icon can be produced by resizing
  `extension/icons/android-chrome-512x512.png` down to 128x128 (favicon.io set;
  no separate 128 file is shipped in the package).
