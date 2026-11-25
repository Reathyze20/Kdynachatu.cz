import type { Prisma } from "../generated/prisma/client.js";
import prisma from "./prisma";
import { disconnectUserSockets } from "./socket";

/**
 * Zneplatní všechna přihlášení uživatele (#485): zvýší `User.tokenVersion`, takže auth middleware
 * i socket handshake odmítnou každý dříve vydaný token. Volá se při změně a resetu hesla, banu, odebrání z chaty,
 * změně role, smazání účtu a z „Odhlásit všude“. Exportované funkce po commitu odpojí sockety uživatele (#486);
 * až po commitu, protože klient se hned připojuje znovu a handshake už musí vidět novou verzi.
 */
async function bumpTokenVersion(userId: string, db: Prisma.TransactionClient): Promise<number> {
  const { tokenVersion } = await db.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return tokenVersion;
}

/** Zneplatní relace a odpojí sockety. Vrací novou verzi (pro nový token aktuálního zařízení). */
export async function revokeUserSessions(userId: string): Promise<number> {
  const tokenVersion = await bumpTokenVersion(userId, prisma);
  disconnectUserSockets(userId);
  return tokenVersion;
}

/** Změna účtu, která ruší relace (heslo, role, ban, odebrání z chaty), v jedné transakci se zneplatněním. */
export async function updateUserAndRevokeSessions(userId: string, data: Prisma.UserUncheckedUpdateInput): Promise<number> {
  const tokenVersion = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data });
    return bumpTokenVersion(userId, tx);
  });
  disconnectUserSockets(userId);
  return tokenVersion;
}

/**
 * Smazání účtu. Smazaný uživatel by 401 dostal i bez nové verze, ticket #485 ale chce zneplatnění
 * i tady, aby se na něj ve stejném místě navázalo odpojení socketů (#486).
 */
export async function deleteUserAndRevokeSessions(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await bumpTokenVersion(userId, tx);
    await tx.user.delete({ where: { id: userId } });
  });
  disconnectUserSockets(userId);
}
