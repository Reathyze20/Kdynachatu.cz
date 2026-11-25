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

/** Změna účtu, která ruší relace (heslo, role, ban, odebrání z chaty), v jedné transakci se zneplatněním. */
export function updateUserAndRevokeSessions(userId: string, data: Prisma.UserUncheckedUpdateInput): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data });
    return revokeUserSessions(userId, tx);
  });
}

/**
 * Smazání účtu. Smazaný uživatel by 401 dostal i bez nové verze, ticket #485 ale chce zneplatnění
 * i tady, aby se na něj ve stejném místě navázalo odpojení socketů (#486).
 */
export function deleteUserAndRevokeSessions(userId: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    await revokeUserSessions(userId, tx);
    await tx.user.delete({ where: { id: userId } });
  });
}
