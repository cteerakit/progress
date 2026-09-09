# Privacy Policy

**Progress for Google Slides**

Last updated: September 9, 2026

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

- **Authentication** — Google handles sign-in. The Extension requests OAuth tokens with the `presentations`, `drive.metadata`, `userinfo.email`, and `userinfo.profile` scopes so it can read slide structure, write status marker shapes on presentations you can edit, read/write preset and collaborator metadata on presentations you open, and identify the signed-in user for status history. We do not receive or store your Google account password.
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

## Third-Party Services

When you sign in, the Extension communicates with:

- **Google OAuth / Chrome Identity API** — For authentication. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Google userinfo API** — To read the signed-in user's email and profile photo URL. See [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Slides API** — To read slide page IDs and write status marker shapes. See [Google API Terms of Service](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).
- **Google Drive API** — To read and write status preset and collaborator email metadata on presentations you open. See [Google API Terms of Service](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).

We do not share your data with any other third parties.

## Data Sharing

We do not sell, rent, or trade your data.

If you sign in and sync, status markers are stored inside the presentation file, and status presets plus collaborator emails are stored in that file's Drive metadata. Anyone with edit access to that presentation can read this metadata through Google Slides, Google Drive, and this Extension. That sharing is inherent to collaborative editing and is controlled by the file's sharing settings in Google Drive.

## Data Retention and Deletion

**Local data:** Status data in your browser remains until you clear it or uninstall the Extension. You can reset all slide statuses in a presentation to No status from the title-bar breakdown panel, and you can clear per-slide history from the side panel. Uninstalling the Extension removes locally stored data.

**Slide markers:** Status markers written to a presentation remain on those slides until you reset statuses to No status (which deletes the markers) or remove them manually in Google Slides. Signing out stops further sync but does not automatically delete markers already stored in the presentation.

**Drive metadata:** Status presets and collaborator emails written to Drive file metadata remain on that presentation until they are overwritten by a later sync or removed through Google Drive. Signing out stops further writes but does not automatically delete metadata already stored on the file.

**Authentication:** Click **Sign out** in the side panel Account view to revoke the cached OAuth token for this Extension.

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
