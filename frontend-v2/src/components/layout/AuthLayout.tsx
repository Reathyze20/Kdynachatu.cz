import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react'
import { Card } from '@/components/shared/Card'
import { cn } from '@/lib/utils'

const InsideBackdrop = createContext(false)

/**
 * Pozadí rámu veřejných obrazovek: fotka chaty pod závojem (`.photo-backdrop`). Na mobilu karta začíná
 * kousek pod horním okrajem, od `md` je svisle na střed. Samostatně ho drží jen stránka, která v rámu
 * přepíná víc obrazovek (AuthPage); ostatním ho vykreslí `AuthLayout`.
 */
export function AuthBackdrop({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('photo-backdrop flex min-h-dvh w-full flex-col items-center px-4 py-8 md:justify-center md:py-12', className)} {...props}>
      <InsideBackdrop.Provider value={true}>{children}</InsideBackdrop.Provider>
    </div>
  )
}

interface AuthLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Jedna věta pod názvem appky, co obrazovka dělá („Přihlas se ke svému účtu“). */
  subtitle?: ReactNode
}

/**
 * Rám veřejných obrazovek mimo landing page (#525, DESIGN.md §6): papírová `Card`, nad obsahem logo a název
 * appky na střed (jediné `h1`). Třída `auth-card` drží styly polí formuláře z `styles/layout.css`.
 */
export function AuthLayout({ subtitle, className, children, ...props }: AuthLayoutProps) {
  const sheet = (
    <Card className={cn('auth-card w-full max-w-md px-6 py-8 md:px-8', className)} {...props}>
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src="/logo-icon.svg" alt="" className="h-12 w-auto" />
        <h1 className="text-page-title text-(--text-main)">Kdy na chatu</h1>
        {subtitle && <p className="text-label text-(--text-muted)">{subtitle}</p>}
      </div>
      {children}
    </Card>
  )
  return useContext(InsideBackdrop) ? sheet : <AuthBackdrop>{sheet}</AuthBackdrop>
}
