import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** @param {string} scriptDir - __dirname of the calling script */
export function resolveFirebaseCredentialsPath(scriptDir) {
  const pkgRoot = join(scriptDir, '..');
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    join(pkgRoot, '..', 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json'),
    join(pkgRoot, 'monaco-community-firebase-adminsdk-eyuy1-01d9d7084a.json'),
  ].filter((p) => typeof p === 'string' && p.length > 0);
  return candidates.find((p) => existsSync(p));
}

export function getScriptDir(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}
