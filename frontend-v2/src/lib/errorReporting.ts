import apiClient from '@/api/client'
import { getLastApiCorrelation, getSupportCodeFromSnapshot } from '@/lib/observability'

interface ClientErrorPayload {
  message: string
  stack?: string
  url?: string
  path?: string
  component?: string
  context?: Record<string, unknown>
  requestId?: string
  errorId?: string
  level?: 'error' | 'warn'
}

// Tokeny resetu hesla, ověření e-mailu a pozvánek nesmí skončit v serverových logech (#481).
// Parametry v query i ve fragmentu (`token`, `access_token`, `code`, `reset`, `verify`…).
const SENSITIVE_PARAM_RE = /([?&#])((?:[a-z0-9]+[_-])?(?:token|code|reset|verify|secret|password|key|sig|signature))=[^&#]*/gi
// Token pozvánky je v cestě: stránka /invite/:token a API /invites/validate|accept/:token.
const INVITE_TOKEN_PATH_RE = /(\/(?:invite|invites\/validate|invites\/accept)\/)[^/?#]+/gi

function redactUrl(url: string | undefined): string | undefined {
  return url
    ?.replace(SENSITIVE_PARAM_RE, '$1$2=redacted')
    .replace(INVITE_TOKEN_PATH_RE, '$1redacted')
}

function getPathFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined

  try {
    return new URL(url, window.location.origin).pathname
  } catch {
    return undefined
  }
}

/**
 * Report a client-side error to the backend logging endpoint.
 * Authenticated users → /api/logs/client, anonymous → /api/logs/client/anon.
 */
export function reportError(payload: ClientErrorPayload, isAuthenticated = true): void {
  const endpoint = isAuthenticated ? '/logs/client' : '/logs/client/anon'
  const lastApi = getLastApiCorrelation()
  if (lastApi?.url) lastApi.url = redactUrl(lastApi.url)
  const resolvedUrl = redactUrl(payload.url ?? window.location.href)
  const resolvedPath = redactUrl(payload.path ?? getPathFromUrl(resolvedUrl))
  const requestId = payload.requestId ?? lastApi?.requestId
  const errorId = payload.errorId ?? lastApi?.errorId

  // Fire and forget — don't block the UI
  apiClient.post(endpoint, {
    message: payload.message.slice(0, 1000),
    stack: payload.stack?.slice(0, 5000),
    url: resolvedUrl,
    path: resolvedPath,
    component: payload.component?.slice(0, 100),
    requestId,
    errorId,
    context: {
      ...payload.context,
      supportCode: getSupportCodeFromSnapshot(lastApi),
      lastApi,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    },
    level: payload.level ?? 'error',
  }).catch(() => {
    // Silently fail — we don't want error reporting to cause more errors
  })
}

/**
 * Install global error handlers that automatically report uncaught errors.
 */
export function installGlobalErrorHandlers(isAuthenticated: () => boolean): void {
  window.addEventListener('error', (event) => {
    reportError({
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      url: window.location.href,
      component: 'window.onerror',
    }, isAuthenticated())
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    reportError({
      message: `Unhandled rejection: ${message}`,
      stack,
      url: window.location.href,
      component: 'unhandledrejection',
    }, isAuthenticated())
  })
}
