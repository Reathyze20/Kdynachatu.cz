/**
 * hooks/useUnsavedChangesGuard.ts
 * Hlídá neuložené změny formuláře: odchod jinam v aplikaci podrží, dokud ho uživatel nepotvrdí,
 * a zavření nebo obnovení okna zastaví přes `beforeunload`.
 *
 * Appka běží na <BrowserRouter>, ne na data routeru, takže `useBlocker` nejde použít.
 * Místo něj se po dobu neuložených změn obalí navigator routeru (push/replace/go), přes který
 * jdou všechny `<Link>`, `<NavLink>` i `navigate()`. Tlačítko Zpět prohlížeče tím chycené není.
 */
import { useContext, useEffect, useState } from 'react'
import { UNSAFE_NavigationContext, createPath, useLocation, type To } from 'react-router-dom'

export interface UnsavedChangesGuard {
  /** Navigace čeká na potvrzení – zobraz dialog. */
  isBlocked: boolean
  /** Odejít bez uložení: dokončí podrženou navigaci. */
  proceed: () => void
  /** Zůstat na stránce: podrženou navigaci zahodí. */
  stay: () => void
}

type NavigateFn = (to: To, ...rest: unknown[]) => void

/** Cesta i s query: obojí může přepnout obsah stránky (např. `?panel=` ve správě), kotva ne. */
function targetPath(to: To, current: string): string {
  const url = new URL(typeof to === 'string' ? to : createPath(to), `http://app${current}`)
  return url.pathname + url.search
}

interface HistoryNavigator {
  push: NavigateFn
  replace: NavigateFn
  go: (delta: number) => void
}

/**
 * Přesměruje navigaci mimo `current` (cesta + query) do `hold`; změna jen kotvy formulář
 * neodmountuje, ta projde. Vrací funkci, která navigator vrátí do původního stavu.
 */
function interceptNavigator(navigator: HistoryNavigator, current: string, hold: (run: () => void) => void): () => void {
  const { push, replace, go } = navigator
  const guarded = (original: NavigateFn): NavigateFn => (to, ...rest) => {
    if (targetPath(to, current) === current) original(to, ...rest)
    else hold(() => original(to, ...rest))
  }
  navigator.push = guarded(push)
  navigator.replace = guarded(replace)
  navigator.go = (delta) => hold(() => go(delta))
  return () => {
    navigator.push = push
    navigator.replace = replace
    navigator.go = go
  }
}

export function useUnsavedChangesGuard(isDirty: boolean): UnsavedChangesGuard {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const { pathname, search } = useLocation()
  const [pending, setPending] = useState<(() => void) | null>(null)

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = '' // starší Safari a Chrome se bez returnValue nezeptají
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty) return
    return interceptNavigator(navigator as unknown as HistoryNavigator, pathname + search, (run) => setPending(() => run))
  }, [isDirty, navigator, pathname, search])

  return {
    isBlocked: pending !== null,
    proceed: () => {
      const run = pending
      setPending(null)
      run?.()
    },
    stay: () => setPending(null),
  }
}
