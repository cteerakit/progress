# Slide Status

A Chrome extension for Google Slides that lets you assign **No status**, **To do**, **In progress**, and **Done** to each slide from the filmstrip, track overall completion in the title bar, and sync statuses with collaborators via Google Drive metadata.

Built with [WXT](https://wxt.dev) and Manifest V3.

## Features

- Status chip on every filmstrip thumbnail
- Popover dropdown to pick a status (native Popover API + CSS anchor positioning)
- Title-bar progress badge showing completion percentage
- Hover breakdown of counts per status
- Local cache for instant UI
- Near-realtime collaborator sync through Drive `appProperties` (requires sign-in)

## Development

```bash
npm install
npm run dev
```

Load the unpacked extension from `.output/chrome-mv3` if WXT does not auto-open Chrome.

## Google Cloud OAuth setup

1. Create a Google Cloud project and enable **Google Drive API**
2. Configure the OAuth consent screen (Testing mode is fine for development)
3. Create an OAuth client of type **Chrome extension**
4. Set the item ID to your extension ID from `chrome://extensions`
5. Export the client ID when running WXT:

```bash
export WXT_OAUTH_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
npm run dev
```

For a stable extension ID during unpacked development, pack the extension once and add the public `key` field to `wxt.config.ts` / manifest, then register that ID in Google Cloud.

`drive.metadata` is a restricted scope. Unpacked + test users work for development; public Chrome Web Store release requires Google verification.

## Build

```bash
npm run build
npm run zip
```

## Permissions

- `storage` — local slide status cache
- `identity` — Google sign-in for Drive sync
- `https://www.googleapis.com/drive/v3/*` — read/write presentation metadata

## License

MIT
