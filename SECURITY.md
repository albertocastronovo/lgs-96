# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | yes       |

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

- Preferred: open a private security advisory via GitHub
  ("Security" tab -> "Report a vulnerability").
- Alternative: email <alberto.castronovo@hotmail.it> with "LGS-96 security" in the
  subject.

You will get an initial response within 7 days. Please include a description of the
issue, the steps to reproduce it, and the affected version if possible.

## Scope notes

- The extension is a content script + service worker Chrome extension with no
  backend. It requests only `https://www.linkedin.com/*` content and
  `https://formsubmit.co/*` for the optional, user-initiated feedback reports.
- Reports about LinkedIn-side behavior (rate limits, anti-bot walls) are out of
  security scope; please open a regular issue instead.
