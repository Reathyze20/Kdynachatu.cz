/**
 * hooks/useLogout.ts
 * Jediný vstup pro odhlášení, které spustí člověk tlačítkem: profilové menu v sidebaru, šuplík profilu
 * a onboarding (#501). Odhlásí jen toto zařízení a pošle na přihlašovací stránku, ať jde sdílený telefon
 * předat dalšímu. Kontroly před odhlášením (třeba neodeslané offline změny) patří sem, ať platí všude.
 * „Odhlásit všude“ a smazání účtu volají `logout()` z AuthContext až po odpovědi serveru.
 *
 * Neodeslané offline změny (#537): místo odhlášení se otevře `LogoutPendingChangesDialog`, který
 * volající vykreslí s `pendingDialog`. Bez dotazu by změny zůstaly v LocalStorage sdíleného zařízení
 * a další přihlášený účet by je bez upozornění zahodil.
 */
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useQueueLength } from '@/hooks/useOfflineQueue'
import { discardOwnQueue, flushQueue, getQueueLength } from '@/lib/offlineQueue'
import { showToast } from '@/lib/toast'

export interface LogoutPendingChangesDialogProps {
  isOpen: boolean
  pendingCount: number
  sending: boolean
  error: string
  onSend: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** `requestLogout` odhlásí hned, nebo se nejdřív zeptá, když čekají neodeslané změny. */
interface UseLogoutResult { requestLogout: () => void; pendingDialog: LogoutPendingChangesDialogProps }

const SEND_FAILED = 'Změny se nepodařilo odeslat. Zkontroluj připojení a zkus to znovu, nebo je zahoď.'

/** `beforeLogout` se zavolá těsně před odhlášením (šuplík se zavře až tehdy, ne už při dotazu). */
export function useLogout(beforeLogout?: () => void): UseLogoutResult {
  const { logout } = useAuth()
  const navigate = useNavigate()
  // Text dialogu sleduje frontu živě; rozhodnutí v akcích čtou stav fronty v okamžiku kliknutí
  const pendingCount = useQueueLength()
  const [isOpen, setIsOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const logoutNow = useCallback(() => {
    setIsOpen(false)
    beforeLogout?.()
    logout()
    showToast('Odhlášeno.', 'info')
    navigate('/login', { replace: true })
  }, [beforeLogout, logout, navigate])

  const requestLogout = useCallback(() => {
    if (getQueueLength() === 0) {
      logoutNow()
      return
    }
    setError('')
    setIsOpen(true)
  }, [logoutNow])

  const onSend = useCallback(async () => {
    setSending(true)
    setError('')
    let remaining = 1
    try {
      remaining = await flushQueue()
    } catch {
      // Neočekávaná chyba: chovat se jako nepovedené odeslání, změny zůstanou ve frontě
    } finally {
      setSending(false)
    }
    if (remaining > 0) {
      setError(SEND_FAILED)
      return
    }
    logoutNow()
  }, [logoutNow])

  const onDiscard = useCallback(() => {
    discardOwnQueue()
    logoutNow()
  }, [logoutNow])

  const onCancel = useCallback(() => setIsOpen(false), [])

  return {
    requestLogout,
    pendingDialog: { isOpen, pendingCount, sending, error, onSend: () => void onSend(), onDiscard, onCancel },
  }
}
