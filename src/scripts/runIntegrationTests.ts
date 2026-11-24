/**
 * `npm run test:integration` — backendové integrační testy (src/**\/*.itest.ts) nad reálným PostgreSQL 16.
 *
 * Přípravu DB dělá `withTestDatabase` (src/testing/integration/testDatabase.ts): lokálně dočasný Docker
 * `postgres:16` na portu 5433 → guard → `prisma migrate deploy` → testy sériově → úklid vždy, i při selhání.
 * Lokální DB na 5432 (data rodiny) se nepoužije nikdy. CI: TEST_DATABASE_URL ukazuje na service container.
 */
import fs from "node:fs";
import path from "node:path";
import { projectRoot, runCommand, withTestDatabase } from "../testing/integration/testDatabase";

function findIntegrationFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : findIntegrationFiles(full);
    return entry.name.endsWith(".itest.ts") ? [path.relative(projectRoot, full)] : [];
  });
}

withTestDatabase(async (env) => {
  const files = findIntegrationFiles(path.join(projectRoot, "src"));
  if (files.length === 0) throw new Error("Nenalezen žádný soubor *.itest.ts.");
  console.log(`=== Integrační testy (${files.length} soubor/ů, sériově) ===`);
  // --test-force-exit: moduly rout drží časovače (např. setInterval v logs.ts), proces by po testech nedoběhl.
  await runCommand(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-force-exit", ...files], env, true);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
