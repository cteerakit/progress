import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

const root = join(dirname(fileURLToPath(import.meta.url)));
const publicKeyPath = join(root, 'extension.pub.b64');
const extensionPublicKey = existsSync(publicKeyPath)
  ? readFileSync(publicKeyPath, 'utf8').trim()
  : undefined;

function loadEnvFile(filename: string): void {
  const envPath = join(root, filename);
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const oauthClientId =
  process.env.WXT_OAUTH_CLIENT_ID ??
  'YOUR_CLIENT_ID.apps.googleusercontent.com';

export default defineConfig({
  name: 'progress',
  imports: {
    dirs: [],
  },
  manifest: () => ({
    ...(extensionPublicKey ? { key: extensionPublicKey } : {}),
    name: 'Progress for Google Slides',
    description:
      'Track slide progress in Google Slides and sync with collaborators.',
    permissions: ['storage', 'identity', 'alarms', 'sidePanel'],
    action: {},
    host_permissions: [
      'https://docs.google.com/*',
      'https://slides.googleapis.com/*',
      'https://www.googleapis.com/drive/v3/*',
      'https://www.googleapis.com/oauth2/v3/*',
    ],
    oauth2: {
      client_id: oauthClientId,
      scopes: [
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/drive.metadata',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    },
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  }),
});
