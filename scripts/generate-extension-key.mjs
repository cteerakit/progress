#!/usr/bin/env node
/**
 * Generate a stable RSA key pair for unpacked Chrome extension development.
 * Writes extension.pub.b64 (commit this) and extension.pem (private, gitignored).
 */

import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateKeyPath = join(root, 'extension.pem');
const publicKeyPath = join(root, 'extension.pub.b64');

function extensionIdFromPublicKeyDer(der) {
  const digest = createHash('sha256').update(der).digest().subarray(0, 16);
  return [...digest]
    .map((byte) => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f)))
    .join('');
}

if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
  const pubB64 = readFileSync(publicKeyPath, 'utf8').trim();
  const id = extensionIdFromPublicKeyDer(Buffer.from(pubB64, 'base64'));
  console.log('Key files already exist.');
  console.log(`Extension ID: ${id}`);
  console.log('Register this ID in Google Cloud OAuth (Chrome extension client).');
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const pubB64 = publicKey.toString('base64');
writeFileSync(privateKeyPath, privateKey, 'utf8');
writeFileSync(publicKeyPath, `${pubB64}\n`, 'utf8');

const extensionId = extensionIdFromPublicKeyDer(publicKey);
console.log(`Created ${publicKeyPath}`);
console.log(`Created ${privateKeyPath} (gitignored — keep this safe)`);
console.log(`Extension ID: ${extensionId}`);
console.log('Add this ID to your Google Cloud OAuth Chrome extension client.');
