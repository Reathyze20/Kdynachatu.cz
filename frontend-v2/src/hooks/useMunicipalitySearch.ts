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
export const MIN_QUERY_LENGTH = 2

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
    isFetching: enabled && result.isFetching,
    isSettled: enabled && query === trimmed && result.isSuccess,
  }
}
