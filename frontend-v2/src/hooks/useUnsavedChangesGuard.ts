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
import { UNSAFE_NavigationContext, useLocation, type To } from 'react-router-dom'

export interface UnsavedChangesGuard {
  /** Navigace čeká na potvrzení – zobraz dialog. */
  isBlocked: boolean
  /** Odejít bez uložení: dokončí podrženou navigaci. */
  proceed: () => void
  /** Zůstat na stránce: podrženou navigaci zahodí. */
  stay: () => void
}

type NavigateFn = (to: To, ...rest: unknown[]) => void

function targetPathname(to: To, currentPathname: string): string {
  if (typeof to === 'string') return new URL(to, `http://app${currentPathname}`).pathname
  return to.pathname || currentPathname
}

interface HistoryNavigator {
  push: NavigateFn
  replace: NavigateFn
  go: (delta: number) => void
}

/**
 * Přesměruje navigaci mimo `pathname` do `hold`; změna jen kotvy nebo query na stejné stránce
 * formulář neodmountuje, ta projde. Vrací funkci, která navigator vrátí do původního stavu.
 */
function interceptNavigator(navigator: HistoryNavigator, pathname: string, hold: (run: () => void) => void): () => void {
  const { push, replace, go } = navigator
  const guarded = (original: NavigateFn): NavigateFn => (to, ...rest) => {
    if (targetPathname(to, pathname) === pathname) original(to, ...rest)
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
  const { pathname } = useLocation()
  const [pending, setPending] = useState<(() => void) | null>(null)

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Starší Safari a Chrome ukážou dotaz jen s nastaveným returnValue.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty) return
    return interceptNavigator(navigator as unknown as HistoryNavigator, pathname, (run) => setPending(() => run))
  }, [isDirty, navigator, pathname])

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
