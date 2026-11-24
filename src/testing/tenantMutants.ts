/**
 * Hledání tenant mutantů (#361): místa v souborech rout, kde by odstranění tenant filtru `cabinId`
 * mělo shodit test. Spouštěč (#365) zapíše zmutovaný text do dočasné kopie a pustí itesty.
 * `findTenantMutants` je čistá funkce (žádný disk ani DB) nad TypeScript compiler API. Pravidla:
 *  - `remove-where-cabinId`: vlastnost `cabinId` (plný i zkrácený zápis) v hodnotě `where`,
 *    i vnořeně (`{ folder: { cabinId } }`), přes `...x`, ternár a proměnnou, která se do `where`
 *    dostane (deklarace, `x = {…}`, `x.folder = {…}`).
 *  - `neutralize-cabin-check`: `a.cabinId !== tenant` → `false`, `===` → `true`; tenant je
 *    `req.user.cabinId` nebo lokální proměnná inicializovaná z něj.
 * Nemutuje se nic mimo `where` (`data`, `create`, `update`, `select`, logy, Socket.IO roomy),
 * složené klíče (`cabinId_year_month` – Prisma by je za běhu odmítla a mutant by padl falešně)
 * ani dotazy na samotnou chatu (`where: { id: req.user.cabinId }`).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PROJECT_ROOT } from "./integration/cabinTenantCoverage";

export type TenantMutantKind = "remove-where-cabinId" | "neutralize-cabin-check";

export interface TenantMutant {
  file: string; // jak ji dostala funkce (u `findRouteFileMutants` relativní s `/`)
  line: number; // od 1
  route: string | null; // `GET /api/notes/:id`; u helperu routy, které ho volají, oddělené `, `
  kind: TenantMutantKind;
  original: string; // původní text mutovaného místa (vlastnost nebo porovnání)
  mutatedSource: string; // celý soubor s touto jedinou mutací
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);
const REQUEST_NAMES = new Set(["req", "_req"]);
const NEGATED = new Set([ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
const EQUAL = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken]);

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)
  ) node = node.expression;
  return node;
}

function isCabinIdAccess(node: ts.Expression): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && node.name.text === "cabinId";
}

/** `req.user.cabinId` v libovolné kombinaci `!` a `?.`. */
function isRequestTenant(node: ts.Expression): boolean {
  const access = unwrap(node);
  if (!isCabinIdAccess(access)) return false;
  const user = unwrap(access.expression);
  if (!ts.isPropertyAccessExpression(user) || user.name.text !== "user") return false;
  const request = unwrap(user.expression);
  return ts.isIdentifier(request) && REQUEST_NAMES.has(request.text);
}

/**
 * Co se v nejbližším oboru s deklarací `name` do proměnné přiřazuje: inicializátor,
 * `name = výraz` a `name.x = výraz` (bere se jako vnořená hodnota filtru).
 */
function bindingValues(name: ts.Identifier): ts.Expression[] {
  for (let scope: ts.Node | undefined = name.parent; scope; scope = scope.parent) {
    if (!ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) continue;
    const values: ts.Expression[] = [];
    let declared = false;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name.text) {
        declared = true;
        if (node.initializer) values.push(node.initializer);
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const target = unwrap(node.left);
        const owner = ts.isPropertyAccessExpression(target) ? unwrap(target.expression) : target;
        if (ts.isIdentifier(owner) && owner.text === name.text) values.push(node.right);
      }
      ts.forEachChild(node, visit);
    };
    visit(scope);
    if (declared) return values;
  }
  return [];
}

function isTenant(node: ts.Expression): boolean {
  return isRequestTenant(node) || (ts.isIdentifier(node) && bindingValues(node).some(isRequestTenant));
}

/** Vlastnosti `cabinId` ve filtru, který vznikne z výrazu `value` (hodnota `where` nebo vnořená). */
function collectFilterProperties(value: ts.Expression, found: Set<ts.ObjectLiteralElementLike>, seen: Set<ts.Node>): void {
  const expr = unwrap(value);
  if (seen.has(expr)) return;
  seen.add(expr);
  const next = (child: ts.Expression) => collectFilterProperties(child, found, seen);
  if (ts.isConditionalExpression(expr)) [expr.whenTrue, expr.whenFalse].forEach(next);
  else if (ts.isArrayLiteralExpression(expr)) expr.elements.forEach(next);
  else if (ts.isIdentifier(expr)) bindingValues(expr).forEach(next);
  else if (ts.isObjectLiteralExpression(expr)) {
    for (const property of expr.properties) {
      if (ts.isSpreadAssignment(property)) next(property.expression);
      const name = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : "";
      if (name === "cabinId") found.add(property);
      else if (name.split("_").includes("cabinId")) continue; // složený klíč (`cabinId_year_month`)
      else if (ts.isPropertyAssignment(property)) next(property.initializer);
      else if (ts.isShorthandPropertyAssignment(property)) next(property.name);
    }
  }
}

/** Rozsah, jehož odstraněním zmizí vlastnost i s čárkou, aby literál zůstal platný. */
function removalRange(property: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile): [number, number] {
  const object = property.parent as ts.ObjectLiteralExpression;
  const siblings = object.properties;
  const index = siblings.indexOf(property);
  if (siblings.length === 1) return [object.getStart(sourceFile) + 1, object.getEnd() - 1];
  if (index < siblings.length - 1) return [property.getStart(sourceFile), siblings[index + 1].getStart(sourceFile)];
  return [siblings[index - 1].getEnd(), property.getEnd()];
}

function routeOfCall(call: ts.CallExpression, mountPrefix: string): string | undefined {
  if (!ts.isPropertyAccessExpression(call.expression) || !ts.isIdentifier(call.expression.expression)) return undefined;
  const method = call.expression.name.text;
  const [first] = call.arguments;
  if (!HTTP_METHODS.has(method) || call.arguments.length < 2 || !ts.isStringLiteralLike(first)) return undefined;
  return `${method.toUpperCase()} ${mountPrefix}${first.text === "/" && mountPrefix ? "" : first.text}`;
}

/**
 * Routy, ze kterých se k místu dojde: obklopující `router.<method>(…)`, jinak routy, které
 * (i přes další helpery) používají pojmenovanou funkci, v níž místo leží.
 */
function routesReaching(node: ts.Node, mountPrefix: string, visited: Set<string>): string[] {
  let helper: string | undefined;
  for (let current = node.parent; current; current = current.parent) {
    const route = ts.isCallExpression(current) ? routeOfCall(current, mountPrefix) : undefined;
    if (route) return [route];
    const named = ts.isFunctionDeclaration(current) ||
      (ts.isVariableDeclaration(current) && !!current.initializer && ts.isFunctionLike(current.initializer));
    const name = named ? (current as ts.FunctionDeclaration | ts.VariableDeclaration).name : undefined;
    if (!helper && name && ts.isIdentifier(name)) helper = name.text;
  }
  if (!helper || visited.has(helper)) return [];
  visited.add(helper);
  const routes: string[] = [];
  // Název v deklaraci helperu nic nepřidá: vede zpět do helperu, který už je ve `visited`.
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && child.text === helper) routes.push(...routesReaching(child, mountPrefix, visited));
    ts.forEachChild(child, visit);
  };
  visit(node.getSourceFile());
  return [...new Set(routes)];
}

export function findTenantMutants(source: string, file: string, options: { mountPrefix?: string } = {}): TenantMutant[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const filterProperties = new Set<ts.ObjectLiteralElementLike>();
  const seen = new Set<ts.Node>();
  const mutants: Array<TenantMutant & { position: number }> = [];
  const add = (node: ts.Node, kind: TenantMutantKind, [start, end]: [number, number], replacement: string) => {
    const position = node.getStart(sourceFile);
    mutants.push({
      file,
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      route: routesReaching(node, options.mountPrefix ?? "", new Set()).join(", ") || null,
      kind,
      original: node.getText(sourceFile),
      mutatedSource: source.slice(0, start) + replacement + source.slice(end),
      position,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "where") {
      collectFilterProperties(node.initializer, filterProperties, seen);
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === "where") {
      collectFilterProperties(node.name, filterProperties, seen);
    } else if (ts.isBinaryExpression(node)) {
      const [left, right] = [unwrap(node.left), unwrap(node.right)];
      const negated = NEGATED.has(node.operatorToken.kind);
      const checksTenant = (isCabinIdAccess(left) && isTenant(right)) || (isCabinIdAccess(right) && isTenant(left));
      if ((negated || EQUAL.has(node.operatorToken.kind)) && checksTenant) {
        add(node, "neutralize-cabin-check", [node.getStart(sourceFile), node.getEnd()], negated ? "false" : "true");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  filterProperties.forEach((property) => add(property, "remove-where-cabinId", removalRange(property, sourceFile), ""));
  return mutants.sort((a, b) => a.position - b.position).map(({ position: _position, ...mutant }) => mutant);
}

/**
 * Prefixy routerů z `app.ts`: modul v `./routes/` → první `app.use("/prefix", …)`, jehož
 * argument je z modulu importovaný router (`notesRoutes`) nebo volání jeho továrny.
 */
export function findRouterMounts(appSource: string): Map<string, string> {
  const sourceFile = ts.createSourceFile("app.ts", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const moduleByIdentifier = new Map<string, string>();
  const mounts = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause) {
      if (!node.moduleSpecifier.text.startsWith("./routes/")) return;
      const { name, namedBindings } = node.importClause;
      const named = namedBindings && ts.isNamedImports(namedBindings) ? namedBindings.elements.map((e) => e.name) : [];
      for (const id of [name, ...named]) if (id) moduleByIdentifier.set(id.text, path.posix.basename(node.moduleSpecifier.text));
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "use") {
      const [prefix, ...handlers] = node.arguments;
      if (!prefix || !ts.isStringLiteralLike(prefix)) return;
      for (const handler of handlers) {
        const target = ts.isCallExpression(handler) ? handler.expression : handler;
        const routeModule = ts.isIdentifier(target) ? moduleByIdentifier.get(target.text) : undefined;
        if (routeModule && !mounts.has(routeModule)) mounts.set(routeModule, prefix.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return mounts;
}

const ROUTES_DIR = "src/backend/routes";

/** Mutanti ze všech produkčních souborů rout (bez `*.test.ts`), s prefixy z `app.ts`. */
export function findRouteFileMutants(): TenantMutant[] {
  const mounts = findRouterMounts(fs.readFileSync(path.join(PROJECT_ROOT, "src/backend/app.ts"), "utf8"));
  return fs.readdirSync(path.join(PROJECT_ROOT, ROUTES_DIR))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort()
    .flatMap((name) => findTenantMutants(
      fs.readFileSync(path.join(PROJECT_ROOT, ROUTES_DIR, name), "utf8"),
      `${ROUTES_DIR}/${name}`,
      { mountPrefix: mounts.get(path.basename(name, ".ts")) },
    ));
}
