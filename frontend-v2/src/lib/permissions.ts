/**
 * lib/permissions.ts — kdo smí upravit nebo smazat cizí obsah (#507).
 *
 * Zrcadlí kontrolu na backendu (autor nebo správce), aby aplikace nenabízela akci,
 * kterou server odmítne s 403. Rozhoduje dál server; tohle jen schová tlačítka.
 */
import type { AuthUser } from '@/context/AuthContext'

type Actor = Partial<Pick<AuthUser, 'userId' | 'username' | 'role'>> | null | undefined

/** Autor podle ID (témata chatu) nebo podle uživatelského jména (deník, galerie – API vrací jen jméno). */
export interface Author {
  id?: string | null
  username?: string | null
}

export function isAuthorOrAdmin(user: Actor, author: Author): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (author.id) return author.id === user.userId
  if (author.username) return author.username === user.username
  return false
}
