# Coding standards

Pravidla pro review (`/code-review`, osa Standards). Každý řádek tu je proto, že ho agent jednou porušil nebo by ho porušení stálo data či bezpečnost. Když v hotové práci uvidíš něco, co se nemá opakovat, nepiš to do promptu – připiš to sem.

Co hlídá CI (typecheck, build, `.only`/`.skip`, neměnné migrace, velikost PR, citlivé cesty), tady není.

## Izolace chat (tenant)

- Každý Prisma dotaz na data chaty filtruje `cabinId` z `req.user` (nastaví `requireCabin`, `src/middleware/cabinMiddleware.ts`). `cabinId` z těla requestu, query, URL ani z hlavičky `X-Cabin-Id` se nikdy nepoužije pro autorizaci.
- Zdroj z cizí chaty vrací **404**, ne 403 – neprozradit, že existuje. Platí i pro update/delete: hledat přes `{ id, cabinId }`, ne načíst podle `id` a pak porovnávat.
- Nový router pod `/api/*` začíná `router.use(protect, requireCabin)` (výjimky jen veřejné auth/invite routy).
- Socket.IO eventy jdou přes `emitToCabin(cabinId, …)` (`src/utils/socket.ts`), nikdy globální `io.emit`.
- Soubory v uploadech a jejich náhledy patří chatě; cesta ani název souboru nesmí jít složit z cizího ID.

## Backend

- Každý vstup (body, params, query) projde `validate(zodSchema)`; schémata patří do `src/validators/schemas.ts`. Žádné ruční `if (!req.body.x)`.
- Nový nebo změněný endpoint = odpovídající změna ve `src/backend/openapi.ts` (spec je psaná ručně, nic ji negeneruje).
- Logování přes `logger` ze `src/utils/logger.ts` (`logger.info("SCOPE", "zpráva", { meta })`, DB chyby `logger.prismaError`). V `src/backend/` žádné `console.log`.
- Nová env proměnná se čte v `src/config/config.ts` a odtud importuje; nepřidávat další `process.env` do rout a utilit.
- Hesla jen přes `src/utils/password.ts`. Hash hesla, tokeny ani reset kódy nikdy v odpovědi ani v logu.
- Čistá doménová logika (výpočty termínů, nákladů, hlasování) jde do helperu vedle routy s unit testem (vzor `reservationHelpers.ts` + `.test.ts`), ne inline v handleru.
- Změna wire typu v `src/types.ts` = stejná změna v odpovídajícím `frontend-v2/src/api/*.ts`. Projekty se navzájem neimportují.

## Frontend (`frontend-v2/`)

- Na vlastní `/api` vždy přes Axios instanci z `src/api/client.ts` (JWT, 401, offline fronta). `fetch()` jen na cizí veřejné služby.
- Jeden API modul na doménu v `src/api/`; query keys exportuje hook dané featury, komponenty je nepíšou ručně jako řetězce.
- Nový serverový Socket.IO event = nová invalidace v `src/hooks/useRealtimeSync.ts`, jinak se ostatní členové chaty nedozví o změně.
- Chyby mutací přes `src/lib/mutationError.ts`, hlášky přes `src/lib/toast.ts`. Žádné `alert()` a žádné vlastní ad-hoc toasty.
- Mutace, které má uživatel vidět hned (nákupní seznam, poznámky, rezervace), jsou optimistické s rollbackem v `onError`.
- Nové komponenty nejdřív zkontrolovat proti `.agents/skills/CabinSaaS_Architect/references/component-inventory.md` – žádné duplikáty existujících.
- Mobil první: každá nová obrazovka musí fungovat na šířce 320 px, cíle dotyku ≥ 44 × 44 px.

## Texty a jazyk

- Vše, co uvidí uživatel (UI, chybové hlášky z API, e-maily), je česky, s diakritikou, tykání v aktivním hlasu (vzor: „Zkus to znovu.“). Kód, identifikátory, commity a titulky PR anglicky.
- Komentáře česky, pokud je soubor nemá anglicky – drž jazyk okolí.

## Testy

- Existující test se nemaže ani neoslabuje, aby prošel. Když je test podle tebe chybný, napiš proč do PR a nech rozhodnutí na člověku.
- Test ověřuje chování přes veřejné rozhraní (route, hook, helper), ne interní implementaci.
- Bugfix začíná testem, který chybu reprodukuje.

## Rozsah

- Jen to, co chce ticket. Nevyžádaný refaktor, přejmenování nebo „úklid opodál“ je nález, i když je kód lepší.
- Nová závislost (npm balíček) potřebuje zdůvodnění v popisu PR.
