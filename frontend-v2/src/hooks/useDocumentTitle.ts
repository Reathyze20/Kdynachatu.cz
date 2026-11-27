import { useEffect } from 'react'

const APP_NAME = 'Kdy na chatu'

/**
 * Sets document.title on mount and restores the app name on unmount. Not the previous title: `index.html`
 * carries the landing page claim (#698), which must not leak into the rest of the app.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME
    return () => { document.title = APP_NAME }
  }, [title])
}
