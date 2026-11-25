/**
 * hooks/useLogout.ts
 * Jediný vstup pro odhlášení, které spustí člověk tlačítkem: profilové menu v sidebaru, šuplík profilu
 * a onboarding (#501). Odhlásí jen toto zařízení a pošle na přihlašovací stránku, ať jde sdílený telefon
 * předat dalšímu. Kontroly před odhlášením (třeba neodeslané offline změny) patří sem, ať platí všude.
 * „Odhlásit všude“ a smazání účtu volají `logout()` z AuthContext až po odpovědi serveru.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/lib/toast'

export function useLogout(): () => void {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return useCallback(() => {
    logout()
    showToast('Odhlášeno.', 'info')
    navigate('/login', { replace: true })
  }, [logout, navigate])
}
