#!/usr/bin/env node
/**
 * Meshly deploy script, docs/08-DEPLOYMENT-CPANEL.md section 4.
 *
 * Uploads web/ to the cPanel docroot over FTPS (basic-ftp) or SFTP
 * (ssh2-sftp-client), in an order that never leaves a client fetching an
 * index.html whose hashed assets are missing:
 *   assets/, fonts/, icons/, sounds/ -> other files -> index.html,
 *   manifest.webmanifest -> sw.js last.
 *
 * Unchanged files are skipped via the remote .deploy-manifest.json; hashed
 * assets of the previous two releases are kept so mid-session clients do
 * not break.
 *
 * Flags: --dry-run (plan only), --config-only (meshly-config.php to homeDir),
 * --verbose.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const webDir = join(root, 'web');
const secretsPath = join(root, '.secrets', 'sftp.json');
const MANIFEST = '.deploy-manifest.json';
const KEEP_RELEASES = 2;

const dryRun = process.argv.includes('--dry-run');
const configOnly = process.argv.includes('--config-only');
const verbose = process.argv.includes('--verbose');
const say = (m) => console.log(m);
const vlog = (m) => verbose && say(m);

function die(msg, code = 1) {
  console.error(`deploy: ${msg}`);
  process.exit(code);
}

// ---- sanity -------------------------------------------------------------
if (!existsSync(secretsPath)) die(`missing ${secretsPath}`);
const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'));
const remoteDir = secrets.remoteDir?.replace(/\/+$/, '') || '/';

if (configOnly) {
  await uploadConfigOnly(secrets);
  process.exit(0);
}

if (!existsSync(join(webDir, 'index.html'))) {
  die('web/index.html missing. Run `npm run build` first.');
}
// Refuse to deploy a stale build: web must be newer than app/src.
const newestSrc = Math.max(
  ...walk(join(root, 'app', 'src')).map((f) => statSync(f).mtimeMs),
);
if (statSync(join(webDir, 'index.html')).mtimeMs < newestSrc) {
  die('web/ is older than app/src. Run `npm run build` first.');
}

// ---- local file manifest -------------------------------------------------
const localFiles = walk(webDir)
  .filter((f) => statSync(f).isFile())
  .map((abs) => {
    const rel = relative(webDir, abs).replaceAll('\\', '/');
    const buf = readFileSync(abs);
    return {
      rel,
      abs,
      size: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    };
  });
if (!localFiles.length) die('web/ is empty.');

// Upload order: hashed/static dirs first, then misc, then html/manifest,
// sw.js dead last (doc 08 s.4).
const EARLY = /^(assets|fonts|icons|sounds)\//;
const LAST = ['sw.js'];
const order = (f) =>
  LAST.includes(f.rel)
    ? 3
    : f.rel === 'index.html' || f.rel === 'manifest.webmanifest'
      ? 2
      : EARLY.test(f.rel)
        ? 0
        : 1;
localFiles.sort((a, b) => order(a) - order(b) || a.rel.localeCompare(b.rel));

// ---- remote connection ---------------------------------------------------
let client;
const listRemote = async (dir) => {
  const files = [];
  for (const e of await client.list(dir)) {
    const p = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`;
    if (e.type === 2) files.push(...(await listRemote(p)));
    else files.push({ path: p, size: e.size });
  }
  return files;
};

if (secrets.protocol === 'ftps') {
  const ftp = await import('basic-ftp');
  const c = new ftp.Client(30_000);
  // Shared hosting certs name the server, not the domain: make the TLS
  // check validate the pinned servername (basic-ftp passes secureOptions
  // straight to tls.connect and would otherwise use the connect host).
  const secureOptions = { ...(secrets.secureOptions ?? {}) };
  if (secureOptions.servername && !secureOptions.host) {
    secureOptions.host = secureOptions.servername;
  }
  const access = {
    host: secrets.host,
    port: secrets.port ?? 21,
    user: secrets.username,
    password: secrets.password,
    secure: true,
    secureOptions,
  };
  client = {
    connect: () => c.access(access),
    close: () => c.close(),
    list: (dir) =>
      c.list(dir === '/' ? '' : dir).then((l) =>
        l.map((e) => ({
          name: e.name,
          type: e.isDirectory ? 2 : 1,
          size: e.size,
        })),
      ),
    ensureDir: (dir) => c.ensureDir(dir),
    upload: (local, remote) => c.uploadFrom(local, remote),
    remove: (remote) => c.remove(remote),
    download: (local, remote) => c.downloadTo(local, remote),
    send: (cmd) => c.send(cmd),
  };
} else {
  const sftp = (await import('ssh2-sftp-client')).default;
  const c = new sftp();
  client = {
    connect: () =>
      c.connect({
        host: secrets.host,
        port: secrets.port ?? 22,
        username: secrets.username,
        password: secrets.password,
        privateKey: secrets.privateKeyPath
          ? readFileSync(join(root, secrets.privateKeyPath))
          : undefined,
      }),
    close: () => c.end(),
    list: async (dir) => {
      try {
        const l = await c.list(dir);
        return l.map((e) => ({
          name: e.name,
          type: e.type === 'd' ? 2 : 1,
          size: e.size,
        }));
      } catch {
        return [];
      }
    },
    ensureDir: async (dir) => {
      const parts = dir.split('/').filter(Boolean);
      let cur = '';
      for (const p of parts) {
        cur += '/' + p;
        if (!(await c.exists(cur))) await c.mkdir(cur);
      }
    },
    upload: (local, remote) => c.fastPut(local, remote),
    remove: (remote) => c.delete(remote),
    download: async (local, remote) => {
      const b = await c.get(remote);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(local, b);
    },
    send: async () => undefined,
  };
}

// ---- plan -----------------------------------------------------------------
say(
  `deploy${dryRun ? ' --dry-run' : ''}: ${secrets.protocol}://${secrets.host} -> ${remoteDir}`,
);
await client.connect();

let remoteManifest = { files: {}, releases: [] };
try {
  const tmp = join(root, 'app', 'node_modules', '.cache-deploy-manifest.json');
  await client.download(
    tmp,
    `${remoteDir === '/' ? '' : remoteDir}/${MANIFEST}`,
  );
  remoteManifest = JSON.parse(readFileSync(tmp, 'utf8'));
} catch {
  /* no manifest yet */
}

const remoteList = await listRemote(remoteDir).catch(() => []);
vlog(`remote files: ${remoteList.length}`);

const toUpload = [];
const toDelete = [];
const release = new Date().toISOString().slice(0, 10);

for (const f of localFiles) {
  const prev = remoteManifest.files?.[f.rel];
  if (prev && prev.sha256 === f.sha256) {
    vlog(`skip ${f.rel}`);
    continue;
  }
  toUpload.push(f);
}

// Hashed-asset retention: keep the last two releases' assets.
const assetReleases = remoteManifest.releases ?? [];
const oldReleases = assetReleases.slice(
  0,
  Math.max(0, assetReleases.length - KEEP_RELEASES),
);
const localSet = new Set(localFiles.map((f) => f.rel));
for (const r of remoteList) {
  const rel = r.path.startsWith(remoteDir === '/' ? '/' : `${remoteDir}/`)
    ? r.path.slice(remoteDir === '/' ? 1 : remoteDir.length + 1)
    : r.path;
  if (localSet.has(rel) || rel === MANIFEST) continue;
  const hashed =
    EARLY.test(rel) && /[-._][0-9A-Za-z_-]{6,}\.[a-z0-9]+$/i.test(rel);
  const old = oldReleases.includes(
    rel.split('/').pop()?.split('.').slice(0, -1).join('.'),
  );
  if (hashed || old) toDelete.push(rel);
}

const bytes = toUpload.reduce((n, f) => n + f.size, 0);
say(
  `plan: ${toUpload.length} upload (${(bytes / 1024).toFixed(0)} KB), ` +
    `${localFiles.length - toUpload.length} skip, ${toDelete.length} delete`,
);

if (dryRun) {
  for (const f of toUpload) say(`  + ${f.rel} (${f.size} B)`);
  for (const d of toDelete) say(`  - ${d}`);
  await client.close();
  process.exit(0);
}

// ---- deploy ----------------------------------------------------------------
const t0 = Date.now();
for (const f of toUpload) {
  const dir = f.rel.includes('/')
    ? `${remoteDir === '/' ? '' : remoteDir}/${f.rel.slice(0, f.rel.lastIndexOf('/'))}`
    : remoteDir;
  if (dir !== remoteDir) await client.ensureDir(dir);
  await client.upload(f.abs, `${remoteDir === '/' ? '' : remoteDir}/${f.rel}`);
  vlog(`+ ${f.rel}`);
}
for (const d of toDelete) {
  await client
    .remove(`${remoteDir === '/' ? '' : remoteDir}/${d}`)
    .catch(() => undefined);
}

// Write the new manifest last of all.
const manifestData = {
  version: JSON.parse(readFileSync(join(root, 'app', 'package.json'), 'utf8'))
    .version,
  deployedAt: new Date().toISOString(),
  files: Object.fromEntries(
    localFiles.map((f) => [f.rel, { sha256: f.sha256, size: f.size }]),
  ),
  releases: [release, ...assetReleases].slice(0, 5),
};
const tmpM = join(root, 'app', 'node_modules', '.cache-deploy-write.json');
const { writeFileSync } = await import('node:fs');
writeFileSync(tmpM, JSON.stringify(manifestData, null, 2));
await client.upload(tmpM, `${remoteDir === '/' ? '' : remoteDir}/${MANIFEST}`);

await client.close();
say(
  `done: ${toUpload.length} uploaded, ${toDelete.length} deleted, ` +
    `${(bytes / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);

// ---- helpers ---------------------------------------------------------------
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

async function uploadConfigOnly(cfg) {
  const src = join(root, '.secrets', 'meshly-config.php');
  if (!existsSync(src)) die('missing .secrets/meshly-config.php');
  if (!cfg.homeDir)
    die(
      'sftp.json has no homeDir (account is jailed); upload meshly-config.php manually via cPanel File Manager.',
    );
  say('--config-only: uploading meshly-config.php to homeDir');
  if (dryRun) {
    say(`  + ${cfg.homeDir}/meshly-config.php (600)`);
    return;
  }
  const ftp = await import('basic-ftp');
  const c = new ftp.Client(30_000);
  await c.access({
    host: cfg.host,
    port: cfg.port ?? 21,
    user: cfg.username,
    password: cfg.password,
    secure: true,
    secureOptions: cfg.secureOptions ?? {},
  });
  await c.uploadFrom(src, `${cfg.homeDir}/meshly-config.php`);
  await c
    .send(`SITE CHMOD 600 ${cfg.homeDir}/meshly-config.php`)
    .catch(() => undefined);
  c.close();
  say('done: meshly-config.php uploaded');
}
