/**
 * Obce ČR pro výběr nejbližší obce chaty (ADR-0006: appka zná polohu chaty jen na úrovni obce).
 *
 * Data jsou statický číselník z RÚIAN (ČÚZK, CC BY 4.0) v src/backend/data/municipalities.json,
 * generuje ho src/scripts/buildMunicipalities.ts. Veřejná referenční data bez vazby na chatu, proto routa
 * nepoužívá protect/requireCabin – našeptávání potřebuje i registrace nové chaty.
 */
import fs from "fs";
import { Router } from "express";
import type { MunicipalityOption, MunicipalitySearchResponse } from "../../types";
import { MUNICIPALITIES_FILE, type MunicipalityDataset } from "../../scripts/buildMunicipalities";
import { municipalitySearchSchema } from "../../validators/schemas";
import { validate } from "../../validators/validate";

export interface Municipality extends MunicipalityOption {
  /** Definiční bod obce (WGS84), ne poloha chaty. */
  latitude: number;
  longitude: number;
}

interface IndexedMunicipality extends Municipality {
  searchName: string;
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
      })),
    );
    index = { list, byCode: new Map(list.map((m) => [m.code, m])) };
  }
  return index;
}

const toOption = ({ code, name, district, region }: Municipality): MunicipalityOption => ({ code, name, district, region });

/** Shoda celého názvu, pak začátek názvu, pak začátek dalšího slova v názvu. */
function rank(searchName: string, query: string): number {
  if (searchName === query) return 0;
  if (searchName.startsWith(query)) return 1;
  if (searchName.includes(` ${query}`)) return 2;
  return -1;
}

export function searchMunicipalities(query: string, limit = DEFAULT_LIMIT): MunicipalityOption[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return getIndex()
    .list.map((m) => ({ m, rank: rank(m.searchName, q) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.m.name.localeCompare(b.m.name, "cs") || a.m.district.localeCompare(b.m.district, "cs"))
    .slice(0, limit)
    .map(({ m }) => toOption(m));
}

export function findMunicipality(code: number): Municipality | undefined {
  const found = getIndex().byCode.get(code);
  return found && { ...toOption(found), latitude: found.latitude, longitude: found.longitude };
}

const router = Router();

/** GET /api/municipalities?q= – veřejné našeptávání obcí (název, okres, kraj; bez souřadnic). */
router.get("/", validate(municipalitySearchSchema, "query"), (req, res) => {
  const body: MunicipalitySearchResponse = { municipalities: searchMunicipalities(String(req.query.q)) };
  res.set("Cache-Control", "public, max-age=86400").json(body);
});

export default router;
