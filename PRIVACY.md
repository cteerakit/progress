# Privacy Policy

**Progress for Google Slides**

Last updated: September 8, 2026

This Privacy Policy describes how Progress for Google Slides ("the Extension," "we," "us") handles information when you use our Chrome extension.

## Summary

The Extension adds slide status labels inside Google Slides. By default, status data stays in your browser. If you choose to sign in with Google, status labels are stored in Google Drive file metadata on presentations you can edit so collaborators can see the same statuses. The Extension does not read slide text, images, or your browsing history, and it does not sell your data.

## What Data We Collect

### Data stored locally in your browser

When you use the Extension, the following information is stored in `chrome.storage.local` on your device:

- **Slide statuses** — The status you assign to each slide (No status, To do, In progress, Need attention, or Done), the internal slide identifier, and a timestamp of when the status was last changed.
- **Presentation identifiers** — Google Drive file IDs for presentations where you have used the Extension, so your statuses can be loaded again when you reopen a file.
- **Sync state** — Whether you are signed in, when the last sync occurred, and any recent sync error message shown in the popup.

This local data is used only to display status chips, the title-bar progress badge, and sync status in the Extension UI.

### Data sent to Google when you sign in

If you click **Sign in**, the Extension uses Google OAuth through Chrome's `identity` API and the Google Drive API to sync slide statuses with collaborators:

- **Authentication** — Google handles sign-in. The Extension requests an OAuth token with the `drive.metadata` scope so it can read and write custom metadata on Google Slides files you can edit. We do not receive or store your Google account password.
- **Slide status metadata** — When signed in, status labels are written to the presentation's Drive `appProperties` metadata. This includes slide identifiers, status codes, and update timestamps. Collaborators with edit access to the same file can see these statuses through the Extension.
- **Drive file access** — The Extension reads and updates metadata only on presentations you open in Google Slides while using the Extension. It does not access other files in your Drive.

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
- Syncing statuses with collaborators via Google Drive when you are signed in
- Showing sync status and sign-in controls in the toolbar popup

We do not use your data for advertising, creditworthiness, profiling, or any purpose unrelated to the Extension's core functionality.

## How Data Is Stored

| Data | Location | When |
|------|----------|------|
| Slide statuses and presentation cache | Your browser (`chrome.storage.local`) | Always, while the Extension is installed |
| Slide status metadata | Google Drive file metadata (`appProperties`) | Only when you are signed in and sync |
| OAuth token | Managed by Chrome / Google | While you remain signed in |

The Extension does not operate its own servers and does not store your data on developer-controlled infrastructure.

## Third-Party Services

When you sign in, the Extension communicates with:

- **Google OAuth / Chrome Identity API** — For authentication. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Drive API** — To read and write presentation metadata. See [Google Drive API Terms](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).

We do not share your data with any other third parties.

## Data Sharing

We do not sell, rent, or trade your data.

If you sign in and sync, status metadata is stored on Google Drive files you can edit. Anyone with edit access to those presentations can read the status metadata through Google Drive and this Extension. That sharing is inherent to collaborative editing and is controlled by the file's sharing settings in Google Drive.

## Data Retention and Deletion

**Local data:** Status data in your browser remains until you clear it or uninstall the Extension. You can reset all slide statuses in a presentation to No status from the title-bar breakdown panel. Uninstalling the Extension removes locally stored data.

**Drive metadata:** Status metadata written to a presentation remains in that file's Drive metadata until you reset statuses, overwrite it, or remove it through Google Drive. Signing out stops further sync but does not automatically delete metadata already stored on Drive files.

**Authentication:** Click **Sign out** in the Extension popup to revoke the cached OAuth token for this Extension.

## Permissions

The Extension requests these Chrome permissions for the features described above:

- `storage` — Local cache of slide statuses
- `identity` — Optional Google sign-in
- `alarms` — Periodic background sync for open presentations
- `https://www.googleapis.com/drive/v3/*` — Read/write presentation metadata when signed in

## Children's Privacy

The Extension is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy when the Extension's data practices change. The "Last updated" date at the top will reflect the latest revision. Material changes will be noted in the project repository. Continued use of the Extension after an update means you accept the revised policy.

## Contact

For privacy questions or requests, contact us at:

- **Email:** c.teerakit@gmail.com
- **GitHub Issues:** https://github.com/cteerakit/progress/issues
