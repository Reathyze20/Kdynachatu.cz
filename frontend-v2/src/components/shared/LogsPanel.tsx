import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { Card } from '@/components/shared/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { FeatureErrorFallback } from '@/components/shared/FeatureErrorFallback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCount, formatShortDate, formatTime } from '@/lib/format'
import type { LogEntry, LogQueryParams, LogResponse } from '@/api/admin'

interface LogsPanelProps {
  id?: string
  scopeKey: string
  eyebrow: string
  title: string
  description: string
  loadLogFiles: () => Promise<{ files: string[] }>
  loadLogs: (params: LogQueryParams) => Promise<LogResponse>
}

function getLevelBadgeClass(level: string | undefined): string {
  const normalized = level?.toLowerCase() ?? 'info'

  if (normalized === 'error') return 'admin-log-level admin-log-level--error'
  if (normalized === 'warn') return 'admin-log-level admin-log-level--warn'
  return 'admin-log-level admin-log-level--info'
}

function getLevelLabel(level: string | undefined): string {
  const normalized = level?.toLowerCase() ?? 'info'

  if (normalized === 'error') return 'Error'
  if (normalized === 'warn') return 'Warn'
  return 'Info'
}

function formatLogTime(value: string | number | undefined): string {
  if (!value) return 'Bez času'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return `${formatShortDate(parsed)} ${formatTime(parsed, { seconds: true })}`
}

function formatLogDetail(entry: LogEntry): string {
  return JSON.stringify(entry, null, 2)
}

function normalizeTextInput(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeStatusInput(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : undefined
}

function getActorLabel(entry: LogEntry): string | undefined {
  const actorUsername = typeof entry.actorUsername === 'string'
    ? entry.actorUsername
    : typeof entry.username === 'string'
      ? entry.username
      : undefined

  const actorId = typeof entry.actorId === 'string'
    ? entry.actorId
    : typeof entry.userId === 'string'
      ? entry.userId
      : undefined

  if (actorUsername && actorId && actorUsername !== actorId) {
    return `${actorUsername} (${actorId})`
  }

  return actorUsername ?? actorId
}

function buildMetaPills(entry: LogEntry): string[] {
  const meta: string[] = []
  const actorLabel = getActorLabel(entry)

  if (typeof entry.module === 'string' && entry.module) {
    meta.push(`Modul: ${entry.module}`)
  }
  if (typeof entry.source === 'string' && entry.source) {
    meta.push(`Zdroj: ${entry.source}`)
  }
  if (typeof entry.path === 'string' && entry.path) {
    meta.push(`Cesta: ${entry.path}${typeof entry.status === 'number' ? ` · ${entry.status}` : ''}`)
  } else if (typeof entry.status === 'number') {
    meta.push(`Status: ${entry.status}`)
  }
  if (actorLabel) {
    meta.push(`Uživatel: ${actorLabel}`)
  }
  if (typeof entry.cabinId === 'string' && entry.cabinId) {
    meta.push(`Chata: ${entry.cabinId}`)
  }
  if (typeof entry.requestId === 'string' && entry.requestId) {
    meta.push(`Request: ${entry.requestId}`)
  }
  if (typeof entry.errorId === 'string' && entry.errorId) {
    meta.push(`Error: ${entry.errorId}`)
  }

  return meta
}

/** Popisek nad polem filtru (DESIGN.md §7 Formuláře). */
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-label text-(--text-muted)">{label}</label>
      {children}
    </div>
  )
}

export function LogsPanel({
  id,
  scopeKey,
  eyebrow,
  title,
  description,
  loadLogFiles,
  loadLogs,
}: LogsPanelProps) {
  const [selectedDate, setSelectedDate] = useState('')
  const [level, setLevel] = useState<'all' | 'debug' | 'error' | 'warn' | 'info'>('all')
  const [source, setSource] = useState<'all' | 'backend' | 'frontend'>('all')
  const [lines, setLines] = useState(50)
  const [requestId, setRequestId] = useState('')
  const [userId, setUserId] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [pathFilter, setPathFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const titleId = useId()

  const filesQuery = useQuery({
    queryKey: [scopeKey, 'log-files'],
    queryFn: loadLogFiles,
    staleTime: 300_000,
  })

  const availableDates = filesQuery.data?.files ?? []

  useEffect(() => {
    if (availableDates.length === 0) return

    setSelectedDate((current) => {
      if (!current || !availableDates.includes(current)) return availableDates[0]
      return current
    })
  }, [availableDates])

  const deferredRequestId = useDeferredValue(requestId)
  const deferredUserId = useDeferredValue(userId)
  const deferredModuleFilter = useDeferredValue(moduleFilter)
  const deferredPathFilter = useDeferredValue(pathFilter)
  const deferredStatusFilter = useDeferredValue(statusFilter)
  const deferredSearchFilter = useDeferredValue(searchFilter)

  const logParams: LogQueryParams = useMemo(
    () => ({
      date: selectedDate || availableDates[0],
      lines,
      level: level === 'all' ? undefined : level,
      source: source === 'all' ? undefined : source,
      requestId: normalizeTextInput(deferredRequestId),
      userId: normalizeTextInput(deferredUserId),
      module: normalizeTextInput(deferredModuleFilter),
      path: normalizeTextInput(deferredPathFilter),
      status: normalizeStatusInput(deferredStatusFilter),
      search: normalizeTextInput(deferredSearchFilter),
    }),
    [
      availableDates,
      deferredModuleFilter,
      deferredPathFilter,
      deferredRequestId,
      deferredSearchFilter,
      deferredStatusFilter,
      deferredUserId,
      level,
      lines,
      selectedDate,
      source,
    ],
  )

  const logsQuery = useQuery({
    queryKey: [scopeKey, 'logs', logParams],
    queryFn: () => loadLogs(logParams),
    staleTime: 20_000,
  })

  const logs = logsQuery.data?.logs ?? []
  const errorCount = logs.filter((entry) => String(entry.level).toLowerCase() === 'error').length
  const warnCount = logs.filter((entry) => String(entry.level).toLowerCase() === 'warn').length
  const infoCount = logs.filter((entry) => !entry.level || String(entry.level).toLowerCase() === 'info').length
  const hasActiveFilters = level !== 'all'
    || source !== 'all'
    || Boolean(requestId.trim())
    || Boolean(userId.trim())
    || Boolean(moduleFilter.trim())
    || Boolean(pathFilter.trim())
    || Boolean(statusFilter.trim())
    || Boolean(searchFilter.trim())
  const logsState = filesQuery.isError
    ? 'files-error'
    : logsQuery.isError
      ? 'logs-error'
      : logsQuery.isLoading
        ? 'loading'
        : logs.length === 0
          ? 'empty'
          : 'ready'

  function resetFilters(): void {
    setLevel('all')
    setSource('all')
    setLines(50)
    setRequestId('')
    setUserId('')
    setModuleFilter('')
    setPathFilter('')
    setStatusFilter('')
    setSearchFilter('')
  }

  const textFilters = [
    { key: 'request-id', label: 'Request ID', value: requestId, set: setRequestId, placeholder: 'Např. 1a2b3c' },
    { key: 'user-id', label: 'User ID', value: userId, set: setUserId, placeholder: 'UUID nebo actorId' },
    { key: 'module', label: 'Modul', value: moduleFilter, set: setModuleFilter, placeholder: 'AUTH, INVITES, SHOPPING' },
    { key: 'path', label: 'Cesta', value: pathFilter, set: setPathFilter, placeholder: '/api/invites, /dashboard' },
    { key: 'status', label: 'Status', value: statusFilter, set: setStatusFilter, placeholder: '500', numeric: true },
    { key: 'search', label: 'Text', value: searchFilter, set: setSearchFilter, placeholder: 'invite, SMTP, galerie' },
  ]

  return (
    <Card as="section" id={id} className="grid gap-4" aria-labelledby={titleId} data-testid="logs-panel" data-logs-scope={scopeKey} data-logs-state={logsState}>
      <div className="grid gap-1">
        <span className="text-eyebrow uppercase text-(--text-muted)">{eyebrow}</span>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 id={titleId} className="text-card-title text-(--text-main)">{title}</h2>
          <span className="text-meta text-(--text-muted)">
            {logsQuery.isLoading ? 'Načítám…' : formatCount(logs.length, 'záznam', 'záznamy', 'záznamů')}
          </span>
        </div>
        <p className="text-label text-(--text-muted)">{description}</p>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-4" data-testid="logs-toolbar">
        <Field id={`${scopeKey}-log-date`} label="Den">
          <select
            id={`${scopeKey}-log-date`}
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            disabled={filesQuery.isLoading || availableDates.length === 0}
            data-testid="logs-date-select"
          >
            {availableDates.length === 0 ? (
              <option value="">Dnešní log</option>
            ) : (
              availableDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))
            )}
          </select>
        </Field>

        <Field id={`${scopeKey}-log-level`} label="Úroveň">
          <select
            id={`${scopeKey}-log-level`}
            value={level}
            onChange={(event) => setLevel(event.target.value as 'all' | 'debug' | 'error' | 'warn' | 'info')}
            data-testid="logs-level-select"
          >
            <option value="all">Vše</option>
            <option value="debug">Jen debug</option>
            <option value="error">Jen chyby</option>
            <option value="warn">Jen warningy</option>
            <option value="info">Jen info</option>
          </select>
        </Field>

        <Field id={`${scopeKey}-log-source`} label="Zdroj">
          <select
            id={`${scopeKey}-log-source`}
            value={source}
            onChange={(event) => setSource(event.target.value as 'all' | 'backend' | 'frontend')}
            data-testid="logs-source-select"
          >
            <option value="all">Backend + frontend</option>
            <option value="backend">Jen backend</option>
            <option value="frontend">Jen frontend</option>
          </select>
        </Field>

        <Field id={`${scopeKey}-log-lines`} label="Rozsah">
          <select
            id={`${scopeKey}-log-lines`}
            value={String(lines)}
            onChange={(event) => setLines(Number(event.target.value))}
            data-testid="logs-lines-select"
          >
            <option value="50">50 řádků</option>
            <option value="100">100 řádků</option>
            <option value="200">200 řádků</option>
            <option value="500">500 řádků</option>
          </select>
        </Field>

        {textFilters.map((filter) => (
          <Field key={filter.key} id={`${scopeKey}-log-${filter.key}`} label={filter.label}>
            <Input
              id={`${scopeKey}-log-${filter.key}`}
              type="text"
              inputMode={filter.numeric ? 'numeric' : undefined}
              value={filter.value}
              placeholder={filter.placeholder}
              onChange={(event) => filter.set(event.target.value)}
              data-testid={`logs-${filter.key}-input`}
            />
          </Field>
        ))}

        <div className="col-span-full flex flex-wrap justify-end gap-2">
          {hasActiveFilters && (
            <Button type="button" variant="secondary" className="flex-1 md:flex-none" onClick={resetFilters} data-testid="logs-reset-filters-button">
              Vyčistit filtry
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            className="flex-1 md:flex-none"
            onClick={() => {
              void filesQuery.refetch()
              void logsQuery.refetch()
            }}
            data-testid="logs-refresh-button"
          >
            Obnovit logy
          </Button>
        </div>
      </div>

      {filesQuery.isError ? (
        <FeatureErrorFallback
          error={filesQuery.error instanceof Error ? filesQuery.error : new Error('Nepodařilo se načíst seznam logů')}
          resetErrorBoundary={() => {
            void filesQuery.refetch()
          }}
          title="Seznam logů se nepodařilo načíst"
        />
      ) : logsQuery.isError ? (
        <FeatureErrorFallback
          error={logsQuery.error instanceof Error ? logsQuery.error : new Error('Nepodařilo se načíst logy')}
          resetErrorBoundary={() => {
            void logsQuery.refetch()
          }}
          title="Logy se nepodařilo načíst"
        />
      ) : logsQuery.isLoading ? (
        <p role="status" className="text-meta text-(--text-muted)">Načítám logy…</p>
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} message="Pro tento filtr tu nejsou žádné logy." />
      ) : (
        <>
          <div className="admin-log-summary" data-testid="logs-summary">
            <span className="admin-log-summary-pill admin-log-summary-pill--error">{errorCount} error</span>
            <span className="admin-log-summary-pill admin-log-summary-pill--warn">{warnCount} warn</span>
            <span className="admin-log-summary-pill admin-log-summary-pill--info">{infoCount} info</span>
          </div>

          <div className="admin-log-list" data-testid="logs-list">
            {logs.map((entry, index) => (
              <details key={`${entry.time ?? 'time'}-${entry.msg ?? 'msg'}-${index}`} className="admin-log-item" data-testid="log-entry" data-log-index={String(index)}>
                <summary>
                  <div className="admin-log-item-main">
                    <span className={getLevelBadgeClass(typeof entry.level === 'string' ? entry.level : undefined)}>
                      {getLevelLabel(typeof entry.level === 'string' ? entry.level : undefined)}
                    </span>
                    <div className="admin-log-copy">
                      <strong>{entry.msg || 'Záznam bez zprávy'}</strong>
                      <span>
                        {formatLogTime(typeof entry.time === 'string' || typeof entry.time === 'number' ? entry.time : undefined)}
                      </span>
                      {buildMetaPills(entry).length > 0 && (
                        <div className="admin-log-meta">
                          {buildMetaPills(entry).map((pill) => (
                            <span key={pill} className="admin-log-meta-pill">
                              {pill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </summary>
                <pre className="admin-log-detail">{formatLogDetail(entry)}</pre>
              </details>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
