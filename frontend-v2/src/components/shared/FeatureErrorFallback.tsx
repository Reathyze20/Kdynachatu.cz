/**
 * FeatureErrorFallback.tsx — Klidná chybová karta sekce, která se nenačetla (DESIGN.md §7 „Stavy“, #512).
 * Co se stalo + „Zkus to znovu.“, jedno tlačítko a technické údaje sbalené pod „Podrobnosti pro podporu“.
 * Zbytek stránky funguje normálně.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Copy, Check, ChevronDown, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/shared/Card'
import type { FallbackProps } from 'react-error-boundary'
import { reportError } from '@/lib/errorReporting'
import { extractSupportErrorDetails, formatSupportBlock } from '@/lib/errorDetails'

type ErrorWithMessage = { message?: string; stack?: string }

function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* silent */ })
  }, [text])

  return (
    <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={handleCopy} aria-label="Zkopírovat informace o chybě">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Zkopírováno' : 'Zkopírovat'}
    </Button>
  )
}

function Frame({ bare, children }: { bare: boolean; children: ReactNode }) {
  return bare ? <div role="alert">{children}</div> : <Card flush role="alert">{children}</Card>
}

interface FeatureErrorFallbackProps extends FallbackProps {
  /** Co se stalo, např. „Zásoby se nepodařilo načíst“ (default: „Tato část se momentálně nenačítá“) */
  title?: string
  /** Bez vlastní karty, když chyba leží uvnitř jiné karty (Deník). */
  bare?: boolean
}

export function FeatureErrorFallback({
  error,
  resetErrorBoundary,
  title,
  bare = false,
}: FeatureErrorFallbackProps) {
  const err = error as ErrorWithMessage
  const supportDetails = extractSupportErrorDetails(error)
  const supportBlock = formatSupportBlock(supportDetails)
  const [devExpanded, setDevExpanded] = useState(false)

  useEffect(() => {
    reportError({
      message: err?.message ?? 'Unknown error',
      stack: err?.stack,
      component: title ?? 'FeatureErrorFallback',
      requestId: supportDetails.requestId,
      errorId: supportDetails.errorId,
      path: window.location.pathname,
    })
  }, [err, supportDetails.errorId, supportDetails.requestId, title])

  return (
    <Frame bare={bare}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-md)',
          padding: 'var(--space-2xl) var(--space-xl)',
          textAlign: 'center',
        }}
      >
        {/* Ikona */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-full)',
            background: 'var(--status-error-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AlertTriangle style={{ width: 24, height: 24, color: 'var(--status-error)' }} />
        </div>

        {/* Titulek */}
        <p
          style={{
            margin: 0,
            fontWeight: 600,
            color: 'var(--text-main)',
            fontSize: 'var(--font-size-base)',
            lineHeight: 1.4,
          }}
        >
          {title ?? 'Tato část se momentálně nenačítá'}
        </p>

        {/* Friendly popis */}
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            maxWidth: 380,
          }}
        >
          Zkus to znovu.
        </p>

        <Button type="button" variant="secondary" onClick={resetErrorBoundary}>
          <RefreshCw aria-hidden="true" />
          Zkusit znovu
        </Button>

        {/* ── Support info panel ──────────────────────────────────────── */}
        {supportDetails.supportCode && (
          <details
            style={{
              width: '100%',
              maxWidth: 360,
              marginTop: 'var(--space-xs)',
              padding: 'var(--space-md) var(--space-lg)',
              background: 'rgb(var(--inset))',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              textAlign: 'left',
            }}
          >
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Podrobnosti pro podporu
            </summary>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                fontSize: 'var(--font-size-sm)',
                fontFamily: "'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace",
                color: 'var(--text-muted)',
              }}
            >
              <span>
                <strong style={{ color: 'var(--text-main)' }}>Kód:</strong>{' '}
                {supportDetails.supportCode}
              </span>
              {supportDetails.method && supportDetails.url && (
                <span>
                  <strong style={{ color: 'var(--text-main)' }}>Endpoint:</strong>{' '}
                  {supportDetails.method} {supportDetails.url}
                </span>
              )}
              {supportDetails.status && (
                <span>
                  <strong style={{ color: 'var(--text-main)' }}>Status:</strong>{' '}
                  {supportDetails.status}
                </span>
              )}
            </div>
            <CopyAllButton text={supportBlock} />
          </details>
        )}

        {/* ── Dev-only expandable stack trace ─────────────────────────── */}
        {import.meta.env.DEV && err?.message && (
          <div style={{ width: '100%', maxWidth: 360 }}>
            <button
              onClick={() => setDevExpanded((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-family)',
              }}
              type="button"
            >
              <ChevronDown
                style={{
                  width: 16,
                  height: 16,
                  transition: 'transform 0.2s ease',
                  transform: devExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
              Technický detail (dev)
            </button>

            <AnimatePresence>
              {devExpanded && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: 'var(--status-error-light)',
                    border: '1px solid color-mix(in srgb, var(--status-error) 15%, transparent)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-md)',
                    fontSize: 'var(--font-size-sm)',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--status-error)',
                    maxHeight: 180,
                    overflowY: 'auto',
                    margin: 'var(--space-xs) 0 0 0',
                  }}
                >
                  {err.stack ?? err.message}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Frame>
  )
}
