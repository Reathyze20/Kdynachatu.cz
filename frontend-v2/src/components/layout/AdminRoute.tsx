/**
 * components/layout/AdminRoute.tsx
 * Guard pro routy správy (zabrání i lazy-loadu jejich chunků). Běžného člena vrátí na Přehled
 * a řekne mu proč (#524), jinak by nevěděl, kam zmizela stránka, kterou otevřel z odkazu.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/lib/toast'

function AdminOnlyRedirect() {
  // StrictMode spouští efekt dvakrát, ref drží stav mezi oběma běhy
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current) return
    shown.current = true
    showToast('Tohle může jen správce chaty.', 'info')
  }, [])
  return <Navigate to="/dashboard" replace />
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <AdminOnlyRedirect />
  return <>{children}</>
}
