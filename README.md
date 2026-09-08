# Progress for Google Slides

![Progress for Google Slides](docs/marquee.png)

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/mgebbidbnfnomiilkimbiplmkafccmpf)**

A Chrome extension for Google Slides that lets you assign **No status**, **To do**, **In progress**, **Need attention**, and **Done** to each slide from the filmstrip, track overall completion in the title bar, and sync statuses with collaborators via Google Drive metadata.



Built with [WXT](https://wxt.dev) and Manifest V3.



## Features



- Status chip on every filmstrip thumbnail

- Popover dropdown to pick a status (native Popover API + CSS anchor positioning)

- Title-bar progress badge showing completion percentage

- Hover breakdown of counts per status, with a confirmation dialog to reset all slides to No status

- Local cache for instant UI

- Collaborator sync through Drive `appProperties` (requires sign-in), with background `chrome.alarms` polling

- Toolbar popup with sync status and sign-out



## Development



```bash

npm install

npm run dev

```



WXT dev mode writes to `.output/chrome-mv3-dev`. That folder does **not** include `content_scripts` in the manifest — the background service worker registers them at runtime over a WebSocket to `localhost:3000`. Keep `npm run dev` running, then reload the extension and refresh any open Google Slides tabs.



For standalone unpacked testing (no dev server), use a local build with a stable extension ID:



```bash

npm run build:local

```



Load the unpacked extension from `.output/chrome-mv3-dev`.



## Stable extension ID (OAuth)



Generate a stable key pair once so your unpacked extension ID does not change between reloads:



```bash

npm run generate-extension-key

```



This creates `extension.pub.b64` (commit this) and `extension.pem` (private, gitignored). The script prints your extension ID — register it in Google Cloud as a **Chrome extension** OAuth client.



## Google Cloud OAuth setup



1. Create a Google Cloud project and enable **Google Drive API**

2. Configure the OAuth consent screen (Testing mode is fine for development)

3. Run `npm run generate-extension-key` and note the extension ID

4. Create an OAuth client of type **Chrome extension** with that item ID

5. Export the client ID when running WXT:



```bash

# macOS / Linux

export WXT_OAUTH_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"



# Windows PowerShell

$env:WXT_OAUTH_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"



npm run dev

```



After publishing to the Chrome Web Store, update the OAuth client with the store-assigned extension ID.



`drive.metadata` is a restricted scope. Unpacked + test users work for development; public Chrome Web Store release requires Google verification. See `CHROMEWEBSTORE.md` for listing metadata and permission justifications.



## Build



```bash

npm run build

npm run zip

```



## Permissions



- `storage` — local slide status cache

- `identity` — Google sign-in for Drive sync

- `alarms` — periodic background sync for open presentations (1 minute)

- `https://www.googleapis.com/drive/v3/*` — read/write presentation metadata



## Website

https://cteerakit.github.io/progress/

GitHub Pages is served from the `docs/` folder. In the repository settings, set Pages to deploy from branch `main`, folder `/docs`.

Chrome Web Store: https://chromewebstore.google.com/detail/mgebbidbnfnomiilkimbiplmkafccmpf


## Support

If you find Progress useful, you can [sponsor the project on GitHub](https://github.com/sponsors/cteerakit).

## Legal

- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)



## License

MIT — see [LICENSE](LICENSE).

