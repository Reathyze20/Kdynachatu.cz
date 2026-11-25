import { describe, expect, it } from 'vitest'
import { findChunkCycle, vendorChunkFor } from '../../vendorChunks'

const nm = (pkgPath: string) => `C:/repo/frontend-v2/node_modules/${pkgPath}`

describe('vendorChunkFor', () => {
  it('nechává vlastní kód aplikace na Rollupu', () => {
    expect(vendorChunkFor('C:/repo/frontend-v2/src/main.tsx')).toBeUndefined()
  })

  it('dává React a jeho runtime do vendor-react', () => {
    expect(vendorChunkFor(nm('react/index.js'))).toBe('vendor-react')
    expect(vendorChunkFor(nm('react/cjs/react-jsx-runtime.production.js'))).toBe('vendor-react')
    expect(vendorChunkFor(nm('react-dom/client.js'))).toBe('vendor-react')
    expect(vendorChunkFor(nm('scheduler/index.js'))).toBe('vendor-react')
    expect(vendorChunkFor(nm('react-error-boundary/dist/react-error-boundary.js'))).toBe('vendor-react')
    expect(vendorChunkFor(nm('react-router/dist/index.mjs'))).toBe('vendor-react')
    expect(vendorChunkFor(nm('react-router-dom/dist/index.mjs'))).toBe('vendor-react')
  })

  // Příčina prázdné stránky po #569: '/react-dom/' sedělo i na @floating-ui/react-dom,
  // ten skončil ve vendor-react, jeho závislost ve vendor-misc a chunky se zacyklily.
  it('nepřiřadí balíček podle podřetězce v cestě', () => {
    expect(vendorChunkFor(nm('@floating-ui/react-dom/dist/floating-ui.react-dom.mjs'))).not.toBe(
      'vendor-react',
    )
    expect(vendorChunkFor(nm('@radix-ui/react-dialog/dist/index.mjs'))).toBe('vendor-ui')
    expect(vendorChunkFor(nm('react-remove-scroll/dist/es2015/index.js'))).not.toBe('vendor-react')
  })

  it('najde balíček i ve vnořených node_modules a ve Vite id s dotazem', () => {
    expect(vendorChunkFor(nm('foo/node_modules/react/index.js'))).toBe('vendor-react')
    expect(vendorChunkFor(`${nm('react/index.js')}?commonjs-es-import`)).toBe('vendor-react')
    expect(vendorChunkFor('\0' + nm('react/index.js') + '?commonjs-proxy')).toBe('vendor-react')
  })

  it('zachovává ostatní skupiny', () => {
    expect(vendorChunkFor(nm('@tanstack/react-query/build/modern/index.js'))).toBe('vendor-data')
    expect(vendorChunkFor(nm('axios/index.js'))).toBe('vendor-data')
    expect(vendorChunkFor(nm('react-hook-form/dist/index.esm.mjs'))).toBe('vendor-forms')
    expect(vendorChunkFor(nm('@hookform/resolvers/zod/dist/zod.mjs'))).toBe('vendor-forms')
    expect(vendorChunkFor(nm('zod/index.js'))).toBe('vendor-forms')
    expect(vendorChunkFor(nm('lucide-react/dist/esm/lucide-react.js'))).toBe('vendor-ui')
    expect(vendorChunkFor(nm('socket.io-client/build/esm/index.js'))).toBe('vendor-realtime')
    expect(vendorChunkFor(nm('date-fns/format.js'))).toBe('vendor-utils')
    expect(vendorChunkFor(nm('clsx/dist/clsx.mjs'))).toBe('vendor-utils')
    expect(vendorChunkFor(nm('some-other-lib/index.js'))).toBe('vendor-misc')
  })
})

describe('findChunkCycle', () => {
  it('vrátí null pro graf bez kruhu', () => {
    expect(
      findChunkCycle([
        { fileName: 'index.js', imports: ['vendor-react.js', 'vendor-misc.js'] },
        { fileName: 'vendor-misc.js', imports: ['vendor-react.js'] },
        { fileName: 'vendor-react.js', imports: [] },
      ]),
    ).toBeNull()
  })

  it('najde kruh mezi chunky', () => {
    expect(
      findChunkCycle([
        { fileName: 'index.js', imports: ['vendor-react.js'] },
        { fileName: 'vendor-react.js', imports: ['vendor-misc.js'] },
        { fileName: 'vendor-misc.js', imports: ['vendor-react.js'] },
      ]),
    ).toEqual(['vendor-react.js', 'vendor-misc.js', 'vendor-react.js'])
  })

  it('najde chunk, který importuje sám sebe', () => {
    expect(findChunkCycle([{ fileName: 'a.js', imports: ['a.js'] }])).toEqual(['a.js', 'a.js'])
  })

  it('ignoruje importy mimo bundle', () => {
    expect(findChunkCycle([{ fileName: 'index.js', imports: ['external.js'] }])).toBeNull()
  })
})
