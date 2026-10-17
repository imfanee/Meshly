---
description: Build and deploy the web folder to cPanel (user-gated)
---

Follow `docs/08-DEPLOYMENT-CPANEL.md`.

1. Confirm `.secrets/sftp.json` exists. If not, ask Faisal for SFTP details (host, port, username, key or password, document root, home folder) and stop.
2. In `app/`: `npm run check`, `npm run test`, `npm run build`. Abort on any failure.
3. Run `npm run deploy -- --dry-run` and show Faisal the file list (new, changed, unchanged) and whether `.htaccess` or `api/turn.php` changed.
4. Wait for an explicit "go". Then run `npm run deploy`.
5. Smoke test: fetch `/`, `/manifest.webmanifest`, `/sw.js` (check `Cache-Control: no-cache`), `/r/test` (must return the app, not 404), and `/api/turn.php` (expect 403 from a non-browser request, or 503 if TURN is not configured yet).
6. Record the deploy in PROGRESS.md with the build version and date.
