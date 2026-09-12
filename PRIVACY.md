# Privacy Policy

**Progress for Google Slides**

Last updated: September 12, 2026

This Privacy Policy describes how Progress for Google Slides ("the Extension," "we," "us") handles information when you use our Chrome extension.

## Summary

The Extension adds slide status labels inside Google Slides. By default, status data stays in your browser. If you choose to sign in with Google, status labels are stored on each slide as hidden marker shapes in the presentation so collaborators can see the same statuses. Status presets and collaborator emails are stored in Google Drive file metadata on that presentation. The Extension does not read slide text, speaker notes, images, or your browsing history, and it does not sell your data.

## What Data We Collect

### Data stored locally in your browser

When you use the Extension, the following information is stored in `chrome.storage.local` on your device:

- **Slide statuses** — The status you assign to each slide (using built-in or custom status ids), the internal slide identifier, and a timestamp of when the status was last changed. When signed in, a compact history of prior status changes for each slide may also be stored locally and in marker alt-text.
- **Status preset configuration** — Your customized status labels, colors, icons, order, and which statuses count as complete. This is stored locally and, when signed in, in Google Drive file metadata on the presentation so collaborators see the same preset.
- **Collaborator email list** — When signed in, the extension stores collaborator email addresses in Drive file metadata so status history can show who made each change. Profile photos are cached locally on your device and are not written to Drive.
- **Signed-in account** — After Google sign-in, your email address and profile photo URL are stored locally so the side panel can show who you are signed in as.
- **Presentation identifiers** — Google Slides presentation IDs for decks where you have used the Extension, so your statuses can be loaded again when you reopen a file.
- **Sync state** — Whether you are signed in, when the last sync occurred, and any recent sync error message shown in the side panel Account view.

This local data is used only to display status chips, the title-bar progress badge, the side panel (History, Statuses, and Account), and sync status.

### Data sent to Google when you sign in

If you click **Sign in** in the side panel Account view, the Extension uses Google OAuth through Chrome's `identity` API, the Google Slides API, and the Google Drive API to sync slide statuses with collaborators:

- **Authentication** — Google handles sign-in. The Extension requests OAuth tokens with the `drive.file`, `userinfo.email`, and `userinfo.profile` scopes so it can read slide structure, write status marker shapes, and read/write preset and collaborator metadata on presentations you explicitly allow, and identify the signed-in user for status history. After sign-in, Google asks you to confirm each presentation once (Google Picker pre-opened to the deck you already have open). We do not receive or store your Google account password.
- **Slide status markers** — When signed in, each assigned status is stored on its slide as a small hidden shape with alt-text metadata (`progress.slide-status`). The payload includes the current status id, update timestamp, and a compact history of prior status changes keyed to that slide's page ID. Collaborators with edit access to the same presentation can see these statuses and history through the Extension.
- **Status preset catalog** — When signed in, customized status presets are stored in Google Drive file metadata (`appProperties`) on the presentation. The catalog includes status labels, colors, icons, order, and which statuses count toward completion.
- **Collaborator email list** — When signed in, collaborator email addresses are stored in the same Drive file metadata so status history can attribute changes. Profile photo URLs are cached locally and are not written to Drive.
- **Presentation access** — The Extension reads and updates marker shapes and Drive file metadata only on presentations you open in Google Slides while using the Extension. Slides API requests use a field mask limited to slide page IDs and marker alt-text; the Extension does not read or modify slide text, images, or speaker notes.

### Data we do not collect

The Extension does **not** collect or transmit:

- Slide text, speaker notes, images, or other presentation content
- Browsing history or activity outside Google Slides
- Analytics, telemetry, crash reports, or advertising identifiers
- Financial, health, or location information

The Extension does collect email addresses as described above: your signed-in Google email, and collaborator emails stored in Drive file metadata for history attribution. It does not collect other personally identifiable information such as your legal name or postal address.

## How We Use Data

We use the data described above solely to provide Extension features:

- Showing status chips on filmstrip thumbnails
- Calculating and displaying overall progress in the title bar
- Caching statuses locally for instant UI updates
- Syncing statuses with collaborators via the Google Slides API when you are signed in
- Syncing status presets and collaborator emails via the Google Drive API when you are signed in
- Showing status history, the preset editor, and sign-in controls in the side panel

We do not use your data for advertising, creditworthiness, profiling, or any purpose unrelated to the Extension's core functionality.

## How Data Is Stored

| Data | Location | When |
|------|----------|------|
| Slide statuses and presentation cache | Your browser (`chrome.storage.local`) | Always, while the Extension is installed |
| Slide status markers | Hidden shapes on each slide in the presentation | Only when you are signed in and sync |
| Status presets and collaborator emails | Google Drive file metadata on the presentation | Only when you are signed in and sync |
| Signed-in email and profile photos | Your browser (`chrome.storage.local`) | While cached locally |
| OAuth token | Managed by Chrome / Google | While you remain signed in |

The Extension does not operate its own servers and does not store your data on developer-controlled infrastructure.

## Data Protection

We take reasonable steps to protect Google user data and other information handled by the Extension.

### Security procedures

Security procedures are in place to protect the confidentiality of your data. Because the Extension does not operate its own servers, protection focuses on secure local handling and least-privilege access to Google APIs.

### Encryption and secure transport

We use encryption to protect your information in transit. All communication with Google services (OAuth, Google Slides API, Google Drive API, and Google userinfo API) uses HTTPS/TLS. No Google user data is transmitted over unencrypted connections.

### Least-privilege access

The Extension requests the narrowest OAuth scopes needed for its features and accesses only the minimum data required:

- **drive.file** — After you confirm a presentation, reads slide page IDs, writes small hidden marker shapes, and reads/writes `appProperties` on that file only. It does not list, search, or access other Drive files, and it does not read or modify slide text, images, or speaker notes.
- **userinfo.email** and **userinfo.profile** — Reads your signed-in email and profile photo URL for display and status history attribution.

API requests use field masks and scoped endpoints so only the data needed for sync is read or written.

### Local storage and token handling

Cached Extension data (statuses, presets, signed-in email, and profile photo URL) is stored in `chrome.storage.local`, which is isolated to this Extension. OAuth access tokens are managed by Chrome's identity API and Google's OAuth infrastructure; we do not store OAuth tokens on developer-controlled servers.

### Optional sign-in

Google user data is accessed only after you explicitly choose **Sign in** in the side panel and confirm the open presentation. Without sign-in, status data stays in your browser and the Extension does not call Google APIs on your behalf.

## Third-Party Services

When you sign in, the Extension communicates with:

- **Google OAuth / Chrome Identity API** — For authentication. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Google userinfo API** — To read the signed-in user's email and profile photo URL. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Slides API** — To read slide page IDs and write status marker shapes. See [Google API Terms of Service](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Drive API** — To read and write status preset and collaborator email metadata on presentations you allow. See [Google API Terms of Service](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Picker API** — To confirm which open presentation the Extension may use. A short-lived access token is passed in the URL fragment of the confirmation page so it is not sent to GitHub Pages.

We do not share your data with any other third parties.

## Data Sharing

We do not sell, rent, or trade your data.

If you sign in and sync, status markers are stored inside the presentation file, and status presets plus collaborator emails are stored in that file's Drive metadata. Anyone with edit access to that presentation can read this metadata through Google Slides, Google Drive, and this Extension. That sharing is inherent to collaborative editing and is controlled by the file's sharing settings in Google Drive.

## Google User Data Retention and Deletion

This section describes how Google user data obtained through Google OAuth and Google APIs is retained and how you can delete it.

### What counts as Google user data in this Extension

When you sign in, the Extension may access:

- Your Google account email and profile photo URL (userinfo scopes)
- Slide status markers stored on presentations you allow (`drive.file` scope)
- Status preset catalogs and collaborator email addresses stored in Drive file metadata on those presentations (`drive.file` scope)

We do not collect Google user data on developer-operated servers. Google user data persists only in your browser's local cache and in the Google Slides or Google Drive records for presentations you edit while signed in.

### Retention

We retain Google user data only as long as needed to provide the Extension's features:

- **Local cache** — Stored while the Extension is installed and, for signed-in data, while you remain signed in or until you clear extension data.
- **Slide status markers** — Stored on each slide in the presentation until you reset statuses, delete markers, or delete the presentation file.
- **Drive file metadata** — Status presets and collaborator emails remain in the presentation's Drive `appProperties` until overwritten by a later sync, removed through Google Drive, or deleted with the presentation file.
- **OAuth tokens** — Managed by Chrome and Google while you remain signed in; revoked when you sign out.

We do not retain Google user data on developer-controlled infrastructure after you uninstall the Extension or sign out, except where that data remains in Google's services under your control (for example, markers or metadata already written to a presentation file).

### Deletion

You may delete Google user data handled by the Extension as follows:

| Google user data | How to delete |
|------|--------|
| OAuth session and cached sign-in state | Click **Sign out** in the side panel Account view |
| Local cache (statuses, presets, email, profile photo) | Uninstall the Extension or clear its data in Chrome extension settings |
| Slide status markers | Reset slide statuses to **No status** from the title-bar breakdown panel, or remove the hidden marker shapes in Google Slides |
| Drive metadata (presets and collaborator emails) | Overwritten when presets change on a later sync, or removed by clearing the presentation's app metadata in Google Drive |
| All Extension-related data in your Google account | Delete the presentation in Google Drive, or remove markers and metadata using Google Slides and Google Drive controls |

Because we do not operate servers that store Google user data, there is no separate account or database from which we can delete data on your behalf. To request help locating or removing Extension-related Google user data, contact **c.teerakit@gmail.com**.

## Permissions

The Extension requests these Chrome permissions for the features described above:

- `storage` — Local cache of slide statuses, presets, and profile photos
- `identity` — Optional Google sign-in
- `alarms` — Periodic background sync for open presentations
- `sidePanel` — History, Statuses, and Account UI; opens when you click the toolbar icon
- `https://docs.google.com/*` — Find open Google Slides tabs so chips, presets, and the side panel stay in sync
- `https://slides.googleapis.com/*` — Read slide structure and write status marker shapes when signed in
- `https://www.googleapis.com/drive/v3/*` — Read and write status preset and collaborator email metadata when signed in
- `https://www.googleapis.com/oauth2/v3/*` — Fetch the signed-in user's email and profile photo

## Children's Privacy

The Extension is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy when the Extension's data practices change. The "Last updated" date at the top will reflect the latest revision. Material changes will be noted in the project repository. Continued use of the Extension after an update means you accept the revised policy.

## Contact

For privacy questions or requests, contact us at:

- **Email:** c.teerakit@gmail.com
- **GitHub Issues:** https://github.com/cteerakit/progress/issues
