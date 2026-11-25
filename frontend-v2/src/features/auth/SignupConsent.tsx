/**
 * features/auth/SignupConsent.tsx
 * Věta o souhlasu s podmínkami u registrace (založení chaty i pozvánka, #514).
 * Odkazy se otevírají v nové kartě, aby se rozepsaný formulář neztratil.
 */
import { Link } from 'react-router-dom'

export function SignupConsent() {
  return (
    <p className="my-3 text-meta text-(--text-muted)" data-testid="signup-consent">
      Registrací souhlasíš s{' '}
      <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
        obchodními podmínkami
      </Link>
      . Jak chráníme tvoje údaje, najdeš v{' '}
      <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
        ochraně soukromí
      </Link>
      .
    </p>
  )
}
