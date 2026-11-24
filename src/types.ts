// JWT Payload
export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  cabinId: string | null;
  isSuperAdmin?: boolean;
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

// PUT /api/cabin/cover-photo – titulní fotka chaty z vlastní Galerie (jen správce, #321).
// Odpověď (i u DELETE) je nastavení chaty; coverPhotoUrl je WebP varianta pro desktop
// 1920 × 1200 (do ~200 kB), mobilní 1080 × 1920 (do ~150 kB) má stejné jméno s příponou -sm
// (…/<uuid>-sm.webp). Obě jsou ve velikosti pozadí appky (#340).
export interface SetCabinCoverPhotoRequest {
  photoId: string;
}
