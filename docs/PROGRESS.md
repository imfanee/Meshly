# Progress log

Newest entries first. One entry per completed task, deploy or notable decision. Never include IP addresses, usernames, keys or other secrets.

Format:

```
## YYYY-MM-DD: <task ID> <short title>
- Changed: ...
- Verified: ...
- Open: ...
- Commit: <hash>
```

## 2026-10-17: T0.1 Environment check

- Changed: installed Node.js v24.22.0 (active LTS "Krypton", satisfies "LTS 22+") to /usr/local from the official tarball with SHA-256 verification; npm 11.19.1 included. Confirmed `agent/commands/*.md` already mirrored into `.claude/commands/` (identical), so `/next-task`, `/status`, `/deploy-web`, `/setup-turn` are available.
- Verified: node v24.22.0, npm 11.19.1, git 2.47.3, OpenSSH 10.0p2, scp (OpenSSH), tar/xz/curl present. OS: Debian 13 (trixie) x86_64, kernel 6.12.
- Note: this environment is Linux at `/root/Meshly`, not the Windows path `D:\Reposetories\Meshly` assumed in AGENTS.md. PowerShell-specific steps (for example `icacls`) do not apply here; key permissions use `chmod 600` instead. Removed the stray `t0.1-env-check.ps1` scratch script (Windows-only, superseded by this check).
- Open: ~960 MB RAM on this VM; large npm installs and Vite builds may be tight. Open questions 1 to 7 in docs/11-ROADMAP-TASKS.md.
- Commit: pending

## 2026-10-17: Project specification

- Changed: README, AGENTS.md, CLAUDE.md, docs 01 to 11, ADRs 0001 to 0008, cPanel and TURN infrastructure files created by the architect's assistant.
- Verified: shell scripts pass `bash -n`; `turn.php` passes `php -l`; docs reviewed for consistency.
- Open: open questions 1 to 7 in docs/11-ROADMAP-TASKS.md.
- Next: T0.1 Environment check.
