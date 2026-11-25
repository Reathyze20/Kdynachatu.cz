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

// Password reset, e-mail verification and invite tokens must never reach server logs (#481).
// Token-like params in the query or fragment (`token`, `access_token`, `code`, `reset`, `verify`, ...).
const SENSITIVE_PARAM_RE = /([?&#])([a-z0-9_-]*(?:token|code|reset|verify|secret|password|key|sig|signature))=[^&#\s]*/gi
// Invite token lives in the path: page /invite/:token (App.tsx) and API /invites/validate|accept/:token
// (InvitePage.tsx). A new route with a token in the path must be added here.
const INVITE_TOKEN_PATH_RE = /(\/(?:invite|invites\/validate|invites\/accept)\/)[^/?#\s]+/gi

/** Replaces token values in a URL, or in free text containing URLs, with `redacted`. */
function redactTokens<T extends string | undefined>(text: T): T {
  return text
    ?.replace(SENSITIVE_PARAM_RE, '$1$2=redacted')
    .replace(INVITE_TOKEN_PATH_RE, '$1redacted') as T
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
  const snapshot = getLastApiCorrelation()
  const lastApi = snapshot && { ...snapshot, url: redactTokens(snapshot.url) }
  const resolvedUrl = redactTokens(payload.url ?? window.location.href)
  const resolvedPath = redactTokens(payload.path ?? getPathFromUrl(resolvedUrl))
  const requestId = payload.requestId ?? lastApi?.requestId
  const errorId = payload.errorId ?? lastApi?.errorId

  // Fire and forget — don't block the UI
  apiClient.post(endpoint, {
    message: redactTokens(payload.message).slice(0, 1000),
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
