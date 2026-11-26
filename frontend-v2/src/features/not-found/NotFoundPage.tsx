import { Link } from 'react-router-dom'
import { MapPinOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AuthLayout, AuthStatus } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { isLoggedIn } = useAuth()

  return (
    <AuthLayout data-testid="not-found-page">
      <AuthStatus
        icon={MapPinOff}
        tone="neutral"
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
