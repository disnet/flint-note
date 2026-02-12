/**
 * CLI script to generate invite codes.
 *
 * Usage:
 *   bun run sync-server/src/admin/generate-invite.ts [--uses N] [--expires YYYY-MM-DD]
 */
import { generateInviteCode } from '../auth/invite-codes.js';

const args = process.argv.slice(2);

let maxUses = 1;
let expiresAt: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--uses' && args[i + 1]) {
    maxUses = parseInt(args[i + 1], 10);
    if (isNaN(maxUses) || maxUses < 1) {
      console.error('Error: --uses must be a positive integer');
      process.exit(1);
    }
    i++;
  } else if (args[i] === '--expires' && args[i + 1]) {
    expiresAt = args[i + 1];
    // Basic validation
    if (isNaN(Date.parse(expiresAt))) {
      console.error('Error: --expires must be a valid date (e.g., 2025-12-31)');
      process.exit(1);
    }
    i++;
  } else {
    console.error(`Unknown argument: ${args[i]}`);
    console.error('Usage: bun run generate-invite.ts [--uses N] [--expires YYYY-MM-DD]');
    process.exit(1);
  }
}

const code = generateInviteCode(maxUses, expiresAt);

console.log(`Invite code: ${code}`);
console.log(`  Max uses: ${maxUses}`);
if (expiresAt) {
  console.log(`  Expires: ${expiresAt}`);
}
