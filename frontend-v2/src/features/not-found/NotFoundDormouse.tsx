import dormouseMap from '@/features/dashboard/scene/dormouse-map.png'
import dormouseMapWalk from '@/features/dashboard/scene/dormouse-map-walk.png'

/**
 * Plch s mapou na 404 (#657, varianta MAPA-4 z pickeru `docs/design/11-plch-mimo-scenu.html`). Sprite 50 × 41 px
 * vykreslený 2× ostře. Animovaná: jednou přejde zleva na střed, zastaví se, otočí mapu a zůstane stát na posledním
 * snímku pásu; žádná smyčka. Jinak rovnou poslední póza. Pohyb nesou `--animate-not-found-*` v `shadcn-tokens.css`.
 * Dekorativní: `aria-hidden`, `pointer-events: none`, čtečka přečte jen text 404.
 */

/**
 * Snímek pásu MAPA-4 (50 × 41 px) ve 2×. Stejná čísla nesou třídy níže a keyframes `not-found-*` (26 snímků,
 * posun pásu o 2500 px), při výměně grafiky se mění spolu.
 */
const WIDTH = 100
const HEIGHT = 82
const FRAMES = 26

export function NotFoundDormouse({ animated }: { animated: boolean }) {
  if (!animated) {
    return (
      <img
        src={dormouseMap}
        alt=""
        aria-hidden="true"
        data-testid="not-found-dormouse"
        width={WIDTH}
        height={HEIGHT}
        className="pointer-events-none [image-rendering:pixelated]"
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      data-testid="not-found-dormouse"
      className="pointer-events-none h-[82px] w-[100px] overflow-hidden animate-not-found-pass"
    >
      <img
        src={dormouseMapWalk}
        alt=""
        width={WIDTH * FRAMES}
        height={HEIGHT}
        // Globální `img { max-width: 100% }` z base.css je mimo vrstvy Tailwindu a přebije `max-w-none`; pás by se smáčkl do 100 px.
        style={{ maxWidth: 'none' }}
        className="h-[82px] [image-rendering:pixelated] animate-not-found-frames"
      />
    </div>
  )
}
