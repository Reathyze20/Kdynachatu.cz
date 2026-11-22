/**
 * Obce ČR pro výběr nejbližší obce chaty (ADR-0006: appka zná polohu chaty jen na úrovni obce).
 *
 * Data jsou statický číselník z RÚIAN (ČÚZK, CC BY 4.0), viz data/municipalityDataset.ts.
 * GET /api/municipalities je veřejný stejně jako /api/demo-accounts: slouží obrazovce registrace
 * (nová chata ještě nemá přihlášeného uživatele) a vrací jen veřejná referenční data bez vazby na chatu.
 */
import fs from "fs";
import type { RequestHandler } from "express";
import type { MunicipalityOption, MunicipalitySearchResponse } from "../../types";
import { MUNICIPALITIES_FILE, type MunicipalityDataset } from "../data/municipalityDataset";

export interface Municipality extends MunicipalityOption {
  /** Definiční bod obce (WGS84), ne poloha chaty. */
  latitude: number;
  longitude: number;
}

interface IndexedMunicipality extends Municipality {
  searchName: string;
  /** Název + okres, aby šlo stejnojmenné obce dohledat i podle okresu („nova ves benesov“). */
  searchNameWithDistrict: string;
}

const DEFAULT_LIMIT = 10;

/** Malá písmena bez diakritiky, interpunkce jako mezera: „Frýdek-Místek“ → „frydek mistek“. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

let index: { list: IndexedMunicipality[]; byCode: Map<number, IndexedMunicipality> } | null = null;

function getIndex() {
  if (!index) {
    const dataset = JSON.parse(fs.readFileSync(MUNICIPALITIES_FILE, "utf8")) as MunicipalityDataset;
    const list = dataset.districts.flatMap((district) =>
      district.municipalities.map(([code, name, latitude, longitude]) => ({
        code,
        name,
        district: district.name,
        region: district.region,
        latitude,
        longitude,
        searchName: normalize(name),
        searchNameWithDistrict: normalize(`${name} ${district.name}`),
      })),
    );
    index = { list, byCode: new Map(list.map((m) => [m.code, m])) };
  }
  return index;
}

const toOption = ({ code, name, district, region }: Municipality): MunicipalityOption => ({ code, name, district, region });

const EXACT = 0;
/** Shoda celého názvu, pak začátek názvu (nebo názvu s okresem), pak začátek dalšího slova v názvu. */
function rank(m: IndexedMunicipality, query: string): number {
  if (m.searchName === query) return EXACT;
  if (m.searchName.startsWith(query) || m.searchNameWithDistrict.startsWith(query)) return 1;
  if (m.searchName.includes(` ${query}`)) return 2;
  return -1;
}

/**
 * Až `limit` obcí podle názvu, bez ohledu na diakritiku a velikost písmen. Obce se stejným názvem,
 * jaký uživatel napsal, se vrací vždy všechny (Nová Ves je 14×), aby šla vybrat každá z nich.
 */
export function searchMunicipalities(query: string, limit = DEFAULT_LIMIT): MunicipalityOption[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const matches = getIndex()
    .list.map((m) => ({ m, rank: rank(m, q) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.m.name.localeCompare(b.m.name, "cs") || a.m.district.localeCompare(b.m.district, "cs"));
  const exactCount = matches.filter(({ rank }) => rank === EXACT).length;
  return matches.slice(0, Math.max(limit, exactCount)).map(({ m }) => toOption(m));
}

export function findMunicipality(code: number): Municipality | undefined {
  const found = getIndex().byCode.get(code);
  return found && { ...toOption(found), latitude: found.latitude, longitude: found.longitude };
}

/** GET /api/municipalities?q= – našeptávání obcí (název, okres, kraj; bez souřadnic). Vstup ověří validate(). */
export const municipalitySearchHandler: RequestHandler = (req, res) => {
  const body: MunicipalitySearchResponse = { municipalities: searchMunicipalities(String(req.query.q)) };
  res.set("Cache-Control", "public, max-age=86400").json(body);
};
