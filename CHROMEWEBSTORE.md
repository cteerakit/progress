# Chrome Web Store Listing — Progress for Google Slides

> Last Updated: 2026-09-09

---

## Pre-Submission Checklist

- [ ] Run `npm run build && npm run zip` and upload `.output/progress-1.0.0-chrome.zip`
- [ ] Confirm store icon at `public/icons/icon-128.png` (128×128 PNG)
- [ ] Capture at least 1 screenshot (1280×800 or 640×400) — see Screenshot Notes
- [ ] Verify privacy policy URL loads: https://cteerakit.github.io/progress/privacy.html
- [ ] Register OAuth client as **Chrome extension** with published extension ID
- [ ] Add `presentations`, `drive.metadata`, `userinfo.email`, and `userinfo.profile` scopes to the OAuth consent screen and enable Google Slides API and Google Drive API
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
See which slides are done, which still need work, and how far the whole deck has come — without leaving Google Slides.

FEATURES
• A status on every slide thumbnail so you can scan the deck at a glance
• Click a thumbnail's status to choose To do, In progress, Need attention, or Done
• Make the statuses your own — change names, colors, icons, order, and which ones count as complete
• A progress badge next to the presentation title with percent complete and counts per status
• Hover the badge to review the breakdown or reset every slide
• Side panel with a history of status changes, a status editor, and sign-in
• Optional sign-in so everyone editing the same presentation sees the same progress

HOW TO USE
1. Open a Google Slides presentation
2. Click the status on any slide thumbnail and pick a label
3. Check overall progress in the badge next to the document title
4. Hover the badge to see counts per status or reset all slides
5. Click the extension icon to view history, customize statuses, or sign in
6. Sign in if you want collaborators to share the same statuses

SUPPORT
GitHub Issues: https://github.com/cteerakit/progress/issues

Version 1.0.0 — Status labels on slides, progress in the title bar, custom statuses, history, and optional collaborator sync
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
Assign customizable completion statuses on Google Slides filmstrip thumbnails and optionally sync them with collaborators through hidden marker shapes and Drive file metadata.
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

**Extension Name** — Progress for Google Slides

**Short Description** — Track slide progress in Google Slides and sync with collaborators.

**Detailed Description** — See the full copy-paste block in [Dashboard Copy-Paste](#dashboard-copy-paste) above.

**Category** — Productivity

**Single Purpose** — Assign customizable completion statuses on Google Slides filmstrip thumbnails and optionally sync them with collaborators through hidden marker shapes and Drive file metadata.

**Primary Language** — English

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
| Marquee Promo Tile | 1400×560 | ⬜ Not created | `docs/marquee.png` (source; resize to 1400×560 if used) |

### Screenshot Notes

Capture in Google Slides **edit mode** on `docs.google.com/presentation/...`. Use 1280×800 for best quality.

1. **Filmstrip overview** — Multiple thumbnails showing different status chips (To do, In progress, Need attention, Done)
2. **Status picker** — Popover open on one slide showing status options
3. **Progress badge** — Title-bar badge with percent complete; hover breakdown visible with per-status counts
4. **Side panel — Statuses** — Customize statuses view with labels, colors, and icons
5. **Side panel — Account** — Signed-in state, last synced time, and Sign out (or signed-out state with Sign in)

Optional caption ideas (add in image editor, not required by CWS):
- "Status chips on every slide thumbnail"
- "Track overall completion in the title bar"
- "Customize statuses and sync with collaborators"

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Caches slide status assignments, presets, and collaborator profile photos locally so the filmstrip UI updates instantly without waiting for network requests. |
| `identity` | permissions | Lets users optionally sign in with Google to read and write slide status markers and Drive file metadata on the open presentation. |
| `alarms` | permissions | Runs periodic background sync (once per minute) for presentations currently open in Slides, replacing aggressive content-script polling. |
| `sidePanel` | permissions | Shows status history for the active slide, the status preset editor, and account/sync controls. The side panel opens when the user clicks the toolbar icon. |
| `https://docs.google.com/*` | host_permissions | Finds open Google Slides tabs so the extension can keep filmstrip chips, presets, and the side panel in sync with the presentation the user is editing. Content scripts run only on `https://docs.google.com/presentation/*`. |
| `https://slides.googleapis.com/*` | host_permissions | Reads slide structure and writes hidden status marker shapes on the active presentation so collaborators can share slide statuses. Only called when the user is signed in. API requests use a field mask limited to page IDs and marker alt-text. |
| `https://www.googleapis.com/drive/v3/*` | host_permissions | Reads and writes status preset and collaborator email metadata in Drive `appProperties` on the active presentation so collaborators share the same preset catalog and history attribution. Profile photos are not written to Drive. |
| `https://www.googleapis.com/oauth2/v3/*` | host_permissions | Fetches the signed-in user's email and profile photo after Google sign-in so status history can show who made each change. Photos are cached locally and are not written to Drive. |

**Content script scope:** `https://docs.google.com/presentation/*` — injects status chips and the title-bar badge only on Google Slides presentation pages.

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes | Yes (if signed in) | Signed-in email and collaborator emails for status history attribution | No |
| Health info | No | No | | |
| Financial info | No | No | | |
| Authentication info | Yes | Yes (Google OAuth) | Optional Google sign-in for Drive and Slides sync | No (Google auth only) |
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

1. **Personally identifiable information**
   - Collected: Yes (signed-in Google email; collaborator emails for history attribution)
   - Purpose: App functionality (show who changed a slide status)
   - Shared with third parties: No
   - Note: Emails are stored in Drive file metadata on the presentation when signed in. Profile photos stay in local cache.

2. **Authentication information**
   - Collected: Yes
   - Purpose: App functionality (Google sign-in for optional Drive and Slides sync)
   - Shared with third parties: No

3. **User activity**
   - Collected: Yes (slide status labels only)
   - Purpose: App functionality (status tracking and collaborator sync)
   - Shared with third parties: No
   - Note: Transmitted off-device only when user signs in; stored as hidden marker shapes on slides

**Not collected:** Health, financial, communications, location, web history, website content (slide text/images)

**Privacy policy URL:** https://cteerakit.github.io/progress/privacy.html

---

## Privacy Policy

**Privacy Policy URL** — https://cteerakit.github.io/progress/privacy.html

**Terms of Service URL** — https://cteerakit.github.io/progress/terms.html

**Extension-hosted pages** (also available after install): `privacy.html`, `terms.html`

**GitHub Pages** — enable Pages from branch `main`, folder `/docs`.
- Homepage: https://cteerakit.github.io/progress/
- Privacy: https://cteerakit.github.io/progress/privacy.html
- Terms: https://cteerakit.github.io/progress/terms.html

Chrome Web Store listing: https://chromewebstore.google.com/detail/progress-for-google-slides/mgebbidbnfnomiilkimbiplmkafccmpf

---

## Distribution

**Visibility** — Public | **Regions** — All regions | **Pricing** — Free

---

## Developer Info

**Publisher Name** — Teerakit Chantrakul

**Contact Email** — c.teerakit@gmail.com

**Support URL** — https://github.com/cteerakit/progress/issues

**Homepage URL** — https://cteerakit.github.io/progress/

---

## OAuth & Google Verification

Required before public release because the extension uses the `presentations` scope, which can read and write presentation content.

1. **Google Cloud Console** — Enable Google Slides API and Google Drive API
2. **OAuth consent screen** — App name: "Progress for Google Slides"; scopes: `https://www.googleapis.com/auth/presentations`, `https://www.googleapis.com/auth/drive.metadata`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`
3. **OAuth client** — Type: **Chrome extension**; Item ID: extension ID from Chrome Web Store (`mgebbidbnfnomiilkimbiplmkafccmpf`) or from `npm run generate-extension-key` for testing
4. **Set client ID** — `WXT_OAUTH_CLIENT_ID` in `.env.local` or build environment
5. **Verification** — Submit OAuth app for verification with:
   - Privacy policy URL: https://cteerakit.github.io/progress/privacy.html
   - YouTube demo video (see **Demo video script** below)
   - Explanation that only slide page IDs, hidden status marker shapes, Drive file metadata for presets/collaborator emails, and the signed-in user profile (email and photo URL) are read/written, not slide text or images

### Demo video script (OAuth verification)

Google rejected submissions when the video did not clearly show **why each scope is needed**. For this app, the most common gap is **`drive.metadata`** — reviewers must see preset/collaborator sync via Drive file metadata, not only slide status chips.

**Before recording**

- Use a **test Google account** added as a test user in Cloud Console (or a separate project if you hit the unverified user cap).
- Keep OAuth consent screen **In Production**; test scopes in staging/unpacked build if needed.
- Prepare **two Google accounts** with edit access to the same presentation.
- Have Chrome DevTools or a second browser/profile ready for the collaborator view.

**Required shots (in order)**

1. **OAuth consent screen** — Sign in from side panel → Account → Sign in. Expand **Show all services** so all four scopes are readable:
   - `https://www.googleapis.com/auth/presentations`
   - `https://www.googleapis.com/auth/drive.metadata`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
2. **Local-only mode** — Assign statuses without signing in; explain data stays in browser only.
3. **`presentations` scope** — After sign-in, assign statuses on several slides. Open the same deck in Account B and show statuses synced via hidden marker shapes.
4. **`drive.metadata` scope (critical)** — In Account A, open side panel → **Statuses** tab. Rename a preset, change a color/icon, or reorder statuses. Save. Switch to Account B, reload or reopen the deck, open **Statuses** tab, and show the **same customized presets** appeared (this sync uses Drive `appProperties`, not slide shapes). Narrate: *"Custom status presets are stored in Google Drive file metadata on this presentation so all collaborators share the same labels."*
5. **Source account impact for Drive metadata** — Optional but strong: open Google Drive → right-click the presentation → **App details** or use Drive API Explorer to show `appProperties` keys (`c0`, `u0`, etc.) updated after preset edit. If that is too technical, at minimum show Account B receiving preset changes without re-entering them.
6. **Collaborator attribution (`userinfo` + Drive metadata)** — Change a slide status in Account A. In Account B, open **History** tab and show who made the change (uses signed-in email + collaborator list in Drive metadata).
7. **Sign out** — Show Sign out stops further sync; existing markers/metadata remain on the file.
8. **Privacy policy** — Briefly show https://cteerakit.github.io/progress/privacy.html, including the **Data Protection** and **Google User Data Retention and Deletion** sections.

**Narration tips for `drive.metadata`**

> Progress uses `drive.metadata` because custom status labels, colors, icons, and collaborator emails cannot fit in Slides marker shapes alone. They are stored in Drive `appProperties` on the open presentation file only. The extension does not browse Drive, list files, or read presentation content.

**After recording**

- Upload to YouTube (unlisted is fine).
- Update the demo video URL in Cloud Console OAuth verification form.
- Reply to the verification email with the new video link and updated privacy policy URL.

**Scope justification for Google verification:**
> The extension stores slide completion statuses (To do, In progress, Need attention, Done, or custom labels) as hidden marker shapes on each slide so collaborators editing the same presentation can see shared progress. Status presets and collaborator emails are stored in Drive file metadata on that presentation. userinfo.email and userinfo.profile identify who made each status change; profile photos are cached locally and are not written to Drive. The extension does not read or modify slide text, images, or speaker notes—only slide page IDs and marker alt-text.

---

## Reviewer Notes (Private Field)

Paste into the **Notes for reviewer** field during submission if available:

```
Progress for Google Slides adds status chips to Google Slides filmstrip thumbnails in edit mode. Clicking the toolbar icon opens a side panel (History, Statuses, Account), not a popup.

TEST STEPS
1. Install the extension and open any Google Slides presentation in edit mode (https://docs.google.com/presentation/...)
2. Confirm status chips appear on filmstrip thumbnails
3. Click a chip and select a status (To do, In progress, Need attention, or Done)
4. Confirm the title-bar progress badge updates next to the document title
5. Click the extension toolbar icon — the side panel opens. Use Account to sign in with Google (optional). Use Statuses to customize labels. Use History to see changes for the active slide.
6. Open the same presentation in another browser/profile with edit access to verify metadata sync

TECHNICAL NOTES
• Content script matches: https://docs.google.com/presentation/*
• Does NOT read slide text, images, speaker notes, or browsing history
• Optional sign-in uses chrome.identity with presentations, drive.metadata, userinfo.email, and userinfo.profile scopes
• Sync writes hidden status marker shapes on slides only in presentations the user can edit
• Status presets and collaborator emails are stored in Drive appProperties on the presentation
• Local data stored in chrome.storage.local; no developer-operated servers

Privacy Policy: https://cteerakit.github.io/progress/privacy.html
```

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-09-09 | Filmstrip chips, title-bar badge, customizable status presets, side panel (history / statuses / account), optional Slides marker sync and Drive metadata sync, privacy policy and terms | Draft |

---

## Review Notes

### Known Issues / Limitations

- `presentations` is a sensitive OAuth scope; disclose that only marker shapes are written, not slide content.
- Builds include the public key from `extension.pub.b64` so unpacked testing uses the store extension ID `mgebbidbnfnomiilkimbiplmkafccmpf`. Chrome Web Store assigns the item ID on upload; keep the OAuth client registered to that ID.
- Unpacked development: `npm run dev` (needs the dev server) or `npm run build:local` (standalone). Load from `.output/chrome-mv3-dev`.
- OAuth client must be registered to the stable extension ID from `extension.pub.b64` / `npm run generate-extension-key`.
- Sign-in and sync are optional; the extension works offline with local-only storage.
- Status sync requires edit access to the Google Slides file.
- Collaborator emails are stored in Drive file metadata when signed in; profile photos stay local.

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
| | | | |
