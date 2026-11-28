import { Link } from 'react-router-dom'
import { MapPinOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AuthLayout, AuthStatus } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { useCabinSceneMode } from '@/hooks/useCabinSceneMode'
import { NotFoundDormouse } from './NotFoundDormouse'

export function NotFoundPage() {
  const { isLoggedIn } = useAuth()
  // Volba „Scéna chaty“ je uložená v zařízení, takže platí i pro nepřihlášené (#657). Skrytá = původní ikona.
  const sceneMode = useCabinSceneMode()
  const visual = sceneMode === 'hidden'
    ? { icon: MapPinOff, tone: 'neutral' as const }
    : { image: <NotFoundDormouse animated={sceneMode === 'animated'} /> }

  return (
    <AuthLayout data-testid="not-found-page">
      <AuthStatus
        {...visual}
        title="Stránka nenalezena"
        actions={(
          <Button asChild size="lg" className="w-full">
            <Link to={isLoggedIn ? '/dashboard' : '/'} data-testid="not-found-home-button">
              {isLoggedIn ? 'Zpět na přehled' : 'Zpět na úvod'}
            </Link>
          </Button>
        )}
      >
        Tato stránka neexistuje nebo jsme ji přesunuli. Zkontroluj adresu a zkus to znovu.
      </AuthStatus>
    </AuthLayout>
  )
}
