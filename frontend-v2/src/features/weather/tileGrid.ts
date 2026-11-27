/** Rozložení dlaždic dnů na kartě počasí (#526): řádky po nejvýš `maxCols`, liší se nejvýš o jednu dlaždici, žádná nezůstane sama. */
export function tileRows(n: number, maxCols: number): number[] {
  const rows = Math.ceil(n / maxCols);
  const small = Math.floor(n / rows);
  return Array.from({ length: rows }, (_, i) => (i < n % rows ? small + 1 : small));
}

/** Mřížka pro `tileRows`: sloupců je společný násobek délek řádků, dlaždice zabere `columns / délka řádku`. */
export function tileGrid(n: number, maxCols: number): { columns: number; spans: number[] } {
  const rows = tileRows(n, maxCols);
  const sizes = [...new Set(rows)];
  const columns = sizes.reduce((a, b) => a * b, 1); // dvě sousední délky jsou nesoudělné
  return { columns, spans: rows.flatMap((size) => Array<number>(size).fill(columns / size)) };
}
