# Architektura

Verified: 2026-11-17
Scope: jak je aplikace poskládaná – backend, frontend, realtime. Krátká stack fakta: `stack-facts.md` (při rozporu vyhrává ten). Deploy a hosting: `docs/adr/0002-hosting-a-deploy.md`.

Uživatelské texty, chybové hlášky a většina komentářů jsou **česky** – tak to zachovej. API wire typy jsou v `src/types.ts`, `frontend-v2/src/api/*.ts` je záměrně duplikuje (žádné importy přes projekty).

**Backend (`src/`)**
- Sestavení `createApp()` v `src/backend/app.ts`: Express 4 + Socket.IO na jednom HTTP serveru, routery pod `/api/*`, v produkci servíruje `dist/frontend` + SPA fallback. Vstup `src/backend/server.new.ts` jen naslouchá na portu, plánuje denní cron (mrazové upozornění) a řeší graceful shutdown; integrační testy volají `createApp()` bez portu (`src/testing/integration/`). Neznámé `/api/*` → JSON 404, nikdy SPA.
- Pipeline: compression → helmet → rate limity (přísnější na login/register/reset/invite-accept) → request-id + `AsyncLocalStorage` (`src/utils/asyncContext.ts`) → `httpLogger` → routy. `res.json` u 5xx doplní `errorId`, frontend ho ukáže jako „Kód chyby“.
- Auth: `protect` (`src/middleware/authMiddleware.ts`) ověří Bearer JWT **a při každém requestu znovu načte uživatele z DB** (bany, změny role/chaty). Pak `requireCabin`, které odmítne i hosta (#484; jeho whitelist má `requireCabinAllowGuest`, registr `src/testing/routeSecurityRegistry.ts`), pro `/api/superadmin` `superAdminMiddleware`. Hlavičku `X-Cabin-Id` z frontendu backend nebere v potaz.
- Vzor rout (`src/backend/routes/*.ts`): `router.use(protect, requireCabin)` → `validate(zodSchema)` (`src/validators/validate.ts`, schémata v `src/validators/schemas.ts`) → Prisma dotaz filtrovaný `cabinId` → `emitToCabin(cabinId, event, data)` (`src/utils/socket.ts`). Čisté helpery s unit testy vedle routy (např. `reservationHelpers.ts`).
- Logování: `logger.info("SCOPE", "zpráva", { meta })` ze `src/utils/logger.ts` (pino), kontext requestu se doplní sám; DB chyby přes `logger.prismaError`.
- Konfigurace jen v `src/config/config.ts` (JWT, DB, CORS allowlist z `FRONTEND_URL` + `CORS_ORIGINS`). Uploady do `UPLOADS_PATH` (default `data/uploads`, náhledy přes sharp). Hesla přes `src/utils/password.ts`.
- Realtime: Socket.IO na cestě `/ws`, JWT v `auth.token`. Handshake načte uživatele z DB jako `protect` (smazaný, zabanovaný a stará `tokenVersion` neprojdou), `cabinId` a roli bere z DB. Socket je v roomu `user:<id>` a jen admin/člen i v `cabin:<cabinId>` (host ne). Zneplatnění relací (`src/utils/sessionRevocation.ts`) po commitu odpojí sockety v `user:<id>`; frontend pak ověří relaci přes `GET /api/users/me` a při 401/403 přejde na přihlášení.

**Frontend (`frontend-v2/`)** – React 19, TS strict, Vite 7, React Router 7 (lazy routy přes `lazyRetry`), TanStack Query 5 + Axios, Tailwind 4 + shadcn/ui + legacy CSS v `src/styles/`, Framer Motion, PWA (`vite-plugin-pwa`). Alias `@/` → `src/`.
- `src/App.tsx`: routy a guardy (`PrivateRoute` → `CabinGuard` → `AppShell`; `AdminRoute`, `SuperAdminRoute`). Uživatel s `cabinId === null` jde na `/onboarding` (nebo `/superadmin`).
- `src/api/client.ts`: jediná Axios instance (`baseURL: '/api'`) – JWT, `X-Cabin-Id`, 401, `ACCOUNT_BANNED`, síťové chyby, neúspěšné mutace do `src/lib/offlineQueue.ts` (replay s `X-Offline-Replay`). Nikdy nevolej `fetch()` přímo.
- Jeden API modul na doménu v `src/api/`, hooky po featurách (např. `features/reservations/hooks/useReservations.ts`) exportují query keys. `src/hooks/useRealtimeSync.ts` mapuje Socket.IO eventy na `invalidateQueries` – nový serverový event = nová invalidace tam.
- Chyby mutací přes `src/lib/mutationError.ts`, toasty `src/lib/toast.ts`. Před prací na frontendu přečti `.agents/skills/CabinSaaS_Architect/SKILL.md`.
- Vzhled, komponenty a texty UI: pravidla v `DESIGN.md` v kořeni repa.

