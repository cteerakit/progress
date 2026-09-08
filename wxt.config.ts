import { defineConfig } from 'wxt';

const oauthClientId =
  process.env.WXT_OAUTH_CLIENT_ID ??
  'YOUR_CLIENT_ID.apps.googleusercontent.com';

export default defineConfig({
  manifest: {
    name: 'Slide Status',
    description:
      'Assign To do, In progress, and Done statuses to Google Slides and sync with collaborators.',
    permissions: ['storage', 'identity'],
    host_permissions: ['https://www.googleapis.com/drive/v3/*'],
    oauth2: {
      client_id: oauthClientId,
      scopes: ['https://www.googleapis.com/auth/drive.metadata'],
    },
    action: {},
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
