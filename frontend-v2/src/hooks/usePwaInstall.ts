import { useSyncExternalStore } from 'react'
import { getPwaInstallState, subscribePwaInstall, type PwaInstallState } from '@/lib/pwaInstall'

const SERVER_STATE: PwaInstallState = { isStandalone: false, canInstall: null }

export function usePwaInstall(): PwaInstallState {
  return useSyncExternalStore(subscribePwaInstall, getPwaInstallState, () => SERVER_STATE)
}
