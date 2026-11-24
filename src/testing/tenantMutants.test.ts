import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { findRouteFileMutants, findRouterMounts, findTenantMutants, type TenantMutant } from "./tenantMutants";

const FILE = "src/backend/routes/sample.ts";

/** Ukázkový soubor rout: `body` (řádky od 4) je tělo handleru `router.<method>(path, …)`. */
function route(body: string[], method = "get", path = "/:id"): string {
  return `const router = Router();\n\nrouter.${method}("${path}", async (req, res) => {\n${body.join("\n")}\n});\n`;
}

/** Zmutovaný text se liší jen v jednom souvislém místě s původním úryvkem, nahrazeném `replacement`. */
function assertOnlyMutatedSpot(source: string, mutant: TenantMutant, replacement = ""): void {
  const mutated = mutant.mutatedSource;
  let prefix = 0;
  while (prefix < mutated.length && source[prefix] === mutated[prefix]) prefix++;
  let suffix = 0;
  while (suffix < mutated.length - prefix && source.at(-1 - suffix) === mutated.at(-1 - suffix)) suffix++;
  const removed = source.slice(prefix, source.length - suffix);
  assert.ok(removed.includes(mutant.original), `změna "${removed}" neobsahuje úryvek "${mutant.original}"`);
  assert.equal(mutated.slice(prefix, mutated.length - suffix).trim(), replacement);
}

describe("findTenantMutants: odstranění cabinId z where", () => {
  test("zkrácený zápis: soubor, řádek, routa s prefixem, druh, úryvek a zmutovaný text", () => {
    const source = route(["  const cabinId = req.user!.cabinId!;", "  await prisma.note.findMany({ where: { cabinId } });"]);
    const mutants = findTenantMutants(source, FILE, { mountPrefix: "/api/notes" });
    assert.deepEqual(mutants.map(({ mutatedSource: _, ...rest }) => rest), [
      { file: FILE, line: 5, route: "GET /api/notes/:id", kind: "remove-where-cabinId", original: "cabinId" },
    ]);
    assertOnlyMutatedSpot(source, mutants[0]);
    assert.ok(mutants[0].mutatedSource.includes("findMany({ where: {} })"));
  });

  test("plný zápis u ID lookupu odstraní jen cabinId, id zůstane", () => {
    const source = route(["  await prisma.note.findFirst({ where: { id, cabinId: req.user!.cabinId } });"], "delete");
    const mutants = findTenantMutants(source, FILE, { mountPrefix: "/api/notes" });
    assert.deepEqual(mutants.map((m) => [m.route, m.original]), [["DELETE /api/notes/:id", "cabinId: req.user!.cabinId"]]);
    assert.ok(mutants[0].mutatedSource.includes("where: { id }"));
    assertOnlyMutatedSpot(source, mutants[0]);
  });

  test("víceřádkový literál: mutant na řádku vlastnosti, literál zůstane platný", () => {
    const source = route([
      "  await prisma.item.findMany({",
      "    where: {",
      "      cabinId: req.user.cabinId,",
      "      isResolved: false,",
      "    },",
      "  });",
    ], "get", "/");
    const [mutant] = findTenantMutants(source, FILE, { mountPrefix: "/api/items" });
    assert.deepEqual([mutant.line, mutant.route], [6, "GET /api/items"]);
    assertOnlyMutatedSpot(source, mutant);
    assert.ok(mutant.mutatedSource.includes("where: {\n      isResolved: false,\n    },"));
  });

  test("list i count ve stejném handleru: každý výskyt je samostatný mutant", () => {
    const source = route([
      "  const cabinId = req.user!.cabinId!;",
      "  await prisma.user.findMany({ where: { cabinId } });",
      "  await prisma.note.count({ where: { cabinId, isPinned: true } });",
    ], "get", "/");
    const mutants = findTenantMutants(source, FILE);
    assert.deepEqual(mutants.map((m) => m.line), [5, 6]);
    for (const mutant of mutants) assert.equal(mutant.mutatedSource.split("cabinId").length, source.split("cabinId").length - 1);
  });

  test("relační filtr přes rodiče a filtr v proměnné (ternár, rozbalení, přiřazení)", () => {
    const source = route([
      "  const cabinId = req.user!.cabinId!;",
      "  await prisma.galleryPhoto.count({ where: { folder: { cabinId } } });",
      "  const filter = all ? { cabinId } : { cabinId, threadId };",
      "  await prisma.note.findMany({ where: filter });",
      "  const active = { isResolved: false, cabinId };",
      "  await prisma.item.findMany({ where: { ...active, status: 'pending' } });",
      "  const where: any = {};",
      "  where.folder = { cabinId: req.user!.cabinId };",
      "  await prisma.diaryEntry.findMany({ where, take: 10 });",
    ], "get", "/");
    const mutants = findTenantMutants(source, FILE);
    assert.deepEqual(mutants.map((m) => m.line), [5, 6, 6, 8, 11]);
    assert.ok(mutants.every((m) => m.kind === "remove-where-cabinId"));
  });

  test("updateMany a kontrola členství uživatele v chatě", () => {
    const source = route([
      "  await prisma.inventoryItem.updateMany({ where: { id: { in: ids }, cabinId }, data: { inCart: false } });",
      "  await prisma.user.count({ where: { id: { in: userIds }, cabinId: req.user!.cabinId } });",
    ], "patch");
    const mutants = findTenantMutants(source, FILE);
    assert.deepEqual(mutants.map((m) => m.original), ["cabinId", "cabinId: req.user!.cabinId"]);
    assert.ok(mutants[0].mutatedSource.includes("where: { id: { in: ids } }, data: { inCart: false }"));
  });

  test("helper: routy, které ho (i nepřímo) používají; nepoužitý helper má routu null", () => {
    const source = [
      "function findItem(cabinId: string, id: string) {",
      "  return prisma.item.findFirst({ where: { id, list: { cabinId } } });",
      "}",
      "async function deleteItem(req, res) { await findItem(req.user.cabinId, req.params.id); }",
      "router.patch('/:id', protect, async (req, res) => { await findItem(req.user.cabinId, req.params.id); });",
      "router.delete('/:id', protect, deleteItem);",
      "function unused(cabinId: string) { return prisma.item.count({ where: { cabinId } }); }",
    ].join("\n");
    const mutants = findTenantMutants(source, FILE, { mountPrefix: "/api/x" });
    assert.deepEqual(mutants.map((m) => [m.line, m.route]), [[2, "DELETE /api/x/:id, PATCH /api/x/:id"], [7, null]]);
  });
});

describe("findTenantMutants: porovnání s tenantem přihlášeného uživatele", () => {
  test("!== vůči req.user.cabinId → false, === vůči lokální proměnné → true", () => {
    const source = route([
      "  const cabinId = req.user!.cabinId!;",
      "  if (!existing || existing.folder.cabinId !== req.user!.cabinId) return res.status(404).end();",
      "  const own = wallpaper.cabinId === cabinId;",
    ], "put");
    const mutants = findTenantMutants(source, FILE, { mountPrefix: "/api/diary" });
    assert.deepEqual(mutants.map((m) => [m.line, m.kind, m.route]), [
      [5, "neutralize-cabin-check", "PUT /api/diary/:id"],
      [6, "neutralize-cabin-check", "PUT /api/diary/:id"],
    ]);
    assertOnlyMutatedSpot(source, mutants[0], "false");
    assert.ok(mutants[0].mutatedSource.includes("if (!existing || false) return"));
    assertOnlyMutatedSpot(source, mutants[1], "true");
  });
});

describe("findTenantMutants: co se nemutuje", () => {
  const negatives: Record<string, string[]> = {
    "create data": ["  await prisma.note.create({ data: { cabinId: req.user!.cabinId!, message } });"],
    "upsert se složeným klíčem cabinId_year_month": [
      "  await prisma.monthlyNote.upsert({ where: { cabinId_year_month: { cabinId, year, month } }, create: { cabinId, year }, update: { text } });",
    ],
    "dotaz na samotnou chatu": ["  await prisma.cabin.findUnique({ where: { id: req.user.cabinId! } });"],
    "Socket.IO room": ["  emitToCabin(req.user!.cabinId!, 'note:created', {});", "  io.to(`cabin_${cabinId}`).emit('x');"],
    "logování a select": ["  logger.info('CABIN', 'Hotovo', { cabinId });", "  await prisma.photo.findMany({ select: { cabinId: true } });"],
    "porovnání bez tenanta": ["  const same = record.cabinId === otherCabinId;", "  const valid = typeof req.user.cabinId === 'string';"],
  };
  for (const [name, body] of Object.entries(negatives)) {
    test(name, () => assert.deepEqual(findTenantMutants(route(body), FILE), []));
  }
});

describe("findRouterMounts a findRouteFileMutants", () => {
  test("prefix routeru z app.ts: importovaný router i továrna", () => {
    const app = 'import notesRoutes from "./routes/notes";\nimport { createFeedbackRouter } from "./routes/feedback";\n' +
      'import helmet from "helmet";\napp.use("/api", apiLimiter);\napp.use("/api/notes", notesRoutes);\n' +
      'app.use("/api/feedback", createFeedbackRouter(path));';
    assert.deepEqual([...findRouterMounts(app)], [["notes", "/api/notes"], ["feedback", "/api/feedback"]]);
  });

  test("nad skutečnými soubory rout: jen produkční soubory, prefixy z app.ts, platný TypeScript", () => {
    const mutants = findRouteFileMutants();
    assert.ok(mutants.every((m) => /^src\/backend\/routes\/\w+\.ts$/.test(m.file) && !m.file.endsWith(".test.ts")));
    assert.ok(mutants.some((m) => m.route === "DELETE /api/notes/:id" && m.kind === "remove-where-cabinId"));
    assert.ok(mutants.some((m) => m.file.endsWith("/diary.ts") && m.kind === "neutralize-cabin-check"));
    for (const mutant of mutants) {
      const { diagnostics } = ts.transpileModule(mutant.mutatedSource, { reportDiagnostics: true });
      assert.deepEqual(diagnostics, [], `${mutant.file}:${mutant.line} po mutaci není platný TypeScript`);
    }
  });
});
