import type { Plugin } from 'vite'

// Rozdělení knihoven z node_modules do vendor chunků. Přiřazuje se podle přesného
// názvu balíčku, ne podle podřetězce v cestě: '/react-dom/' kdysi sedělo i na
// '@floating-ui/react-dom', chunky se zacyklily a aplikace se nespustila.
const VENDOR_GROUPS: ReadonlyArray<[chunk: string, matches: (pkg: string) => boolean]> = [
  [
    'vendor-react',
    (pkg) =>
      pkg === 'react' ||
      pkg === 'react-dom' ||
      pkg === 'react-router' ||
      pkg === 'react-router-dom' ||
      pkg === 'react-error-boundary' ||
      pkg === 'scheduler',
  ],
  ['vendor-data', (pkg) => pkg === '@tanstack/react-query' || pkg === 'axios'],
  [
    'vendor-forms',
    (pkg) => pkg === 'react-hook-form' || pkg.startsWith('@hookform/') || pkg === 'zod',
  ],
  [
    'vendor-ui',
    (pkg) =>
      pkg === 'framer-motion' ||
      pkg === 'lucide-react' ||
      pkg === 'sonner' ||
      pkg.startsWith('@radix-ui/'),
  ],
  [
    'vendor-realtime',
    (pkg) => pkg === 'socket.io-client' || pkg === 'engine.io-client' || pkg === 'socket.io-parser',
  ],
  [
    'vendor-utils',
    (pkg) =>
      pkg === 'date-fns' ||
      pkg === 'clsx' ||
      pkg === 'class-variance-authority' ||
      pkg === 'tailwind-merge' ||
      pkg === 'next-themes',
  ],
]

const PACKAGE_IN_PATH = /\/node_modules\/((?:@[^/]+\/)?[^/]+)(?=\/)/g

function packageName(id: string): string | undefined {
  // Poslední výskyt node_modules = balíček, kterému soubor skutečně patří.
  let name: string | undefined
  for (const match of id.replaceAll('\\', '/').matchAll(PACKAGE_IN_PATH)) {
    name = match[1]
  }
  return name
}

export function vendorChunkFor(id: string): string | undefined {
  const pkg = packageName(id)
  if (!pkg) {
    return undefined
  }
  for (const [chunk, matches] of VENDOR_GROUPS) {
    if (matches(pkg)) {
      return chunk
    }
  }
  return 'vendor-misc'
}

export interface ChunkNode {
  fileName: string
  imports: readonly string[]
}

/** Vrátí první nalezený kruh statických importů mezi chunky (např. [a, b, a]), jinak null. */
export function findChunkCycle(chunks: readonly ChunkNode[]): string[] | null {
  const graph = new Map(chunks.map((chunk) => [chunk.fileName, chunk.imports]))
  const done = new Set<string>()
  const path: string[] = []
  const onPath = new Set<string>()

  const visit = (node: string): string[] | null => {
    if (onPath.has(node)) {
      return [...path.slice(path.indexOf(node)), node]
    }
    if (done.has(node) || !graph.has(node)) {
      return null
    }
    path.push(node)
    onPath.add(node)
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next)
      if (cycle) {
        return cycle
      }
    }
    path.pop()
    onPath.delete(node)
    done.add(node)
    return null
  }

  for (const chunk of chunks) {
    const cycle = visit(chunk.fileName)
    if (cycle) {
      return cycle
    }
  }
  return null
}

/**
 * Shodí build, když mezi chunky vznikne kruh statických importů. Takový bundle
 * projde buildem i testy, ale v prohlížeči se jeden chunk vyhodnotí dřív než
 * jeho závislost a aplikace zůstane prázdná bez chyby v konzoli.
 */
export function chunkCycleGuard(): Plugin {
  return {
    name: 'kdynachatu:chunk-cycle-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks: ChunkNode[] = []
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          chunks.push({ fileName: output.fileName, imports: output.imports })
        }
      }
      const cycle = findChunkCycle(chunks)
      if (cycle) {
        this.error(
          `Kruh statických importů mezi chunky: ${cycle.join(' → ')}. ` +
            'Uprav rozdělení v frontend-v2/vendorChunks.ts.',
        )
      }
    },
  }
}
