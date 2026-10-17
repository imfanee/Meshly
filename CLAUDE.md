# CLAUDE.md

This project is built by an AI agent. All instructions live in AGENTS.md so any agent can use them; Claude Code loads them through the import below.

@AGENTS.md

## Claude Code specifics

- Task prompts live in `agent/commands/`. In task T0.1, copy them into `.claude/commands/` (create the folder) so `/next-task`, `/status`, `/deploy-web` and `/setup-turn` work as slash commands. Keep `agent/commands/` as the source of truth.
- Use the task list tool to track the steps of the current roadmap task.
- Run shell scripts through Git Bash on this Windows machine; use PowerShell for Windows-specific commands such as `icacls`.
- Never run `git push`, a production deploy, or any write command on the Proxmox host without Faisal's explicit approval in the current conversation.
