/**
 * PrivacyPage.tsx — Ochrana osobních údajů (GDPR / Privacy Policy)
 */
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Download, Pencil, Scale, Trash2 } from 'lucide-react'
import '@/styles/legal.css'

export function PrivacyPage() {
  const { hash } = useLocation()

  // Odkaz na sekci (/privacy#cookies z lišty o cookies a z patičky úvodu) otevře stránku rovnou na ní (#516).
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="legal-page" data-testid="privacy-page">
      <div className="legal-container">
        <Link to="/" className="legal-back-link" data-testid="privacy-back-link">← Zpět na úvod</Link>

        <h1>Ochrana tvých údajů</h1>
        <p className="legal-subtitle">Tady najdeš, jak s tvými daty nakládáme. Jednoduše a srozumitelně.</p>
        <p className="legal-updated">Poslední aktualizace: 12. dubna 2026</p>

        <section>
          <h2>Kdo jsme</h2>
          <p>
            Provozovatelem služby <strong>Kdy na chatu</strong> je její autor.
            Pokud máš jakýkoli dotaz, napiš nám na <a href="mailto:noreply@kdynachatu.cz">noreply@kdynachatu.cz</a>.
          </p>
        </section>

        <section>
          <h2>Co o tobě víme</h2>
          <div className="legal-info-cards">
            <div className="legal-info-card">
              <strong>Při registraci</strong>
              <span>Uživatelské jméno, e-mail a heslo (heslo ukládáme zašifrované, nikdy ho nevidíme v čitelné podobě)</span>
            </div>
            <div className="legal-info-card">
              <strong>Tvůj profil</strong>
              <span>Barva profilu a avatar, které si zvolíš</span>
            </div>
            <div className="legal-info-card">
              <strong>Co vytvoříš</strong>
              <span>Rezervace, zprávy, fotky, zápisky v deníku, nákupní seznamy a položky rekonstrukce</span>
            </div>
            <div className="legal-info-card">
              <strong>Technické údaje</strong>
              <span>IP adresa a typ prohlížeče — potřebujeme je pro bezpečnost a řešení problémů</span>
            </div>
          </div>
        </section>

        <section>
          <h2>Proč tvoje údaje potřebujeme</h2>
          <ul>
            <li>Aby aplikace fungovala — rezervace, sdílení s členy chaty, přihlašování</li>
            <li>Abychom chránili tvůj účet před neoprávněným přístupem</li>
            <li>Abychom ti mohli poslat důležité e-maily (ověření účtu)</li>
          </ul>
          <p className="legal-highlight">
            Neposíláme reklamy, newslettery ani marketingové e-maily.
          </p>
        </section>

        <section>
          <h2>Kdo vidí tvoje údaje</h2>
          <ul>
            <li><strong>Členové tvé chaty</strong> — vidí tvoje jméno, avatar, rezervace a obsah, který vytvoříš</li>
            <li><strong>Poskytovatel hostingu</strong> — data jsou uložena na serveru v ČR</li>
          </ul>
          <p className="legal-highlight">
            Tvoje údaje neprodáváme. Nesdílíme je s reklamními sítěmi. Nemáme žádné „partnery“, kteří by k nim měli přístup.
          </p>
        </section>

        <section>
          <h2>Jak dlouho data uchováváme</h2>
          <p>
            Tvoje data existují, dokud máš účet. Když svůj účet smažeš,
            všechna tvoje data odstraníme <strong>okamžitě a nenávratně</strong>.
          </p>
        </section>

        <section>
          <h2>Co můžeš udělat se svými daty</h2>
          <div className="legal-rights-grid">
            <div className="legal-right-item">
              <span className="legal-right-icon" aria-hidden="true"><Download className="w-5 h-5" /></span>
              <div>
                <strong>Stáhnout si je</strong>
                <span>V nastavení profilu tlačítkem „Exportovat moje data"</span>
              </div>
            </div>
            <div className="legal-right-item">
              <span className="legal-right-icon" aria-hidden="true"><Pencil className="w-5 h-5" /></span>
              <div>
                <strong>Upravit je</strong>
                <span>E-mail, jméno a profil můžeš kdykoli změnit</span>
              </div>
            </div>
            <div className="legal-right-item">
              <span className="legal-right-icon" aria-hidden="true"><Trash2 className="w-5 h-5" /></span>
              <div>
                <strong>Smazat vše</strong>
                <span>V nastavení profilu můžeš smazat celý účet</span>
              </div>
            </div>
            <div className="legal-right-item">
              <span className="legal-right-icon" aria-hidden="true"><Scale className="w-5 h-5" /></span>
              <div>
                <strong>Podat stížnost</strong>
                <span>U Úřadu pro ochranu osobních údajů (uoou.gov.cz)</span>
              </div>
            </div>
          </div>
        </section>

        <section id="cookies">
          <h2>Co ukládáme v tvém prohlížeči</h2>
          <p>
            <strong>Nepoužíváme sledovací cookies.</strong> Žádný Google Analytics, Facebook Pixel
            ani jiné sledovací nástroje. Na tvém počítači si pamatujeme jen to, co je nezbytné:
          </p>
          <div className="legal-storage-list">
            <div className="legal-storage-item">
              <span className="legal-storage-icon">●</span>
              <div>
                <strong>Přihlašovací údaje</strong>
                <span>Ať nemusíš zadávat heslo při každé návštěvě. Platí 7 dní nebo do odhlášení.</span>
              </div>
            </div>
            <div className="legal-storage-item">
              <span className="legal-storage-icon">●</span>
              <div>
                <strong>Identifikace chaty</strong>
                <span>Abychom věděli, ke které chatě patříš.</span>
              </div>
            </div>
            <div className="legal-storage-item">
              <span className="legal-storage-icon">●</span>
              <div>
                <strong>Vzhled aplikace</strong>
                <span>Tvoje preference tmavého/světlého režimu a pozadí.</span>
              </div>
            </div>
            <div className="legal-storage-item">
              <span className="legal-storage-icon">●</span>
              <div>
                <strong>Souhlas s tímto oznámením</strong>
                <span>Aby se ti tento banner nezobrazoval znovu.</span>
              </div>
            </div>
          </div>
          <p className="legal-note">
            Tato data jsou technicky nezbytná pro fungování aplikace a dle EU legislativy
            (ePrivacy směrnice) nevyžadují tvůj souhlas. Informujeme tě o nich z důvodu transparentnosti.
            Můžeš je kdykoli smazat vymazáním dat prohlížeče — tím se odhlásíš.
          </p>
        </section>

        <section>
          <h2>Jak chráníme tvoje data</h2>
          <ul>
            <li>Hesla ukládáme zašifrovaná — ani my je nevidíme</li>
            <li>Komunikace probíhá přes šifrované HTTPS spojení</li>
            <li>Přístup k datům je chráněn přihlašovacím tokenem a ověřením příslušnosti k chatě</li>
          </ul>
        </section>

        <section id="zdroje-dat">
          <h2>Odkud bereme veřejná data</h2>
          <p>Seznam obcí pro výběr nejbližší obce chaty: ČÚZK (RÚIAN), CC BY 4.0.</p>
        </section>

        <section>
          <h2>Kontakt</h2>
          <p>
            Máš otázky ohledně svých údajů? Napiš nám na{' '}
            <a href="mailto:noreply@kdynachatu.cz">noreply@kdynachatu.cz</a> — rádi odpovíme.
          </p>
        </section>

        <div className="legal-footer-nav">
          <Link to="/terms">Obchodní podmínky</Link>
          <Link to="/">Zpět na úvod</Link>
        </div>
      </div>
    </div>
  )
}
