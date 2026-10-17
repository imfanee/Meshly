---
description: Pick and implement the next Meshly roadmap task
---

1. Read `AGENTS.md` sections 4, 5 and 11 again.
2. Read `docs/PROGRESS.md` and `docs/11-ROADMAP-TASKS.md`. Identify the first unchecked task whose dependencies are complete. If `$ARGUMENTS` names a task ID (for example `T1.6`), use that instead.
3. State the task ID, its goal and acceptance criteria in two or three lines, then read every doc the task references.
4. If the task is behind a user gate (AGENTS.md section 8), prepare everything and stop for approval.
5. Implement in small steps with the task list tool. Add tests.
6. Run `npm run check`, `npm run test`, and `npm run test:e2e` if calls are affected, then `npm run build`.
7. Tick the task, add a dated PROGRESS.md entry, and commit with a Conventional Commit message. Do not push.
8. Report: what was done, how it was verified, anything open. Suggest the next task.
