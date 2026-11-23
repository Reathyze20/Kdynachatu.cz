/**
 * Statický číselník obcí ČR z RÚIAN (ČÚZK, CC BY 4.0) – cesta k souboru a jeho tvar.
 * Soubor generuje src/scripts/buildMunicipalities.ts, za běhu ho čte routes/municipalities.ts.
 */
import path from "path";
import { fileURLToPath } from "url";

export const MUNICIPALITIES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "municipalities.json");

export interface MunicipalityDataset {
  source: string;
  license: string;
  validFrom: string;
  format: string;
  changes: string;
  districts: MunicipalityDistrict[];
}

export interface MunicipalityDistrict {
  code: number;
  name: string;
  region: string;
  /** [kód obce, název, zeměpisná šířka, zeměpisná délka] */
  municipalities: [number, string, number, number][];
}
