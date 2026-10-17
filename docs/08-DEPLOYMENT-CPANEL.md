# 08 Deployment on cPanel

Meshly deploys as static files plus one PHP script to a cPanel subdomain. The agent builds into `web/` and uploads over SFTP (or Faisal uploads `web/` manually with File Manager or an FTP client).

## 1. One-time cPanel setup (Faisal, guided by the agent)

1. **Subdomain:** cPanel, Domains, Create A New Domain: `meshly.<domain>`. Note the document root (for example `/home/<user>/meshly.<domain>` or `/home/<user>/public_html/meshly`).
2. **SSL:** cPanel, SSL/TLS Status, run AutoSSL for the subdomain. HTTPS is mandatory (camera, mic and service workers require it).
3. **PHP:** cPanel, MultiPHP Manager, set the subdomain to PHP 8.1 or newer. Extensions `hash` and `json` are standard. `posix` is used if present to find the home folder.
4. **SFTP access:** cPanel, SSH Access, either import Faisal's public key (preferred) or use the account password. Some hosts expose SFTP on a non-standard port. If SSH/SFTP is disabled by the host, use FTPS (cPanel, FTP Accounts) and the deploy script's FTPS mode.
5. **DNS for TURN (when ready):** cPanel, Zone Editor, add `A` record `turn.<domain>` pointing at the Proxmox public IP, TTL 300.
6. Faisal writes the details into `.secrets/sftp.json`:

```json
{
  "protocol": "sftp",
  "host": "server.hosting-provider.com",
  "port": 22,
  "username": "cpaneluser",
  "privateKeyPath": ".secrets/cpanel_key",
  "password": null,
  "remoteDir": "/home/cpaneluser/meshly.example.com",
  "homeDir": "/home/cpaneluser"
}
```

## 2. Files on the server

```
/home/<user>/
├── meshly-config.php          TURN secret and settings (outside any document root, chmod 600)
├── .meshly-ratelimit/         created by turn.php (rate-limit counters)
└── meshly.<domain>/           document root = contents of web/
    ├── .htaccess              from infra/cpanel/.htaccess
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js, workbox-*.js
    ├── api/turn.php           from infra/cpanel/api/turn.php
    ├── assets/                hashed JS/CSS (+ .htaccess for long cache)
    ├── fonts/, icons/, sounds/
    └── og.png, robots.txt
```

The agent copies `infra/cpanel/.htaccess` to `app/public/.htaccess`, `infra/cpanel/assets.htaccess` to `app/public/assets/.htaccess`, and `infra/cpanel/api/turn.php` to `app/public/api/turn.php` at scaffold time (or via a small prebuild script so `infra/` stays the source of truth: preferred).

## 3. TURN credential config

Render `.secrets/meshly-config.php` from `infra/cpanel/meshly-config.php.example` using values in `.secrets/turn.env`, then upload it to `homeDir` with mode 600. Until coturn exists, do not upload it: `turn.php` then returns 503 and the client stays on STUN only (by design).

## 4. Deploy script (`app/scripts/deploy.mjs`)

Agent implements; dependencies `ssh2-sftp-client` (and `basic-ftp` for FTPS mode) as dev dependencies. Behaviour:

1. Read `.secrets/sftp.json` (path relative to repo root). Refuse to run if `web/index.html` is missing or older than the newest file in `app/src`.
2. Build a manifest of local files with size and SHA-256. Fetch the remote listing of `remoteDir` (recursive).
3. Upload order: everything under `assets/`, `fonts/`, `icons/`, `sounds/` first; then other files; then `index.html`, `manifest.webmanifest`; `sw.js` last. This prevents clients fetching a new `index.html` that references assets not yet uploaded.
4. Skip unchanged files (same size and hash, using a remote `.deploy-manifest.json` written at the end).
5. Never delete outside `remoteDir`. Old hashed assets: keep the previous two releases (listed in `.deploy-manifest.json` history), delete older ones.
6. Flags: `--dry-run` (print plan only), `--config-only` (upload `meshly-config.php` to `homeDir`, chmod 600), `--verbose`.
7. Print a summary: uploaded, skipped, deleted, bytes, duration.

`package.json` scripts: `"deploy": "node scripts/deploy.mjs"`, `"deploy:dry": "node scripts/deploy.mjs --dry-run"`.

## 5. Smoke tests after deploy

```bash
curl -sI https://meshly.example.com/ | grep -iE "200|content-security-policy|strict-transport"
curl -sI https://meshly.example.com/sw.js | grep -i "cache-control: no-cache"
curl -sI https://meshly.example.com/manifest.webmanifest | grep -i "application/manifest+json"
curl -s  https://meshly.example.com/r/abcdefghij | grep -q "<div id=\"app\"" && echo "SPA fallback ok"
curl -s -o /dev/null -w "%{http_code}\n" https://meshly.example.com/api/turn.php   # expect 403 (no browser headers) or 503 (not configured)
curl -s -o /dev/null -w "%{http_code}\n" https://meshly.example.com/meshly-config.php  # expect 404
```

Then a real browser check: Chrome DevTools, Application, Manifest (installable, no errors), Service workers (activated), and a two-device call.

## 6. Updates and rollback

- Every build embeds `version` (from `app/package.json`) and `buildTime`. Shown in Settings, About and the footer.
- Rollback: rebuild the previous git tag and deploy. Because hashed assets of the last two releases are kept, clients mid-session are not broken.
- Bump the patch version for fixes, minor for features. Tag releases `v1.2.3` (push tags only with approval).

## 7. LiteSpeed and Apache notes

Many cPanel hosts run LiteSpeed, which honours `.htaccess` rewrite and header directives used here. If a header does not appear in smoke tests, check that `mod_headers` equivalents are enabled with the host and report to Faisal; do not move headers into `<meta>` tags except CSP as a last resort (CSP via `<meta>` cannot set `frame-ancestors`).
