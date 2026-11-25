/**
 * Registr zabezpečení rout (#473): každá routa `METODA /cesta` má zapsáno, kdo ji smí volat.
 * Zachycuje SOUČASNÝ stav – role se tu nemění, jen evidují. Dvě kontroly nad ním:
 *  - `routeSecurityRegistry.test.ts` (bez DB): množina rout v Express routerech == klíče registru;
 *    nová routa bez zápisu shodí test a jmenuje ji. Routy se čtou z `app.ts` a `src/backend/routes/`
 *    parserem (TypeScript compiler API), prefixy routerů dává `findRouterMounts`.
 *  - `integration/roleMatrix.itest.ts`: pro každou routu a principála, kterému ji registr nepovoluje,
 *    ověří, že odpověď není úspěšná (401/403/404).
 * #484 přepne hosta na „zakázaný ve výchozím stavu“: stačí u rout `MEMBERS_GUEST_484` vyměnit
 * hodnotu za `WRITERS` a matice to ověří.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PROJECT_ROOT } from "./integration/cabinTenantCoverage";
import { findRouterMounts, routeFileNames } from "./tenantMutants";

/** `public` = i nepřihlášený; `superadmin` = superadmin bez chaty; ostatní = role v chatě. */
export type Principal = "public" | "admin" | "user" | "guest" | "superadmin";
export type RouteAccess = readonly Principal[];

export const PUBLIC: RouteAccess = ["public"];
/** Jen `protect`, chata se nevyžaduje (profil, obnova tokenu, založení chaty). */
export const AUTHENTICATED: RouteAccess = ["admin", "user", "guest", "superadmin"];
/** Celá chata včetně hosta – host tu zůstane i po #484 (whitelist ve spec #470). */
export const MEMBERS: RouteAccess = ["admin", "user", "guest"];
/** ZNÁMÁ DÍRA, současný stav: host smí jako člen (čte chat, píše poznámky…). Zavře ji #484. */
export const MEMBERS_GUEST_484: RouteAccess = ["admin", "user", "guest"];
export const WRITERS: RouteAccess = ["admin", "user"];
export const ADMIN: RouteAccess = ["admin"];
export const SUPERADMIN: RouteAccess = ["superadmin"];

export const ROUTE_SECURITY: Readonly<Record<string, RouteAccess>> = {
  // app.ts
  "GET /api/health": PUBLIC,
  "GET /api/openapi.json": PUBLIC, // jen s ENABLE_API_DOCS
  "GET /api/demo-accounts": PUBLIC, // neprázdné jen na stagingu
  "GET /api/municipalities": PUBLIC,
  // auth.ts
  "POST /api/login": PUBLIC,
  "GET /api/signup-status": PUBLIC,
  "POST /api/register": PUBLIC,
  "POST /api/forgot-password": PUBLIC,
  "GET /api/reset-password-token": PUBLIC,
  "POST /api/reset-password": PUBLIC,
  "GET /api/verify-token": PUBLIC,
  "GET /api/refresh-token": AUTHENTICATED,
  // admin.ts
  "GET /api/admin/system": ADMIN,
  // cabin.ts
  "GET /api/cabin": MEMBERS,
  "PATCH /api/cabin": ADMIN,
  "PUT /api/cabin/cover-photo": ADMIN,
  "DELETE /api/cabin/cover-photo": ADMIN,
  "POST /api/cabin/create": AUTHENTICATED, // člen s chatou dostane 400
  // channels.ts
  "GET /api/channels": MEMBERS_GUEST_484,
  "POST /api/channels": MEMBERS_GUEST_484,
  "DELETE /api/channels/:id": MEMBERS_GUEST_484, // admin nebo autor
  "GET /api/channels/messages": MEMBERS_GUEST_484,
  "POST /api/channels/messages": WRITERS,
  "GET /api/channels/:channelId/messages": MEMBERS_GUEST_484,
  "POST /api/channels/:channelId/messages": WRITERS,
  "POST /api/channels/:channelId/read": MEMBERS_GUEST_484,
  // dashboard.ts
  "GET /api/dashboard/reservations": MEMBERS, // #484 zúží na vlastní pobyt
  "GET /api/dashboard/shopping": MEMBERS_GUEST_484,
  "GET /api/dashboard/activation": MEMBERS_GUEST_484, // ne-adminovi vrací prázdný souhrn
  "GET /api/dashboard/notes": MEMBERS_GUEST_484,
  "GET /api/dashboard/reconstruction": MEMBERS_GUEST_484,
  "GET /api/dashboard/gallery": MEMBERS_GUEST_484,
  // diary.ts (úpravy a mazání: admin nebo autor)
  "GET /api/diary/folders": MEMBERS_GUEST_484,
  "POST /api/diary/folders": MEMBERS_GUEST_484,
  "PATCH /api/diary/folders/:id": MEMBERS_GUEST_484,
  "DELETE /api/diary/folders/:id": MEMBERS_GUEST_484,
  "GET /api/diary/entries": MEMBERS_GUEST_484,
  "POST /api/diary/entries": MEMBERS_GUEST_484,
  "PUT /api/diary/entries/:id": MEMBERS_GUEST_484,
  "DELETE /api/diary/entries/:id": MEMBERS_GUEST_484,
  // gallery.ts (mazání: admin nebo autor)
  "GET /api/gallery/folders": MEMBERS_GUEST_484,
  "POST /api/gallery/folders": MEMBERS_GUEST_484,
  "PATCH /api/gallery/folders/:id": MEMBERS_GUEST_484,
  "DELETE /api/gallery/folders/:id": MEMBERS_GUEST_484,
  "GET /api/gallery/photos": MEMBERS_GUEST_484,
  "POST /api/gallery/photos": MEMBERS_GUEST_484,
  "PATCH /api/gallery/photos/:id": MEMBERS_GUEST_484,
  "DELETE /api/gallery/photos/:id": MEMBERS_GUEST_484,
  "DELETE /api/gallery/photos": MEMBERS_GUEST_484,
  // inventory.ts
  "GET /api/inventory": MEMBERS_GUEST_484,
  "POST /api/inventory": MEMBERS_GUEST_484,
  "PUT /api/inventory/:id": MEMBERS_GUEST_484,
  "PATCH /api/inventory/:id/toggle-essential": WRITERS,
  "DELETE /api/inventory/:id": MEMBERS_GUEST_484,
  "POST /api/inventory/:id/add-to-cart": MEMBERS_GUEST_484,
  "POST /api/inventory/:id/pledge": MEMBERS_GUEST_484,
  "GET /api/inventory/missing-summary": MEMBERS_GUEST_484,
  // invites.ts (DELETE a send-email: cizí pozvánka 404 dřív než 403, kontrola role zůstává v handleru)
  "POST /api/invites": ADMIN,
  "GET /api/invites": ADMIN,
  "DELETE /api/invites/:id": ADMIN,
  "GET /api/invites/validate/:token": PUBLIC,
  "POST /api/invites/accept/:token": PUBLIC,
  "POST /api/invites/:id/send-email": ADMIN,
  // logs.ts
  "GET /api/logs": ADMIN,
  "GET /api/logs/files": ADMIN,
  "POST /api/logs/client": AUTHENTICATED,
  "POST /api/logs/client/anon": PUBLIC,
  // messages.ts (úprava a mazání: autor, mazání i admin)
  "PATCH /api/messages/:messageId": MEMBERS_GUEST_484,
  "DELETE /api/messages/:messageId": MEMBERS_GUEST_484,
  "PATCH /api/messages/:messageId/pin": WRITERS,
  "PATCH /api/messages/:messageId/resolve": WRITERS,
  "POST /api/messages/:messageId/reactions": MEMBERS_GUEST_484,
  // notes.ts
  "GET /api/notes": MEMBERS_GUEST_484,
  "POST /api/notes": MEMBERS_GUEST_484, // host píše poznámky
  "PATCH /api/notes/:id/resolve": WRITERS,
  "DELETE /api/notes/:id": MEMBERS_GUEST_484,
  "PATCH /api/notes/:id": MEMBERS_GUEST_484,
  "PATCH /api/notes/:id/pin": WRITERS,
  "POST /api/notes/:id/reactions": MEMBERS_GUEST_484,
  // noteThreads.ts
  "GET /api/note-threads": MEMBERS_GUEST_484,
  "POST /api/note-threads": MEMBERS_GUEST_484,
  "DELETE /api/note-threads/:id": MEMBERS_GUEST_484,
  // reconstruction.ts
  "GET /api/reconstruction": MEMBERS_GUEST_484,
  "POST /api/reconstruction": MEMBERS_GUEST_484,
  "PUT /api/reconstruction/:id": MEMBERS_GUEST_484,
  "DELETE /api/reconstruction/:id": MEMBERS_GUEST_484,
  "PATCH /api/reconstruction/:id/vote": MEMBERS_GUEST_484,
  "PATCH /api/reconstruction/:id/status": MEMBERS_GUEST_484,
  // reservations.ts (úpravy cizí rezervace: jen admin, v handleru)
  "GET /api/reservations": MEMBERS, // #484 zúží na vlastní rezervace
  "POST /api/reservations": MEMBERS_GUEST_484, // host sám nerezervuje (PRODUCT.md)
  "GET /api/reservations/monthly-note": MEMBERS_GUEST_484,
  "PUT /api/reservations/monthly-note": WRITERS,
  "PUT /api/reservations/:id": MEMBERS,
  "POST /api/reservations/delete": MEMBERS,
  "DELETE /api/reservations/:id": MEMBERS,
  "GET /api/reservations/:id/watch": MEMBERS_GUEST_484,
  "POST /api/reservations/:id/watch": MEMBERS_GUEST_484,
  "DELETE /api/reservations/:id/watch": MEMBERS_GUEST_484,
  "POST /api/reservations/:reservationId/assign": ADMIN, // cizí rezervace 404 dřív než 403
  "GET /api/reservations/availabilities": MEMBERS_GUEST_484,
  "POST /api/reservations/availabilities": MEMBERS_GUEST_484,
  "PATCH /api/reservations/availabilities/:id": MEMBERS_GUEST_484,
  "DELETE /api/reservations/availabilities/:id": MEMBERS_GUEST_484,
  "PATCH /api/reservations/:id/checkout": MEMBERS,
  "GET /api/reservations/:id/checkout": MEMBERS,
  // shoppingList.ts
  "POST /api/shopping-list/:listId/items": MEMBERS_GUEST_484,
  "PUT /api/shopping-list/:itemId/purchase": MEMBERS_GUEST_484,
  "PATCH /api/shopping-list/:itemId/toggle-essential": WRITERS,
  "DELETE /api/shopping-list/:itemId": MEMBERS_GUEST_484,
  // shoppingLists.ts
  "GET /api/shopping-lists": MEMBERS_GUEST_484,
  "POST /api/shopping-lists": MEMBERS_GUEST_484,
  "PATCH /api/shopping-lists/:id/rename": MEMBERS_GUEST_484,
  "DELETE /api/shopping-lists/:id": MEMBERS_GUEST_484,
  "PATCH /api/shopping-lists/:id/resolve": MEMBERS_GUEST_484,
  // stagingFeedback.ts (jen na stagingu; čtení vrací ne-adminovi 404)
  "POST /api/staging-feedback": MEMBERS_GUEST_484,
  "GET /api/staging-feedback": ADMIN,
  // superadmin.ts
  "GET /api/superadmin/users": SUPERADMIN,
  "POST /api/superadmin/users": SUPERADMIN,
  "PATCH /api/superadmin/users/:id/ban": SUPERADMIN,
  "GET /api/superadmin/logs/files": SUPERADMIN,
  "GET /api/superadmin/logs": SUPERADMIN,
  // users.ts
  "GET /api/users": MEMBERS_GUEST_484,
  "POST /api/users": ADMIN,
  "GET /api/users/me": AUTHENTICATED,
  "PATCH /api/users/me": AUTHENTICATED,
  "PATCH /api/users/me/password": AUTHENTICATED,
  "POST /api/users/me/logout-all": AUTHENTICATED, // „Odhlásit všude“ (#485)
  "DELETE /api/users/me": AUTHENTICATED,
  "DELETE /api/users/:id/reservations": ADMIN,
  "PUT /api/users/:id/role": ADMIN,
  "PUT /api/users/:id/password": ADMIN,
  "PATCH /api/users/:id": ADMIN,
  "DELETE /api/users/:id": ADMIN,
  "PATCH /api/users/:id/remove-from-cabin": ADMIN,
  "GET /api/users/me/export": AUTHENTICATED,
  "POST /api/users/me/leave-cabin": MEMBERS,
  // wallpapers.ts (chatu kontroluje ručně: bez chaty 400)
  "GET /api/wallpapers": MEMBERS_GUEST_484,
  "POST /api/wallpapers": WRITERS,
  "DELETE /api/wallpapers/:id": WRITERS, // cizí tapeta 404 dřív než 403
  // workspace.ts
  "PATCH /api/workspace/handover-note": WRITERS,
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);

/** Routy ze zdrojáku: `router.get("/x", …)` → `GET <prefix>/x` (u `app.ts` s `objectName = "app"`). */
export function findRouteDefinitions(source: string, mountPrefix: string, objectName = "router"): string[] {
  const sourceFile = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routes: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression: target, name } = node.expression;
      const [first] = node.arguments;
      if (ts.isIdentifier(target) && target.text === objectName && HTTP_METHODS.has(name.text)
        && node.arguments.length >= 2 && ts.isStringLiteralLike(first)) {
        routes.push(`${name.text.toUpperCase()} ${mountPrefix}${first.text === "/" && mountPrefix ? "" : first.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return routes;
}

/**
 * Všechny API routy aplikace: přímo v `app.ts` (jen `/api/…`) a v namountovaných souborech rout.
 * Routy mimo `/api` (statika `/uploads`, SPA fallback) guard nevidí; chráněný handler uploadů (#470,
 * Média) sem bude potřeba doplnit.
 */
export function findAppRoutes(): { routes: string[]; unmountedFiles: string[] } {
  const appSource = fs.readFileSync(path.join(PROJECT_ROOT, "src/backend/app.ts"), "utf8");
  const mounts = findRouterMounts(appSource);
  const routes = findRouteDefinitions(appSource, "", "app").filter((route) => route.split(" ")[1].startsWith("/api/"));
  const unmountedFiles: string[] = [];
  for (const name of routeFileNames()) {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, "src/backend/routes", name), "utf8");
    const prefix = mounts.get(path.basename(name, ".ts"));
    const found = findRouteDefinitions(source, prefix ?? "");
    if (found.length > 0 && prefix === undefined) unmountedFiles.push(name);
    routes.push(...found);
  }
  return { routes, unmountedFiles };
}

export interface RouteRegistryReport {
  ok: boolean;
  missingFromRegistry: string[];
  staleRegistryKeys: string[];
  duplicateRoutes: string[];
}

/** Porovná routy z kódu s klíči registru (čistá logika, vzor `reconcileCoverage`). */
export function reconcileRoutes(routes: string[], registryKeys: string[]): RouteRegistryReport {
  const inCode = new Set(routes);
  const registry = new Set(registryKeys);
  const missingFromRegistry = [...inCode].filter((route) => !registry.has(route)).sort();
  const staleRegistryKeys = registryKeys.filter((key) => !inCode.has(key)).sort();
  const duplicateRoutes = [...new Set(routes.filter((route, i) => routes.indexOf(route) !== i))].sort();
  return {
    ok: missingFromRegistry.length + staleRegistryKeys.length + duplicateRoutes.length === 0,
    missingFromRegistry,
    staleRegistryKeys,
    duplicateRoutes,
  };
}
