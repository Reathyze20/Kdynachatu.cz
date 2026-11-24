import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_SECURITY, findAppRoutes, findRouteDefinitions, reconcileRoutes } from "./routeSecurityRegistry";

describe("findRouteDefinitions: routy ze zdrojáku", () => {
  test("najde metody routeru i víceřádkový zápis a složí cestu s prefixem", () => {
    const source = `
      router.get("/", protect, handler);
      router.patch(
        "/:id/pin",
        protect,
        handler,
      );
      prisma.note.delete({ where: { id } });
      req.get("authorization");
    `;
    assert.deepEqual(findRouteDefinitions(source, "/api/notes"), ["GET /api/notes", "PATCH /api/notes/:id/pin"]);
  });

  test("v app.ts čte jen volání na `app`", () => {
    const source = `app.get("/api/health", h); app.use("/api", limiter); router.get("/x", h);`;
    assert.deepEqual(findRouteDefinitions(source, "", "app"), ["GET /api/health"]);
  });
});

describe("reconcileRoutes: logika guardu", () => {
  test("shodné množiny → ok", () => {
    assert.equal(reconcileRoutes(["GET /a", "POST /a"], ["POST /a", "GET /a"]).ok, true);
  });

  test("routa bez záznamu v registru → fail a jmenuje ji", () => {
    const report = reconcileRoutes(["GET /a", "DELETE /a/:id"], ["GET /a"]);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingFromRegistry, ["DELETE /a/:id"]);
  });

  test("záznam bez routy a dvakrát definovaná routa → fail", () => {
    const report = reconcileRoutes(["GET /a", "GET /a"], ["GET /a", "GET /gone"]);
    assert.deepEqual(report.staleRegistryKeys, ["GET /gone"]);
    assert.deepEqual(report.duplicateRoutes, ["GET /a"]);
  });
});

describe("registr zabezpečení rout pokrývá všechny routy aplikace", () => {
  const { routes, unmountedFiles } = findAppRoutes();

  test("každá routa v Express routerech má záznam v ROUTE_SECURITY a naopak", () => {
    const report = reconcileRoutes(routes, Object.keys(ROUTE_SECURITY));
    assert.ok(report.ok, [
      report.missingFromRegistry.length && `Routy bez záznamu v ROUTE_SECURITY (src/testing/routeSecurityRegistry.ts): ${report.missingFromRegistry.join(", ")}. Zapiš, které role je smí volat.`,
      report.staleRegistryKeys.length && `Záznamy bez routy (ukliď je): ${report.staleRegistryKeys.join(", ")}.`,
      report.duplicateRoutes.length && `Routy definované víckrát: ${report.duplicateRoutes.join(", ")}.`,
    ].filter(Boolean).join(" "));
  });

  test("každý soubor s routami je namountovaný v app.ts (jinak by jeho cesty nesouhlasily)", () => {
    assert.deepEqual(unmountedFiles, []);
  });

  test("parser najde známé routy (sanity, aby guard nebyl prázdný)", () => {
    for (const expected of ["POST /api/login", "GET /api/health", "GET /api/cabin", "PATCH /api/users/:id/remove-from-cabin", "POST /api/staging-feedback"]) {
      assert.ok(routes.includes(expected), `parser nenašel routu ${expected}`);
    }
    assert.ok(routes.length >= 140, `čekal jsem aspoň 140 rout, našel ${routes.length}`);
  });

  test("každý záznam povoluje aspoň jednoho principála", () => {
    const empty = Object.entries(ROUTE_SECURITY).filter(([, access]) => access.length === 0).map(([route]) => route);
    assert.deepEqual(empty, []);
  });
});
