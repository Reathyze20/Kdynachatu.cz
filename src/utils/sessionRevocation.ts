import type { Prisma } from "../generated/prisma/client.js";
import prisma from "./prisma";

/**
 * Zneplatní všechna přihlášení uživatele (#485): zvýší `User.tokenVersion`, takže auth middleware
 * odmítne každý dříve vydaný token (401). Volá se při změně a resetu hesla, banu, odebrání z chaty,
 * změně role, smazání účtu a z „Odhlásit všude“. Odpojení socketů sem doplní #486.
 *
 * `db` = transakční klient, aby se verze zvedla atomicky se změnou, která relace ruší.
 * Vrací novou verzi (pro nový token aktuálního zařízení po změně vlastního hesla).
 */
export async function revokeUserSessions(userId: string, db: Prisma.TransactionClient = prisma): Promise<number> {
  const { tokenVersion } = await db.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return tokenVersion;
}
