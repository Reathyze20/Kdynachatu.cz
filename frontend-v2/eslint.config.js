import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import designAllowlist from './src/test/designAllowlist.json' with { type: 'json' }

const COLD_PALETTE = String.raw`/\b(slate|emerald)-\d|\bbg-white\b/`
const COLD_PALETTE_ALLOWED = Object.values(designAllowlist.coldPalette ?? {}).flat().map((file) => `src/${file}`)

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Vypnout React Compiler lint pravidla – projekt React Compiler nepoužívá
      'react-hooks/react-compiler': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Context soubory exportují hooks i providerové komponenty – fast refresh to tolerujeme
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Ignorovat parametry začínající _ (konvence pro nevyužité parametry)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // DESIGN.md §2 (#450): studené třídy slate-*, emerald-* a bg-white v className. Stejné pravidlo
  // hlídá guard designRules.test.ts; soubory z jeho allowlistu (coldPalette) jsou vyjmuté níž.
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/test/**', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...['Literal[value', 'TemplateElement[value.raw'].map((node) => ({
        selector: `JSXAttribute[name.name='className'] ${node}=${COLD_PALETTE}]`,
        message: 'Studené třídy slate-*, emerald-* a bg-white nepatří na teplý papír, použij tokeny (DESIGN.md §2).',
      }))],
    },
  },
  // Prázdné `files` ESLint odmítne, proto blok jen dokud allowlist coldPalette něco obsahuje.
  ...(COLD_PALETTE_ALLOWED.length ? [{ files: COLD_PALETTE_ALLOWED, rules: { 'no-restricted-syntax': 'off' } }] : []),
])
