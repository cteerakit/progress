# Chrome Web Store Listing — Progress for Google Slides



> Last Updated: 2026-09-09



---



## Pre-Submission Checklist



- [ ] Run `npm run build && npm run zip` and upload `.output/progress-1.0.0-chrome.zip`

- [ ] Confirm store icon at `public/icons/icon-128.png` (128×128 PNG)

- [ ] Capture at least 1 screenshot (1280×800 or 640×400) — see Screenshot Notes

- [ ] Verify privacy policy URL loads: https://cteerakit.github.io/progress/privacy.html

- [ ] Register OAuth client as **Chrome extension** with published extension ID

- [ ] Add `presentations` and `drive.metadata` scopes to OAuth consent screen and enable Google Slides API and Google Drive API

- [ ] Fill data disclosure form using answers in [Data Disclosure Form](#data-disclosure-form) below

- [ ] Paste store fields from [Dashboard Copy-Paste](#dashboard-copy-paste) below

- [ ] Add private reviewer notes from [Reviewer Notes](#reviewer-notes-private-field) if prompted



---



## Dashboard Copy-Paste



Copy these values directly into the Chrome Web Store developer dashboard.



### Store Listing



**Extension Name**

```

Progress for Google Slides

```



**Summary (short description, max 132 characters)**

```

Track slide progress in Google Slides and sync with collaborators.

```

*(70 characters)*



**Description (detailed)**

```

Track slide completion inside Google Slides with status chips on every filmstrip thumbnail and a progress badge in the title bar.



FEATURES

• Five status labels: No status, To do, In progress, Need attention, and Done

• Status chip on each filmstrip thumbnail with a quick picker popover

• Title-bar progress badge showing percent complete and per-status counts

• Reset all slides to No status from the breakdown panel

• Local cache for instant UI updates without waiting on the network

• Optional Google sign-in to sync statuses with collaborators via hidden slide marker shapes

• Toolbar popup showing sync status, last synced time, sign-in, and sign-out

• Side panel showing status history for the active slide



HOW TO USE

1. Open a Google Slides presentation in edit mode

2. Click the status chip on any slide thumbnail to choose a status

3. View overall progress in the badge next to the document title

4. Hover the badge to see counts per status or reset all slides

5. Click the extension icon to sign in and sync with collaborators on Google Drive



PRIVACY

Status data is stored locally in your browser. If you sign in, status labels are written as hidden marker shapes on slides in presentations you can edit, and status presets plus collaborator emails are stored in Google Drive file metadata on the presentation. Profile photos stay in local cache. The extension does not read slide text, images, or browsing history.



Privacy Policy: https://cteerakit.github.io/progress/privacy.html

Terms of Service: https://cteerakit.github.io/progress/terms.html



PERMISSIONS

• storage — caches slide statuses locally for instant filmstrip updates

• identity — optional Google sign-in for collaborator sync

• alarms — periodic background sync (once per minute) for open presentations

• Google Slides API — reads slide page IDs and writes hidden status marker shapes on the active presentation only when signed in

• Google Drive API — reads and writes status preset and collaborator email metadata on the active presentation only when signed in



SUPPORT

GitHub Issues: https://github.com/cteerakit/progress/issues

Email: c.teerakit@gmail.com



Version 1.0.0 — Initial release: filmstrip status chips, title-bar progress badge, optional Slides API sync

```



**Category**

```

Productivity

```



**Language**

```

English

```



### Single Purpose (dashboard field)



```

Assign slide completion statuses on Google Slides filmstrip thumbnails and optionally sync them with collaborators through hidden marker shapes on each slide.

```



### Developer / Support URLs



| Field | Value |

|-------|-------|

| Privacy policy | https://cteerakit.github.io/progress/privacy.html |

| Homepage | https://cteerakit.github.io/progress/ |

| Support | https://github.com/cteerakit/progress/issues |

| Official email (trader contact) | c.teerakit@gmail.com |



### Distribution



| Field | Value |

|-------|-------|

| Visibility | Public |

| Regions | All regions |

| Pricing | Free |



---



## Store Listing (Reference)



**Extension Name**

Progress for Google Slides



**Short Description**

Track slide progress in Google Slides and sync with collaborators.



**Detailed Description**

See the full copy-paste block in [Dashboard Copy-Paste](#dashboard-copy-paste) above.



**Category**

Productivity



**Single Purpose**

Assign slide completion statuses on Google Slides filmstrip thumbnails and optionally sync them with collaborators through hidden marker shapes on each slide.



**Primary Language**

English



---



## Graphics & Assets



| Asset | Dimensions | Status | Filename |

|-------|-----------|--------|----------|

| Store Icon | 128×128 PNG | ✅ Ready | `public/icons/icon-128.png` |

| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | |

| Screenshot 2 | 1280×800 or 640×400 | ⬜ Not created | |

| Screenshot 3 | 1280×800 or 640×400 | ⬜ Not created | |

| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |

| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |

| Small Promo Tile | 440×280 | ⬜ Not created | |

| Marquee Promo Tile | 1400×560 | ⬜ Not created | |



### Screenshot Notes



Capture in Google Slides **edit mode** on `docs.google.com/presentation/...`. Use 1280×800 for best quality.



1. **Filmstrip overview** — Multiple thumbnails showing different status chips (To do, In progress, Need attention, Done)

2. **Status picker** — Popover open on one slide showing all five status options

3. **Progress badge** — Title-bar badge with percent complete; hover breakdown visible with per-status counts

4. **Reset flow** — Reset confirmation dialog from the breakdown panel

5. **Sign-in / sync** — Extension popup showing signed-in state, last synced time, and Sign out (or signed-out state with Sign in)



Optional caption ideas (add in image editor, not required by CWS):

- "Status chips on every slide thumbnail"

- "Track overall completion in the title bar"

- "Sync statuses with collaborators via Google Drive"



---



## Permissions Justification



| Permission | Type | Justification |

|------------|------|---------------|

| `storage` | permissions | Caches slide status assignments locally so the filmstrip UI updates instantly without waiting for network requests. |

| `identity` | permissions | Lets users optionally sign in with Google to read and write slide status markers on the open presentation via the Slides API. |

| `alarms` | permissions | Runs periodic background sync (once per minute) for presentations currently open in Slides, replacing aggressive content-script polling. |

| `https://slides.googleapis.com/*` | host_permissions | Reads slide structure and writes hidden status marker shapes on the active presentation so collaborators can share slide statuses. Only called when the user is signed in. API requests use a field mask limited to page IDs and marker alt-text. |

| `https://www.googleapis.com/drive/v3/*` | host_permissions | Reads and writes status preset and collaborator email metadata in Drive `appProperties` on the active presentation so collaborators share the same preset catalog and history attribution. Profile photos are not written to Drive. |



**Content script scope:** `https://docs.google.com/presentation/*` — injects status chips and the title-bar badge only on Google Slides presentation pages.



---



## Privacy & Data Use



### Data Collection



**Does the extension collect user data?** Yes



| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |

|-----------|-----------|------------------------|---------|---------------------------|

| Personally identifiable info | No | No | | |

| Health info | No | No | | |

| Financial info | No | No | | |

| Authentication info | Yes | Yes (Google OAuth) | Optional Google sign-in for Drive sync | No (Google auth only) |

| Personal communications | No | No | | |

| Location | No | No | | |

| Web history | No | No | | |

| User activity | Yes | Yes (if signed in) | Slide status labels assigned by the user | No |

| Website content | No | No | Does not read slide text or images | |



### Data Use Certification



- [x] Data is NOT sold to third parties

- [x] Data is NOT used for purposes unrelated to the extension's core functionality

- [x] Data is NOT used for creditworthiness or lending purposes



---



## Data Disclosure Form



Use these answers in the Chrome Web Store **Privacy practices** tab. They must match `PRIVACY.md`.



| Question | Answer |

|----------|--------|

| Does your product collect user data? | **Yes** |

| Is data sold to third parties? | **No** |

| Is data used for unrelated purposes? | **No** |

| Is data used for creditworthiness? | **No** |



**Collected data types to declare:**



1. **Authentication information**

   - Collected: Yes

   - Purpose: App functionality (Google sign-in for optional Drive sync)

   - Shared with third parties: No



2. **User activity**

   - Collected: Yes (slide status labels only)

   - Purpose: App functionality (status tracking and collaborator sync)

   - Shared with third parties: No

   - Note: Transmitted off-device only when user signs in; stored as hidden marker shapes on slides



**Not collected:** PII, health, financial, communications, location, web history, website content (slide text/images)



**Privacy policy URL:** https://cteerakit.github.io/progress/privacy.html



---



## Privacy Policy



**Privacy Policy URL**

https://cteerakit.github.io/progress/privacy.html



**Terms of Service URL**

https://cteerakit.github.io/progress/terms.html



**Extension-hosted pages** (also available after install)

- `privacy.html`

- `terms.html`



**GitHub Pages** — enable Pages from branch `main`, folder `/docs`.

- Homepage: https://cteerakit.github.io/progress/
- Privacy: https://cteerakit.github.io/progress/privacy.html
- Terms: https://cteerakit.github.io/progress/terms.html

Chrome Web Store listing: https://chromewebstore.google.com/detail/progress-for-google-slides/mgebbidbnfnomiilkimbiplmkafccmpf



---



## Distribution



**Visibility**: Public

**Regions**: All regions

**Pricing**: Free



---



## Developer Info



**Publisher Name**

Teerakit Chantrakul



**Contact Email**

c.teerakit@gmail.com



**Support URL / Email**

https://github.com/cteerakit/progress/issues



**Homepage URL**

https://cteerakit.github.io/progress/



---



## OAuth & Google Verification



Required before public release because the extension uses the `presentations` scope, which can read and write presentation content.



1. **Google Cloud Console** — Enable Google Slides API and Google Drive API

2. **OAuth consent screen** — App name: "Progress for Google Slides"; scopes: `https://www.googleapis.com/auth/presentations`, `https://www.googleapis.com/auth/drive.metadata`

3. **OAuth client** — Type: **Chrome extension**; Item ID: extension ID from Chrome Web Store (update after first upload) or from `npm run generate-extension-key` for testing

4. **Set client ID** — `WXT_OAUTH_CLIENT_ID` in `.env.local` or build environment

5. **Verification** — Submit OAuth app for verification with:

   - Privacy policy URL

   - YouTube or written demo showing sign-in and sync on a Google Slides file

   - Explanation that only slide page IDs, hidden status marker shapes, and Drive file metadata for presets/collaborator emails are read/written, not slide text or images



**Scope justification for Google verification:**

> The extension stores slide completion statuses (To do, In progress, Need attention, Done) as hidden marker shapes on each slide so collaborators editing the same presentation can see shared progress. It does not read or modify slide text, images, or speaker notes—only slide page IDs and marker alt-text.



---



## Reviewer Notes (Private Field)



Paste into the **Notes for reviewer** field during submission if available:



```

Progress for Google Slides adds status chips to Google Slides filmstrip thumbnails in edit mode.



TEST STEPS

1. Install the extension and open any Google Slides presentation in edit mode (https://docs.google.com/presentation/...)

2. Confirm status chips appear on filmstrip thumbnails

3. Click a chip and select a status (To do, In progress, Need attention, or Done)

4. Confirm the title-bar progress badge updates next to the document title

5. Click the extension toolbar icon — sign in with Google to enable sync (optional)

6. Open the same presentation in another browser/profile with edit access to verify metadata sync



TECHNICAL NOTES

• Content script matches: https://docs.google.com/presentation/*

• Does NOT read slide text, images, speaker notes, or browsing history

• Optional sign-in uses chrome.identity with presentations scope

• Sync writes hidden status marker shapes on slides only in presentations the user can edit

• Local data stored in chrome.storage.local; no developer-operated servers



Privacy Policy: https://cteerakit.github.io/progress/privacy.html

```



---



## Version History



| Version | Date | Changes | Status |

|---------|------|---------|--------|

| 1.0.0 | 2026-09-08 | Initial release: five slide statuses, filmstrip chips, title-bar progress badge, optional Slides API sync, privacy policy and terms | Draft |



---



## Review Notes



### Known Issues / Limitations



- `presentations` is a sensitive OAuth scope; disclose that only marker shapes are written, not slide content.

- Unpacked development requires either `npm run dev` (with dev server) or `npm run build:local` (stable extension ID). Do not include the manifest `key` field in Chrome Web Store uploads.

- OAuth client must be registered to the stable extension ID from `npm run generate-extension-key`.

- Sign-in and sync are optional; the extension works offline with local-only storage.

- Status sync requires edit access to the Google Slides file.



### Rejection History



| Date | Reason | Fix Applied | Resubmitted |

|------|--------|-------------|-------------|

| | | | |


