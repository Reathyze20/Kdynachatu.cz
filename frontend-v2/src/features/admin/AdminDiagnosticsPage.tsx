import { Link } from 'react-router-dom'
import { Settings, TicketPlus, UserPlus } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/shared/Card'
import { LogsPanel } from '@/components/shared/LogsPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { adminApi } from '@/api/admin'
import { AdminCardHeading } from '@/features/admin/components/AdminCardHeading'
import { AdminSectionMenu } from '@/features/admin/components/AdminSectionMenu'
import { SystemStatsPanel } from '@/features/admin/components/SystemStatsPanel'

const supportSteps = [
  'Vezmi kód chyby z toastu nebo fallback obrazovky.',
  'Vlož ho do filtru Request ID nebo Text a omez zdroj na frontend nebo backend.',
  'Když kód nemáš, filtruj podle uživatele, cesty a HTTP statusu 500.',
  'Detail logu pak spojí request, modul, cestu i support stopu do jednoho místa.',
]

const summary = [
  ['Rychlý postup', 'Vezmi support kód, filtruj logy a dohledej request bez SSH skákání po serveru.'],
  ['Frontend i backend', 'Panel umí míchat klientské chyby, warningy i HTTP provoz podle jedné společné stopy.'],
  ['Navazující akce', 'Ze supportu se hned vrátíš na členy, pozvánky nebo nastavení, když problém souvisí s oprávněním nebo konfigurací.'],
]

const quickLinks = [
  { to: '/admin', label: 'Členové a role', icon: UserPlus },
  { to: '/admin/invites', label: 'Pozvánky', icon: TicketPlus },
  { to: '/admin/cabin', label: 'Nastavení chaty', icon: Settings },
]

export function AdminDiagnosticsPage() {
  useDocumentTitle('Diagnostika')

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3 md:gap-6 md:p-6"
      data-testid="admin-diagnostics-page"
    >
      <Card as="section" className="grid gap-4 md:gap-6" data-testid="admin-diagnostics-hero">
        <PageHeader
          backTo="/admin"
          title="Velká stránka pro incidenty, logy a support kódy"
          subtitle="Když rodina nahlásí problém, nemusíš hledat ve více panelech. Tady máš systémové logy, request ID, support workflow i rychlý stav aplikace na jednom místě."
        />

        <AdminSectionMenu active="diagnostics" />

        <div className="grid gap-3 md:grid-cols-3">
          {summary.map(([title, text]) => (
            <article key={title} className="grid content-start gap-1 rounded-xl bg-inset p-3 md:p-4">
              <strong className="text-card-title text-(--text-main)">{title}</strong>
              <span className="text-label text-(--text-muted)">{text}</span>
            </article>
          ))}
        </div>
      </Card>

      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
        <Card as="section" id="diagnostics-guide" data-testid="admin-diagnostics-guide">
          <AdminCardHeading
            eyebrow="Support workflow"
            title="Jak incident dohledat bez zdržení"
            description="Místo dlouhého popisu od rodiny potřebuješ jen přibližný čas, obrazovku nebo support kód. Zbytek si dohledáš tady."
          />

          <ol className="grid gap-3">
            {supportSteps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 rounded-xl bg-inset p-3">
                <strong className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-label text-primary">
                  {index + 1}.
                </strong>
                <span className="text-body text-(--text-muted)">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            {quickLinks.map(({ to, label, icon: Icon }) => (
              <Button key={to} asChild variant="secondary">
                <Link to={to}>
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </Card>

        <Card as="section" id="system-info" data-testid="admin-diagnostics-system-info">
          <AdminCardHeading
            eyebrow="Snapshot systému"
            title="Stav aplikace"
            description="Než půjdeš do detailu logů, rychle si ověř, jestli je problém izolovaný nebo systémový."
          />
          <SystemStatsPanel />
        </Card>
      </div>

      <LogsPanel
        id="system-logs"
        scopeKey="admin-diagnostics"
        eyebrow="Diagnostika"
        title="Systémové logy"
        description="Velký pracovní panel pro incidenty, filtry podle request ID a dohledání backendových i frontendových chyb bez sahání do serveru."
        loadLogFiles={adminApi.getLogFiles}
        loadLogs={adminApi.getLogs}
      />
    </div>
  )
}
