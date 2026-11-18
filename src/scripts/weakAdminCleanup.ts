/**
 * Decision logic for the cutover security step: get rid of the weak seed admin
 * account (`admin` / `tajneheslo123`) before the family starts using the
 * restored backup.
 *
 * `planWeakAdminCleanup` is a pure function: given the accounts that match the
 * target username together with whether each one still uses the known weak
 * password, it decides what to do with each (block, delete, or skip) and tallies
 * a summary. The skip rule is the multi-tenant safety net — an account named
 * `admin` that does NOT use the weak default is a real account and is never
 * touched, no matter which cabin it belongs to.
 *
 * Kept free of any database, bcrypt, or Prisma dependency so it can be
 * unit-tested with `node:test` (see `weakAdminCleanup.test.ts`). The DB side —
 * finding candidates, verifying the password hash, and applying the plan — lives
 * in `removeWeakAdmin.ts`.
 */

/** Username of the legacy seed admin shipped by early `createLearningAdmin` runs. */
export const WEAK_ADMIN_USERNAME = "admin";

/** The known weak password that seed account used; the only one we act on. */
export const WEAK_ADMIN_PASSWORD = "tajneheslo123";

/** What to do with a confirmed weak admin account. */
export type CleanupMode = "block" | "delete";

/** A user whose username matches the target, enriched with a password check. */
export interface WeakAdminCandidate {
  id: string;
  username: string;
  cabinId: string | null;
  /** Whether the stored password hash verifies against `WEAK_ADMIN_PASSWORD`. */
  hasWeakPassword: boolean;
  /** Whether the account authored any content that a delete would cascade away. */
  ownsData: boolean;
}

/** The action decided for a single candidate. `skip` = left untouched. */
export type CleanupAction = CleanupMode | "skip";

export interface CleanupDecision {
  id: string;
  username: string;
  cabinId: string | null;
  action: CleanupAction;
  reason: string;
}

export interface CleanupPlan {
  decisions: CleanupDecision[];
  summary: Record<CleanupAction, number>;
}

/**
 * Decide, per candidate, whether to block it, delete it, or leave it alone.
 *
 * Only candidates that still use the known weak password are acted on; any other
 * account that merely shares the username is skipped with an explicit reason, so
 * the cleanup can never remove a legitimate account — this is what keeps it
 * multi-tenant safe. For actionable candidates the chosen `mode` applies, with
 * one safety override: a `delete` is downgraded to `block` when the account owns
 * data, because most user relations cascade on delete and we never destroy
 * authored content as a side effect. An empty candidate list yields an empty
 * plan, which makes a re-run on an already-clean database a no-op.
 */
export function planWeakAdminCleanup(
  candidates: WeakAdminCandidate[],
  mode: CleanupMode,
): CleanupPlan {
  const summary: Record<CleanupAction, number> = { delete: 0, block: 0, skip: 0 };

  const decisions = candidates.map((candidate): CleanupDecision => {
    const { action, reason } = decideAction(candidate, mode);
    summary[action] += 1;

    return {
      id: candidate.id,
      username: candidate.username,
      cabinId: candidate.cabinId,
      action,
      reason,
    };
  });

  return { decisions, summary };
}

function decideAction(
  candidate: WeakAdminCandidate,
  mode: CleanupMode,
): { action: CleanupAction; reason: string } {
  if (!candidate.hasWeakPassword) {
    return {
      action: "skip",
      reason: "password is not the known weak default — left untouched (real account)",
    };
  }

  if (mode === "delete" && candidate.ownsData) {
    return {
      action: "block",
      reason:
        "known weak default password, but the account owns data — blocking instead of deleting to avoid cascading data loss",
    };
  }

  if (mode === "delete") {
    return { action: "delete", reason: "known weak default password — deleting the account" };
  }

  return {
    action: "block",
    reason: "known weak default password — blocking login and scrambling the password",
  };
}
