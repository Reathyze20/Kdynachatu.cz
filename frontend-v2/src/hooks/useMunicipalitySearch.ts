/**
 * hooks/useMunicipalitySearch.ts
 * Našeptávání obcí ČR (GET /api/municipalities) s krátkým zpožděním po psaní.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { municipalitiesApi } from '@/api/municipalities'

export const MUNICIPALITY_KEYS = {
  search: (query: string) => ['municipalities', 'search', query] as const,
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2 // stejně jako municipalitySearchSchema na backendu

export function useMunicipalitySearch(text: string) {
  const trimmed = text.trim()
  const [query, setQuery] = useState(trimmed)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  const enabled = query.length >= MIN_QUERY_LENGTH
  const result = useQuery({
    queryKey: MUNICIPALITY_KEYS.search(query),
    queryFn: () => municipalitiesApi.search(query),
    enabled,
    // Číselník obcí se mění jednou za čas, výsledky stačí stáhnout jednou za session.
    staleTime: Infinity,
  })

  return {
    results: enabled ? (result.data ?? []) : [],
    /** Výsledky patří k aktuálnímu textu (zpoždění doběhlo a dotaz se povedl) – teprve pak má smysl hlásit „nic nenalezeno“. */
    hasFinalResults: enabled && query === trimmed && result.isSuccess,
  }
}
