import { useState, useEffect } from "react";

/** Desktop s popisky v levém menu: boční panel Přehledu, dnešek chaty v menu (#275, #338). */
export const WIDE_DESKTOP_QUERY = "(min-width: 1024px)";
/** Mobil pod desktopovým rámem (DESIGN.md §2): spodní lišta, maskot na ní (#566). */
export const MOBILE_QUERY = "(max-width: 767px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return; // jsdom a staré prohlížeče: zůstane výchozí false
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
