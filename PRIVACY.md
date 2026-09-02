# LGS-96 Privacy Policy

_Last updated: 2026-08-31 (version 0.11.0)_

LGS-96 is an unofficial browser extension that shows salary indications found in
LinkedIn job postings directly on the job cards of the search results. It is **not
affiliated with, endorsed by, or connected to LinkedIn in any way**.

## What the extension reads

- Job cards on LinkedIn job list pages (job ID, card text fields such as
  company/location/native salary text).
- The public job-posting description of jobs you browse, fetched from LinkedIn's
  public guest endpoint, parsed **transiently in memory** to extract salary text.
  Raw descriptions are **never stored** and are **never sent anywhere**.

## What the extension stores locally

- Job ID -> parsed salary result (or "salary not detected") in your browser's local
  extension storage, kept for **3 days** (local cache, can be disabled and cleared
  from the popup at any time).
- Your preferences (language, local-cache enabled/disabled).
- Nothing is synced; nothing leaves your browser except what is described below.

## What the extension sends over the network

1. **LinkedIn**: for each job card without native salary text and without a cached
   result, the extension requests the public job-posting page from LinkedIn
   (roughly one request every 1.5 seconds at most, with backoff when rate limited).
   These requests happen on your browser and may be associated with your LinkedIn
   session by LinkedIn.
2. **Feedback reports (only when you explicitly submit one)**: when you hover a
   salary badge and choose to report an incorrect result, the extension sends to
   [FormSubmit](https://formsubmit.co) (`https://formsubmit.co/ajax/...`) an email on
   behalf of the extension author containing **only**:
   - the job posting ID and its canonical URL,
   - what you selected/typed as the expected salary information (max 50 characters),
   - what the extension had detected (kind, value, source),
   - the extension version and selected language.

   Reports contain **no** name, email, profile data, or job description text.
   FormSubmit processes the submission (including network metadata such as your IP
   address, subject to [FormSubmit's privacy policy](https://formsubmit.co/privacy.pdf))
   and emails it to the author, who stores it for the purpose of improving salary detection accuracy.

## What the extension does NOT do

- It does not collect browsing history, credentials, cookies, or profile data.
- It does not transmit job descriptions or page content to any server.
- It does not include analytics or tracking of any kind.
- **Cloud cache is not available in this version**: no data is sent to any
  extension-operated server. The feature may return in a future version and would be
  introduced with its own disclosure.

## Contact

- Author: Alberto Castronovo
- Source and issues: <https://github.com/albertocastronovo/lgs-96>
- Feedback about a specific salary result: use the flag icon that appears when
  hovering a salary badge.
