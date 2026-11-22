/**
 * Vygeneruje src/backend/data/municipalities.json – seznam obcí ČR s okresem, krajem a
 * definičním bodem obce (WGS84) pro výběr nejbližší obce chaty (#279; appka zná polohu chaty
 * jen na úrovni obce, ADR-0006 „Chata je anonymní“).
 *
 * Zdroj: RÚIAN, výměnný formát VFR „stát – základní data“ (ST_UZSZ), ČÚZK, licence CC BY 4.0.
 *   1. Stáhni https://vdp.cuzk.cz/vymenny_format/soucasna/<YYYYMMDD>_ST_UZSZ.xml.zip
 *      (vychází k poslednímu dni v měsíci) a rozbal ho.
 *   2. npx tsx src/scripts/buildMunicipalities.ts <cesta k YYYYMMDD_ST_UZSZ.xml>
 *
 * Souřadnice se převádí z S-JTSK (EPSG:5514) na WGS84 a zaokrouhlují na 4 desetinná místa (~10 m).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const MUNICIPALITIES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../backend/data/municipalities.json");

/** Tvar src/backend/data/municipalities.json. */
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

/** S-JTSK (EPSG:5514, Křovák East-North) → WGS84 [lat, lon]. Zpětný Křovák + 7prvková Helmertova transformace. */
export function jtskToWgs84(easting: number, northing: number, height = 300): [number, number] {
  const X = -northing;
  const Y = -easting;

  // Křovákovo zobrazení → zeměpisné souřadnice na Besselově elipsoidu
  const e = 0.081696831215303;
  const n = 0.97992470462083;
  const roConst = 12310230.12797036;
  const sinUQ = 0.863499969506341;
  const cosUQ = 0.504348889819882;
  const sinVQ = 0.420215144586493;
  const cosVQ = 0.907424504992097;
  const alfa = 1.000597498371542;
  const k = 1.003419163966575;

  const ro = Math.sqrt(X * X + Y * Y);
  const epsilon = 2 * Math.atan(Y / (ro + X));
  const D = epsilon / n;
  const S = 2 * Math.atan(Math.exp((1 / n) * Math.log(roConst / ro))) - Math.PI / 2;
  const sinU = sinUQ * Math.sin(S) - cosUQ * Math.cos(S) * Math.cos(D);
  const cosU = Math.sqrt(1 - sinU * sinU);
  const sinDV = (Math.sin(D) * Math.cos(S)) / cosU;
  const cosDV = Math.sqrt(1 - sinDV * sinDV);
  const sinV = sinVQ * cosDV - cosVQ * sinDV;
  const cosV = cosVQ * cosDV + sinVQ * sinDV;
  const lonBessel = (2 * Math.atan(sinV / (1 + cosV))) / alfa;
  const t = Math.exp((2 / alfa) * Math.log((1 + sinU) / cosU / k));
  let sinB = (t - 1) / (t + 1);
  for (let i = 0; i < 100; i++) {
    const next = t * Math.exp(e * Math.log((1 + e * sinB) / (1 - e * sinB)));
    const sinNext = (next - 1) / (next + 1);
    if (Math.abs(sinNext - sinB) < 1e-15) break;
    sinB = sinNext;
  }
  const latBessel = Math.asin(sinB);

  // Bessel → pravoúhlé souřadnice
  const aB = 6377397.15508;
  const e2B = 1 - (1 - 1 / 299.152812853) ** 2;
  const nB = aB / Math.sqrt(1 - e2B * Math.sin(latBessel) ** 2);
  const x = (nB + height) * Math.cos(latBessel) * Math.cos(lonBessel);
  const y = (nB + height) * Math.cos(latBessel) * Math.sin(lonBessel);
  const z = ((1 - e2B) * nB + height) * Math.sin(latBessel);

  // Helmertova transformace S-JTSK → WGS84
  const arcSec = Math.PI / 180 / 3600;
  const wx = -4.99821 * arcSec;
  const wy = -1.58676 * arcSec;
  const wz = -5.2611 * arcSec;
  const m = 3.543e-6;
  const xn = 570.69 + (1 + m) * (x + wz * y - wy * z);
  const yn = 85.69 + (1 + m) * (-wz * x + y + wx * z);
  const zn = 462.84 + (1 + m) * (wy * x - wx * y + z);

  // Pravoúhlé → zeměpisné na WGS84
  const a = 6378137.0;
  const f1 = 298.257223563;
  const aToB = f1 / (f1 - 1);
  const e2 = 1 - (1 - 1 / f1) ** 2;
  const p = Math.sqrt(xn * xn + yn * yn);
  const theta = Math.atan((zn * aToB) / p);
  const lat = Math.atan((zn + e2 * aToB * a * Math.sin(theta) ** 3) / (p - e2 * a * Math.cos(theta) ** 3));
  const lon = 2 * Math.atan(yn / (p + xn));
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

const PRAGUE_MUNICIPALITY = 554782;
const PRAGUE_REGION = "19";
/** Praha v RÚIAN okres nemá; použije se kód 3100, který pro ni vede ČSÚ (LAU 1 CZ0100). */
const PRAGUE_DISTRICT = 3100;

const round4 =(value: number) => Math.round(value * 10000) / 10000;

function records(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<vf:${tag} [\\s\\S]*?</vf:${tag}>`, "g")) ?? [];
}

function field(record: string, pattern: RegExp): string {
  const match = record.match(pattern);
  if (!match) throw new Error(`Chybí ${pattern} v záznamu ${record.slice(0, 80)}`);
  return match[1];
}

function main(file: string) {
  const xml = fs.readFileSync(file, "utf8");
  const validFrom = path.basename(file).slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

  const regions = new Map(records(xml, "Vusc").map((r) => [field(r, /<vci:Kod>(\d+)</), field(r, /<vci:Nazev>([^<]+)</)]));
  const regionName = (code: string) => {
    const name = regions.get(code);
    if (!name) throw new Error(`Neznámý kraj ${code}`);
    return name;
  };
  const districts: MunicipalityDistrict[] = records(xml, "Okres").map((r) => ({
    code: Number(field(r, /<oki:Kod>(\d+)</)),
    name: field(r, /<oki:Nazev>([^<]+)</),
    region: regionName(field(r, /<vci:Kod>(\d+)</)),
    municipalities: [],
  }));
  // Praha jako jediná obec nemá okres; okres i kraj je u ní „Hlavní město Praha“.
  const prague = regionName(PRAGUE_REGION);
  districts.push({ code: PRAGUE_DISTRICT, name: prague, region: prague, municipalities: [] });
  const byCode = new Map(districts.map((d) => [d.code, d]));

  for (const r of records(xml, "Obec")) {
    const [easting, northing] = field(r, /<gml:pos>([^<]+)</).trim().split(/\s+/).map(Number);
    const [lat, lon] = jtskToWgs84(easting, northing);
    const code = Number(field(r, /<obi:Kod>(\d+)</));
    const districtCode = code === PRAGUE_MUNICIPALITY ? PRAGUE_DISTRICT : Number(field(r, /<oki:Kod>(\d+)</));
    const district = byCode.get(districtCode);
    if (!district) throw new Error(`Obec bez okresu: ${r.slice(0, 80)}`);
    district.municipalities.push([code, field(r, /<obi:Nazev>([^<]+)</), round4(lat), round4(lon)]);
  }

  districts.sort((a, b) => a.code - b.code);
  for (const d of districts) d.municipalities.sort((a, b) => a[0] - b[0]);

  // Jeden okres = jeden řádek, ať je diff po aktualizaci čitelný po okresech.
  const lines = districts.map((d) => `    ${JSON.stringify(d)}`);
  const header = {
    source: "RÚIAN, Český úřad zeměměřický a katastrální (ČÚZK), https://vdp.cuzk.cz",
    license: "CC BY 4.0",
    validFrom,
    format: "municipalities: [kód obce, název, zeměpisná šířka, zeměpisná délka] (WGS84, definiční bod obce)",
    changes: "Definiční body převedené z S-JTSK (EPSG:5514) na WGS84 a zaokrouhlené na 4 desetinná místa; Praha zařazena pod okres 3100 Hlavní město Praha.",
  };
  const body = JSON.stringify(header, null, 2).replace(/\n}$/, `,\n  "districts": [\n${lines.join(",\n")}\n  ]\n}\n`);
  fs.writeFileSync(MUNICIPALITIES_FILE, body);
  const count = districts.reduce((sum, d) => sum + d.municipalities.length, 0);
  console.log(`Zapsáno ${count} obcí v ${districts.length} okresech do ${MUNICIPALITIES_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2];
  if (!file) {
    console.error("Použití: npx tsx src/scripts/buildMunicipalities.ts <YYYYMMDD_ST_UZSZ.xml>");
    process.exit(1);
  }
  main(file);
}
