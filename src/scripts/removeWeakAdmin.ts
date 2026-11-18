/**
 * Cutover security step: remove the weak seed admin account (`admin` /
 * `tajneheslo123`) from the target database before the family starts using it.
 *
 * Idempotent and safe by default:
 *   - DRY RUN by default — prints what it WOULD do and changes nothing. Pass
 *     `--apply` to actually write.
 *   - Only touches an account whose password really verifies against the known
 *     weak default, so a legitimate account that merely happens to be named
 *     `admin` is reported and left untouched (multi-tenant safety).
 *   - Default action is DELETE (the account should not exist after cutover), but
 *     it is automatically downgraded to BLOCK if the account owns any authored
 *     content, so a delete never cascades real reservations/notes away. Pass
 *     `--block` to force block (ban + scramble the password) for every match.
 *   - A second run on an already-clean database finds nothing and exits 0.
 *
 * Finally it VERIFIES the end state: no account named <username> still accepts
 * the weak password. Non-empty failure exits 1.
 *
 * Usage:
 *   tsx src/scripts/removeWeakAdmin.ts                 # dry run, delete mode
 *   tsx src/scripts/removeWeakAdmin.ts --apply         # delete (or block if it owns data)
 *   tsx src/scripts/removeWeakAdmin.ts --apply --block # always block + scramble
 *   tsx src/scripts/removeWeakAdmin.ts --username admin --apply
 *   npm run migration:remove-admin -- --apply
 */
import crypto from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  planWeakAdminCleanup,
  WEAK_ADMIN_USERNAME,
  WEAK_ADMIN_PASSWORD,
  type CleanupMode,
  type WeakAdminCandidate,
} from "./weakAdminCleanup.js";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const mode: CleanupMode = argv.includes("--block") ? "block" : "delete";
  const usernameFlag = argv.indexOf("--username");
  const username =
    usernameFlag >= 0 && argv[usernameFlag + 1] ? argv[usernameFlag + 1] : WEAK_ADMIN_USERNAME;
  return { apply, mode, username };
}

/** Content relations whose presence means a delete would cascade authored data away. */
const OWNED_CONTENT_COUNT = {
  reservations: true,
  notes: true,
  noteThreads: true,
  shoppingListsCreated: true,
  galleryFolders: true,
  galleryPhotos: true,
  diaryFolders: true,
  diaryEntries: true,
  reconstructionItems: true,
  monthlyNotes: true,
  inviteLinksCreated: true,
} as const;

/** Load accounts matching the username, flagging the weak password and owned content. */
async function loadCandidates(username: string): Promise<WeakAdminCandidate[]> {
  const users = await prisma.user.findMany({
    where: { username },
    select: {
      id: true,
      username: true,
      cabinId: true,
      passwordHash: true,
      _count: { select: OWNED_CONTENT_COUNT },
    },
  });

  return Promise.all(
    users.map(async (user) => ({
      id: user.id,
      username: user.username,
      cabinId: user.cabinId,
      hasWeakPassword: await verifyPassword(WEAK_ADMIN_PASSWORD, user.passwordHash),
      ownsData: Object.values(user._count).some((count) => count > 0),
    })),
  );
}

/** Re-query after applying and confirm no matching account still accepts the weak password. */
async function verifyClean(username: string): Promise<WeakAdminCandidate[]> {
  const remaining = await loadCandidates(username);
  return remaining.filter((c) => c.hasWeakPassword);
}

async function main() {
  const { apply, mode, username } = parseArgs(process.argv.slice(2));

  console.log("🔐 Weak admin cleanup (cutover security step)");
  console.log(`   target username : ${username}`);
  console.log(`   mode            : ${mode}${mode === "delete" ? " (auto-downgrades to block if the account owns data)" : ""}`);
  console.log(`   run             : ${apply ? "APPLY (writing changes)" : "DRY RUN (no changes)"}`);
  console.log("");

  const candidates = await loadCandidates(username);
  const plan = planWeakAdminCleanup(candidates, mode);

  if (candidates.length === 0) {
    console.log(`✅ No account named "${username}" found — nothing to do.`);
    return;
  }

  for (const decision of plan.decisions) {
    const marker = decision.action === "skip" ? "•" : apply ? "→" : "~";
    console.log(
      `${marker} [${decision.action.toUpperCase()}] id=${decision.id} cabinId=${decision.cabinId ?? "none"}: ${decision.reason}`,
    );
  }
  console.log("");

  if (!apply) {
    const actionable = plan.summary.delete + plan.summary.block;
    console.log(
      actionable > 0
        ? `DRY RUN: would delete ${plan.summary.delete}, block ${plan.summary.block}, skip ${plan.summary.skip}. Re-run with --apply to perform.`
        : "DRY RUN: nothing actionable.",
    );
    return;
  }

  let deleted = 0;
  let blocked = 0;
  for (const decision of plan.decisions) {
    if (decision.action === "delete") {
      await prisma.user.delete({ where: { id: decision.id } });
      deleted += 1;
    } else if (decision.action === "block") {
      const scrambled = await hashPassword(crypto.randomBytes(32).toString("hex"));
      await prisma.user.update({
        where: { id: decision.id },
        data: { isBanned: true, passwordHash: scrambled },
      });
      blocked += 1;
    }
  }
  console.log(`Applied: deleted=${deleted} blocked=${blocked} skipped=${plan.summary.skip}`);

  const stillWeak = await verifyClean(username);
  if (stillWeak.length > 0) {
    console.error(
      `❌ Verification FAILED: ${stillWeak.length} account(s) named "${username}" still accept the weak password.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Verified: no account named "${username}" accepts the weak password anymore.`);
}

main()
  .catch((error) => {
    console.error("❌ removeWeakAdmin failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
