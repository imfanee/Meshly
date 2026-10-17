# ADR 0001: Static PWA on cPanel, no application backend

**Status:** Accepted (2026-10-17)

## Context

Meshly must be free to run, maintainable by one person, and a showcase of serverless real-time design. Faisal has cPanel shared hosting (static files, PHP) and wants the installed app to run from the device and update itself.

## Decision

- Ship Meshly as a static Progressive Web App built with Vite into `web/`, hosted on a cPanel subdomain.
- The only server-side code is a stateless PHP script that mints short-lived TURN credentials.
- A service worker precaches the app shell, so the installed app opens without the host and updates with a prompt.
- No databases, accounts, analytics or server-side session state.

## Consequences

- Zero running cost beyond existing hosting; trivial to redeploy anywhere static.
- All coordination must happen client-side over public relays (ADR 0002), and all policy enforcement relies on cryptography rather than a server (ADR 0007).
- No server-side abuse controls beyond TURN rate limiting; acceptable for a free demo service.
