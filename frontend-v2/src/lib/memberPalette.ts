/**
 * Paleta barev členů (#271, pravidlo G4).
 *
 * Osm ověřených barev: bílá iniciála na každé má kontrast ≥ 4,5 : 1. Uložená barva mimo
 * paletu (dnešních 14 barev, seed, staré výchozí) se jen při zobrazení přemapuje na
 * nejbližší barvu palety podle CIEDE2000. Uložená hodnota se nemění, bez migrace.
 * Barva člena nikdy nestojí sama: vždy s iniciálou, avatarem nebo jménem.
 */

export interface MemberColor {
  hex: string
  name: string
}

export const MEMBER_PALETTE: readonly MemberColor[] = [
  { hex: '#1D5FA8', name: 'modrá' },
  { hex: '#B3401A', name: 'cihlová' },
  { hex: '#7A3FA0', name: 'fialová' },
  { hex: '#1F6F4A', name: 'jedlová' },
  { hex: '#0E6F7C', name: 'petrolejová' },
  { hex: '#8A5A00', name: 'okrová' },
  { hex: '#A6306A', name: 'vínová' },
  { hex: '#4B5563', name: 'břidlicová' },
]

/** Neutrální břidlicová (poslední v paletě) pro chybějící nebo neplatnou barvu. */
export const FALLBACK_MEMBER_COLOR = MEMBER_PALETTE[MEMBER_PALETTE.length - 1].hex

type Lab = [number, number, number]

function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function toLab([r8, g8, b8]: [number, number, number]): Lab {
  const [r, g, b] = [r8, g8, b8].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const fx = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047)
  const fy = f(r * 0.2126 + g * 0.7152 + b * 0.0722)
  const fz = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Barevný rozdíl CIEDE2000 (Sharma, Wu, Dalal 2005). */
function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)))
  const [a1p, a2p] = [a1 * (1 + g), a2 * (1 + g)]
  const [c1, c2] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)]
  const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  const [h1, h2] = [hue(a1p, b1), hue(a2p, b2)]
  let dh = c1 * c2 === 0 ? 0 : h2 - h1
  if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh / 2))
  const lBar = (L1 + L2) / 2
  const cBarP = (c1 + c2) / 2
  let hBar = h1 + h2
  if (c1 * c2 !== 0) hBar = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2
  const t = 1 - 0.17 * Math.cos(rad(hBar - 30)) + 0.24 * Math.cos(rad(2 * hBar))
    + 0.32 * Math.cos(rad(3 * hBar + 6)) - 0.2 * Math.cos(rad(4 * hBar - 63))
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2)
  const sC = 1 + 0.045 * cBarP
  const sH = 1 + 0.015 * cBarP * t
  const rT = -Math.sin(rad(60 * Math.exp(-(((hBar - 275) / 25) ** 2)))) * 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7))
  const [l, c, h] = [(L2 - L1) / sL, (c2 - c1) / sC, dH / sH]
  return Math.sqrt(l * l + c * c + h * h + rT * c * h)
}

const PALETTE_LAB = MEMBER_PALETTE.map((c) => ({ hex: c.hex, lab: toLab(parseHex(c.hex)!) }))

/** Barva, kterou člen dostane na obrazovce: z palety, nebo nejbližší z ní. */
export function toMemberColor(color: string | null | undefined): string {
  const rgb = color ? parseHex(color) : null
  if (!rgb) return FALLBACK_MEMBER_COLOR
  const lab = toLab(rgb)
  let best = PALETTE_LAB[0]
  let bestDistance = Infinity
  for (const entry of PALETTE_LAB) {
    const distance = deltaE2000(lab, entry.lab)
    if (distance < bestDistance) {
      best = entry
      bestDistance = distance
    }
  }
  return best.hex
}

/** Iniciála do avatara a pruhu v kalendáři. */
export function memberInitial(name: string | null | undefined): string {
  const first = Array.from(name?.trim() ?? '')[0]
  return first ? first.toLocaleUpperCase('cs') : '?'
}
