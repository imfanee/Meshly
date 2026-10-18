/**
 * One-off upload of the TURN config + updated turn.php to the cPanel docroot.
 * meshly-config.php lands inside the docroot where .htaccess denies it to HTTP
 * but api/turn.php reads it (jailed-FTP fallback added in T5.5).
 * Run: node scripts/upload-turn-config.mjs
 */
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const secrets = JSON.parse(
  await readFile(new URL('../../.secrets/sftp.json', import.meta.url), 'utf8'),
);

const ftp = await import('basic-ftp');
const c = new ftp.Client(30_000);
const secureOptions = { ...(secrets.secureOptions ?? {}) };
if (secureOptions.servername && !secureOptions.host) {
  secureOptions.host = secureOptions.servername;
}
await c.access({
  host: secrets.host,
  port: secrets.port ?? 21,
  user: secrets.username,
  password: secrets.password,
  secure: true,
  secureOptions,
});

const uploads = [
  [`${ROOT}.secrets/meshly-config.php`, '/meshly-config.php'],
  [`${ROOT}infra/cpanel/api/turn.php`, '/api/turn.php'],
];
for (const [local, remote] of uploads) {
  await c.uploadFrom(local, remote);
  console.log('uploaded', remote);
}
c.close();
