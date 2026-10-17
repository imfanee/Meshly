#!/usr/bin/env node
/**
 * Meshly deploy script (SFTP to cPanel).
 *
 * The full implementation lands in task T1.11 and follows
 * docs/08-DEPLOYMENT-CPANEL.md section 4. Until then this stub keeps the npm
 * scripts (`deploy`, `deploy:dry`) runnable without doing anything dangerous.
 */

const dryRun = process.argv.includes('--dry-run');
console.log(
  `deploy${dryRun ? ' --dry-run' : ''}: not implemented yet (task T1.11). Nothing was uploaded.`,
);
