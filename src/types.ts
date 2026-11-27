import type { CheckoutStateShape } from "./backend/routes/reservationHelpers";

// JWT Payload
export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  cabinId: string | null;
  isSuperAdmin?: boolean;
  /** Verze přihlášení (#485). Token bez ní nebo se starou verzí auth middleware odmítne. */
  tokenVersion?: number;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  color: string;
  animalIcon?: string | null;
  role?: "admin" | "user" | "guest";
}

export interface ReservationParticipant {
  userId: string;
  username: string;
  userColor?: string | null;
  userAnimalIcon?: string | null;
}

export interface Reservation {
  id: string;
  userId: string;
  username: string;
  from: string;
  to: string;
  purpose: string;
  notes?: string;
  /** Legacy "Vzkaz pro další" from the booking form — not the handover (`checkoutState`) nor the pinned board note */
  handoverNote?: string;
  status?: "primary" | "backup" | "soft";
  userColor?: string;
  userAnimalIcon?: string | null;
  isCheckoutCompleted?: boolean;
  checkoutCompletedBy?: string | null;
  checkoutCompletedAt?: string | null;
  /** Co-occupants (spolucestujici); organizer is userId above */
  participants?: ReservationParticipant[];
}

/** Tab Předávka, `GET /api/handover` (spec #173). Zdvojené ve `frontend-v2/src/api/handover.ts`. */
export type HandoverPhase = "upcoming" | "ongoing" | "departure";

export interface HandoverOverview {
  /** Můj pobyt (organizátor nebo spolucestující); `departure` = den odjezdu nebo den po něm */
  myStay: { reservationId: string; from: string; to: string; phase: HandoverPhase; isCheckoutCompleted: boolean } | null;
  /** Poslední dokončená předávka v chatě mimo `myStay` */
  lastHandover: {
    reservationId: string;
    from: string;
    to: string;
    organizer: { username: string; userColor: string | null; userAnimalIcon: string | null };
    completedByUsername: string | null;
    completedAt: string | null;
    checkoutState: CheckoutStateShape;
  } | null;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  addedBy: string;
  addedById: string;
  createdAt: string;
  status: "pending" | "bring_from_home" | "purchased";
  /** Inventory item this entry was added from; null when added by hand. */
  linkedInventoryId?: string | null;
  /** Who resolved the item: bought it, or promised to bring it from home. */
  purchasedBy?: string;
  purchasedById?: string;
  purchasedAt?: string;
  price?: number;
  splitWith?: string[];
}

export interface Note {
  id: string;
  userId: string;
  username: string;
  message: string;
  createdAt: string;
}

export interface GalleryFolder {
  id: string;
  name: string;
  createdAt: string;
  createdBy?: string;
}

// DELETE /api/gallery/photos – server smaže jen fotky, které uživatel smí; `deleted` je skutečný počet (#507)
export interface BulkDeletePhotosResponse {
  message: string;
  deleted: number;
}

export interface GalleryPhoto {
  id: string;
  folderId: string;
  src: string;
  uploadedBy: string;
  createdAt: string;
  description?: string;
}

// --- DENÍK ---
export interface DiaryFolder {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  startDate?: string; // Datum od (ISO string YYYY-MM-DD)
  endDate?: string; // Datum do (ISO string YYYY-MM-DD)
}

export interface DiaryEntry {
  id: string;
  folderId: string;
  date: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
  galleryPhotoIds?: string[];
}

// --- REKONSTRUKCE (NOVÉ) ---
export type ReconstructionCategory = "idea" | "company" | "task";

// --- OSOBNÍ VOLNO ---
export interface UserAvailability {
  id: string;
  userId: string;
  username: string;
  userColor: string;
  userAnimalIcon?: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface ReconstructionItem {
  id: string;
  category: ReconstructionCategory;
  title: string;
  description: string;
  link?: string; // Odkaz na web nebo kontakt
  cost?: number; // Odhadovaná cena
  votes: string[]; // Pole ID uživatelů, kteří dali hlas
  createdBy: string;
  createdAt: string;
  status?: "pending" | "approved" | "done"; // Pro úkoly
}

// GET /api/signup-status – zda jde založit novou chatu (CABIN_SIGNUP_ENABLED)
export interface SignupStatusResponse {
  cabinSignupEnabled: boolean;
}

// GET /api/demo-accounts – fiktivní účty pro rychlé přihlášení, neprázdné jen na stagingu
export interface DemoAccount {
  username: string;
  label: string;
  role: string;
  password: string;
}

export interface DemoAccountsResponse {
  accounts: DemoAccount[];
}

// POST /api/staging-feedback – zpětná vazba testera z karty „Co vyzkoušet“, jen na stagingu (#389)
/** id úkolu z karty (frontend-v2 features/staging/testingTasks.ts) nebo „general“ = obecné pole */
export type StagingFeedbackTaskId =
  | "general" | "prehled" | "rezervace" | "nakup" | "poznamka-mesic" | "chat" | "predavka" | "galerie";

export interface StagingFeedbackRequest {
  taskId: StagingFeedbackTaskId;
  text: string;
  screen: string; // cesta obrazovky
  viewportWidth: number; // px – mobil/desktop
}

/** Jeden řádek souboru se zpětnou vazbou (JSON Lines); cabinId a uživatel z přihlášení */
export interface StagingFeedbackRecord extends StagingFeedbackRequest {
  id: string;
  createdAt: string; // ISO
  cabinId: string;
  userId: string;
  username: string;
}

export interface StagingFeedbackResponse {
  id: string;
  createdAt: string;
}

// GET /api/staging-feedback – jen správce, jen záznamy jeho chaty, od nejnovějších (#390)
export interface StagingFeedbackListResponse {
  feedback: StagingFeedbackRecord[];
}

// GET /api/municipalities?q= – obce ČR z RÚIAN pro výběr nejbližší obce chaty (ADR-0006)
export interface MunicipalityOption {
  code: number; // kód obce v RÚIAN
  name: string;
  district: string; // okres
  region: string; // kraj
}

export interface MunicipalitySearchResponse {
  municipalities: MunicipalityOption[];
}

// POST /api/waitlist – veřejný zápis zájemce z landing page (#696, spec #692)
export type WaitlistSegment = "rodina" | "spolek" | "firma" | "pronajimatel" | "jine";
export type WaitlistHouseholds = "2" | "3-4" | "5+";
export type WaitlistWillingnessToPay = "0" | "do-500" | "500-1000" | "nad-1000";
export type WaitlistRentalIntent = "ne" | "obcas" | "ano";
export type WaitlistRentalNeed =
  | "rezervace-hostu"
  | "zalohy-platby"
  | "predani-klicu"
  | "uklid-mezi-hosty"
  | "kalendar-booking-airbnb"
  | "rozpocitani-prijmu";

export interface WaitlistSignupRequest {
  email: string;
  segment: WaitlistSegment;
  consent: boolean; // server přijme jen true
  ref?: string | null; // z URL (?ref=), server ho ořízne a očistí
  website?: string; // honeypot, člověk nechá prázdné
  // Dobrovolné otázky (#699); chybějící, null i "" = neuvedeno
  households?: WaitlistHouseholds | null;
  willingnessToPay?: WaitlistWillingnessToPay | null;
  painPoint?: string | null; // nejvýš 1000 znaků po oříznutí
  rentalIntent?: WaitlistRentalIntent | null;
  rentalNeeds?: WaitlistRentalNeed[]; // uloží se jen při rentalIntent obcas/ano
}

// Vždy stejná odpověď, i pro duplicitní e-mail a vyplněný honeypot
export interface WaitlistSignupResponse {
  ok: true;
}

// PUT /api/cabin/cover-photo – titulní fotka chaty z vlastní Galerie (jen správce, #321).
// Odpověď (i u DELETE) je nastavení chaty; coverPhotoUrl je WebP varianta pro desktop
// 1920 × 1200 (do ~200 kB), mobilní 1080 × 1920 (do ~150 kB) má stejné jméno s příponou -sm
// (…/<uuid>-sm.webp). Obě jsou ve velikosti pozadí appky (#340).
export interface SetCabinCoverPhotoRequest {
  photoId: string;
}

// Preference Přehledu uložené u uživatele, ne u chaty (#681, spec #677). Všechny klíče jsou volitelné:
// chybějící klíč nebo null = výchozí hodnota (Počasí zapnuté, ostatní bloky vypnuté, scéna animated).
export type DashboardSceneMode = "animated" | "static";

export interface DashboardPrefs {
  weather?: boolean | null; // Počasí
  cabinScene?: boolean | null; // Scéna chaty
  sinceLast?: boolean | null; // Od minule
  laterAndFree?: boolean | null; // Potom a volno
  stayForecast?: boolean | null; // Předpověď na pobyt
  regionEvents?: boolean | null; // Akce v kraji
  noticeboard?: boolean | null; // Nástěnka
  sceneMode?: DashboardSceneMode | null; // režim Scény chaty
  simplifiedNoteDismissed?: boolean | null; // jednorázová poznámka „Přehled je jednodušší“ je zavřená
}

// GET /api/users/me – profil přihlášeného uživatele; dashboardPrefs je null, dokud si nic nenastavil.
export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  color: string;
  animalIcon: string | null;
  role: "admin" | "user" | "guest";
  isEmailVerified: boolean;
  dashboardPrefs: DashboardPrefs | null;
}

// PATCH /api/users/me – změna e-mailu (i odebrání) chce současné heslo, ostatní pole ne (#475).
// dashboardPrefs se slučuje s uloženými (null u klíče ho vrátí na výchozí), null celé = vše výchozí (#681).
export interface UpdateProfileRequest {
  email?: string | null;
  color?: string;
  animalIcon?: string;
  currentPassword?: string;
  dashboardPrefs?: DashboardPrefs | null;
}

export interface UpdateProfileResponse {
  message: string;
  // dashboardPrefs (sloučené uložené hodnoty) server posílá od #681; volitelné kvůli klientům a mockům
  // ze starší verze API. Zdroj pravdy pro čtení je GET /users/me.
  user: { email: string | null; color: string; animalIcon: string | null; dashboardPrefs?: DashboardPrefs | null };
}

// PATCH /api/users/me/password – změna vlastního hesla zneplatní všechna přihlášení (#485).
// Aktuální zařízení dostane v odpovědi nový token, aby se nemuselo znovu přihlašovat.
export interface ChangeMyPasswordResponse {
  message: string;
  token: string;
}

// POST /api/users/me/logout-all – „Odhlásit všude“: zneplatní všechny tokeny uživatele včetně aktuálního (#485).
export interface LogoutEverywhereResponse {
  message: string;
}
