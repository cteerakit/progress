# Privacy Policy

**Progress for Google Slides**

Last updated: September 9, 2026

This Privacy Policy describes how Progress for Google Slides ("the Extension," "we," "us") handles information when you use our Chrome extension.

## Summary

The Extension adds slide status labels inside Google Slides. By default, status data stays in your browser. If you choose to sign in with Google, status labels are stored on each slide as hidden marker shapes in the presentation so collaborators can see the same statuses. The Extension does not read slide text, speaker notes, images, or your browsing history, and it does not sell your data.

## What Data We Collect

### Data stored locally in your browser

When you use the Extension, the following information is stored in `chrome.storage.local` on your device:

- **Slide statuses** — The status you assign to each slide (using built-in or custom status ids), the internal slide identifier, and a timestamp of when the status was last changed. When signed in, a compact history of prior status changes for each slide may also be stored locally and in marker alt-text.
- **Status preset configuration** — Your customized status labels, colors, icons, order, and which status counts as complete. This is stored locally and, when signed in, in a hidden catalog marker on the presentation so collaborators see the same preset.
- **Presentation identifiers** — Google Slides presentation IDs for decks where you have used the Extension, so your statuses can be loaded again when you reopen a file.
- **Sync state** — Whether you are signed in, when the last sync occurred, and any recent sync error message shown in the popup.

This local data is used only to display status chips, the title-bar progress badge, and sync status in the Extension UI.

### Data sent to Google when you sign in

If you click **Sign in**, the Extension uses Google OAuth through Chrome's `identity` API and the Google Slides API to sync slide statuses with collaborators:

- **Authentication** — Google handles sign-in. The Extension requests an OAuth token with the `presentations` scope so it can read slide structure and write status marker shapes on presentations you can edit. We do not receive or store your Google account password.
- **Slide status markers** — When signed in, each assigned status is stored on its slide as a small hidden shape with alt-text metadata (`progress.slide-status`). The payload includes the current status id, update timestamp, and a compact history of prior status changes keyed to that slide's page ID. Collaborators with edit access to the same presentation can see these statuses and history through the Extension.
- **Status preset catalog** — When signed in, customized status presets are stored as a hidden catalog marker (`progress.status-presets`) on a slide in the presentation. The catalog includes status labels, colors, icons, order, and which status counts toward completion.
- **Presentation access** — The Extension reads and updates marker shapes only on presentations you open in Google Slides while using the Extension. API requests use a field mask limited to slide page IDs and marker alt-text; the Extension does not read or modify slide text, images, or speaker notes.

### Data we do not collect

The Extension does **not** collect or transmit:

- Slide text, speaker notes, images, or other presentation content
- Browsing history or activity outside Google Slides
- Your name, email address, or other personally identifiable information (except what Google provides through OAuth for authentication)
- Analytics, telemetry, crash reports, or advertising identifiers
- Financial, health, or location information

## How We Use Data

We use the data described above solely to provide Extension features:

- Showing status chips on filmstrip thumbnails
- Calculating and displaying overall progress in the title bar
- Caching statuses locally for instant UI updates
- Syncing statuses with collaborators via the Google Slides API when you are signed in
- Showing sync status and sign-in controls in the toolbar popup
- Showing per-slide status history for the active slide in the side panel

We do not use your data for advertising, creditworthiness, profiling, or any purpose unrelated to the Extension's core functionality.

## How Data Is Stored

| Data | Location | When |
|------|----------|------|
| Slide statuses and presentation cache | Your browser (`chrome.storage.local`) | Always, while the Extension is installed |
| Slide status markers | Hidden shapes on each slide in the presentation | Only when you are signed in and sync |
| OAuth token | Managed by Chrome / Google | While you remain signed in |

The Extension does not operate its own servers and does not store your data on developer-controlled infrastructure.

## Third-Party Services

When you sign in, the Extension communicates with:

- **Google OAuth / Chrome Identity API** — For authentication. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Slides API** — To read slide page IDs and write status marker shapes. See [Google API Terms of Service](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).

We do not share your data with any other third parties.

## Data Sharing

We do not sell, rent, or trade your data.

If you sign in and sync, status markers are stored inside the presentation file. Anyone with edit access to that presentation can read the marker metadata through Google Slides and this Extension. That sharing is inherent to collaborative editing and is controlled by the file's sharing settings in Google Drive.

## Data Retention and Deletion

**Local data:** Status data in your browser remains until you clear it or uninstall the Extension. You can reset all slide statuses in a presentation to No status from the title-bar breakdown panel. Uninstalling the Extension removes locally stored data.

**Slide markers:** Status markers written to a presentation remain on those slides until you reset statuses to No status (which deletes the markers) or remove them manually in Google Slides. Signing out stops further sync but does not automatically delete markers already stored in the presentation.

**Authentication:** Click **Sign out** in the Extension popup to revoke the cached OAuth token for this Extension.

## Permissions

The Extension requests these Chrome permissions for the features described above:

- `storage` — Local cache of slide statuses
- `identity` — Optional Google sign-in
- `alarms` — Periodic background sync for open presentations
- `https://slides.googleapis.com/*` — Read slide structure and write status marker shapes when signed in

## Children's Privacy

The Extension is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy when the Extension's data practices change. The "Last updated" date at the top will reflect the latest revision. Material changes will be noted in the project repository. Continued use of the Extension after an update means you accept the revised policy.

## Contact

For privacy questions or requests, contact us at:

- **Email:** c.teerakit@gmail.com
- **GitHub Issues:** https://github.com/cteerakit/progress/issues
