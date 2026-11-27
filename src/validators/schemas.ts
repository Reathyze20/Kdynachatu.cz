import { z } from "zod";

// Auth validators
export const loginSchema = z.object({
  username: z.string().min(3, "Uživatelské jméno musí mít alespoň 3 znaky").max(50, "Maximální délka je 50 znaků"),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(100, "Maximální délka je 100 znaků"),
});

export const registerSchema = z.object({
  // Cabin (workspace) fields
  cabinName: z.string()
    .min(2, "Název chaty musí mít alespoň 2 znaky")
    .max(100, "Název chaty je příliš dlouhý (max 100 znaků)"),
  subdomain: z.string()
    .min(2, "Subdoména musí mít alespoň 2 znaky")
    .max(50, "Subdoména je příliš dlouhá (max 50 znaků)")
    .regex(/^[a-z0-9-]+$/, "Subdoména může obsahovat jen malá písmena, čísla a pomlčky")
    .optional(),
  // Nejbližší obec ze seznamu (kód RÚIAN), ne volný text – ADR-0006
  municipalityCode: z.number({ message: "Vyber nejbližší obec ze seznamu." }).int().positive("Vyber nejbližší obec ze seznamu."),

  // User fields
  username: z.string()
    .min(2, "Uživatelské jméno musí mít alespoň 2 znaky")
    .max(50, "Maximální délka je 50 znaků"),
  email: z.string()
    .email("Neplatný formát e-mailu")
    .max(255, "E-mail je příliš dlouhý"),
  password: z.string()
    .min(8, "Heslo musí mít alespoň 8 znaků")
    .max(100, "Maximální délka je 100 znaků"),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Neplatný formát barvy").optional(),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string()
    .trim()
    .min(2, "Zadej e-mail nebo uživatelské jméno")
    .max(255, "Zadaná hodnota je příliš dlouhá"),
});

export const resetPasswordSchema = z.object({
  token: z.string()
    .trim()
    .min(20, "Resetovací token je neplatný"),
  password: z.string()
    .min(8, "Heslo musí mít alespoň 8 znaků")
    .max(100, "Maximální délka je 100 znaků"),
});

// Reservation validators
export const createReservationSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data"),
  purpose: z.string().min(1, "Účel je povinný").max(100, "Maximální délka je 100 znaků"),
  notes: z.string().max(1000, "Maximální délka je 1000 znaků").optional(),
  handoverNote: z.string().max(1000, "Maximální délka je 1000 znaků").optional(),
  // Requested type; the server stores "backup" on its own when the stay collides with a primary one.
  status: z.enum(["primary", "soft"], { message: "Neplatný typ rezervace" }).optional(),
  participantIds: z.array(z.string().uuid("Neplatné ID účastníka")).max(50).optional(),
}).refine(data => new Date(data.to) >= new Date(data.from), {
  message: "Datum odjezdu nesmí být před příjezdem",
  path: ["to"],
});

export const updateReservationSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data").optional(),
  purpose: z.string().min(1, "Účel je povinný").max(100, "Maximální délka je 100 znaků").optional(),
  notes: z.string().max(1000, "Maximální délka je 1000 znaků").optional(),
  handoverNote: z.string().max(1000, "Maximální délka je 1000 znaků").optional(),
  status: z.enum(["soft", "primary", "backup"]).optional(),
  participantIds: z.array(z.string().uuid("Neplatné ID účastníka")).max(50).optional(),
}).refine(data => {
  if (data.from && data.to) {
    return new Date(data.to) >= new Date(data.from);
  }
  return true;
}, {
  message: "Datum odjezdu nesmí být před příjezdem",
  path: ["to"],
});

// Shopping list validators
export const createShoppingItemSchema = z.object({
  name: z.string().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
  listName: z.string().max(100, "Maximální délka je 100 znaků").optional(), // Added for dual validation
  isEssential: z.boolean().optional().default(false),
  sourceMessageId: z.string().uuid().optional(),
});

// Inventory validators
export const createInventoryItemSchema = z.object({
  name: z.string().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
  category: z.string().optional().default("OSTATNÍ"),
  status: z.enum(["OK", "LOW", "EMPTY"]).optional().default("OK"),
  location: z.string().max(100, "Maximální délka je 100 znaků").optional().nullable(),
  isEssential: z.boolean().optional().default(false),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1).max(100, "Maximální délka je 100 znaků").optional(),
  category: z.string().optional(),
  status: z.enum(["OK", "LOW", "EMPTY"]).optional(),
  location: z.string().max(100, "Maximální délka je 100 znaků").optional().nullable(),
  isEssential: z.boolean().optional(),
});

// Note / Message validators
export const createNoteSchema = z.object({
  message: z.string().min(1, "Zpráva je povinná").max(2000, "Maximální délka je 2000 znaků"),
  threadName: z.string().max(100, "Maximální délka je 100 znaků").optional(),
  // Missing = main thread; a thread from another cabin is 404 (#483).
  threadId: z.string().uuid("Neplatné ID vlákna").optional().nullable(),
  replyToId: z.string().uuid("Neplatné ID zprávy").optional().nullable(),
});

// Used by POST /api/channels/messages and POST /api/channels/:id/messages
export const createMessageSchema = z.object({
  message: z.string().trim().min(1, "Zpráva nesmí být prázdná").max(2000, "Maximální délka je 2000 znaků"),
  replyToId: z.string().uuid("Neplatné ID zprávy").optional().nullable(),
});

export const editNoteSchema = z.object({
  message: z.string().min(1, "Zpráva je povinná").max(2000, "Maximální délka je 2000 znaků"),
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(1, "Název kanálu nesmí být prázdný").max(100, "Název kanálu je příliš dlouhý (max 100 znaků)"),
});

const ALLOWED_REACTION_EMOJI = ["👍", "❤️", "😂", "✅"] as const;
export const noteReactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTION_EMOJI, { message: "Nepovolený emoji" }),
});

// Gallery validators
export const createFolderSchema = z.object({
  name: z.string().min(1, "Název složky je povinný").max(100, "Maximální délka je 100 znaků"),
});

export const uploadPhotoSchema = z.object({
  folderId: z.string().uuid("Neplatné ID složky"),
  imageBase64: z.string().min(1, "Chybí obrázek"),
  title: z.string().max(100, "Maximální délka je 100 znaků").optional(),
  description: z.string().max(500, "Maximální délka je 500 znaků").optional(),
});

export const updatePhotoSchema = z.object({
  description: z.string().max(500, "Maximální délka je 500 znaků").optional(),
});

// Diary validators
export const createDiaryFolderSchema = z.object({
  name: z.string().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data"),
  activityTag: z.string().max(50, "Maximální délka je 50 znaků").optional().nullable(),
});

export const createDiaryEntrySchema = z.object({
  folderId: z.string().uuid("Neplatné ID složky"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data"),
  title: z.string().max(100, "Maximální délka je 100 znaků").optional(),
  content: z.string().min(1, "Obsah je povinný").max(20000, "Maximální délka je 20000 znaků"),
  galleryPhotoIds: z.array(z.string().uuid()).optional(),
});

// Reconstruction validators
const reconstructionStatusSchema = z.enum([
  "pending",
  "contacted",
  "approved",
  "rejected",
  "done",
]);

// Odkaz a náhled rekonstrukce frontend vykreslí jako href/src (#482): jen http(s), `javascript:` ani `data:` neprojdou.
const reconstructionUrlSchema = (error: string) =>
  z.url({ protocol: /^https?$/, error }).max(1000, "Maximální délka je 1000 znaků");
const reconstructionLinkSchema = reconstructionUrlSchema("Odkaz musí začínat http:// nebo https://");
const reconstructionThumbnailSchema = reconstructionUrlSchema("Náhledový obrázek musí začínat http:// nebo https://");

export const createReconstructionItemSchema = z.object({
  category: z.enum(["idea", "company", "task"], {
    error: "Kategorie musí být idea, company nebo task",
  }),
  title: z.string().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
  description: z.string().max(2000, "Maximální délka je 2000 znaků").optional(),
  link: reconstructionLinkSchema.optional().or(z.literal("")),
  thumbnail: reconstructionThumbnailSchema.optional().or(z.literal("")),
  cost: z.number().positive().max(999999999, "Maximální hodnota je 999 999 999").optional(),
  status: reconstructionStatusSchema.optional(),
  // Company and task fields, same rules as updateReconstructionItemSchema.
  tag: z.string().max(50, "Maximální délka je 50 znaků").optional().nullable(),
  specialization: z.string().max(100, "Maximální délka je 100 znaků").optional().nullable(),
  email: z.string().email("Neplatný e-mail").max(255, "E-mail je příliš dlouhý").optional().or(z.literal("")).or(z.literal(null)),
  phone: z.string().max(30, "Maximální délka je 30 znaků").optional().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data").optional().nullable(),
  sourceMessageId: z.string().uuid().optional(),
});

export const updateReconstructionStatusSchema = z.object({
  status: reconstructionStatusSchema,
});

// User management validators
export const changeRoleSchema = z.object({
  role: z.enum(["admin", "user", "guest"]),
});

export const changePasswordSchema = z.object({
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(100, "Maximální délka je 100 znaků"),
});

// Reservation — monthly note
export const upsertMonthlyNoteSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  text: z.string().max(2000, "Maximální délka je 2000 znaků"),
});

// Reservation — delete body
export const deleteReservationSchema = z.object({
  id: z.string().uuid("Neplatné ID rezervace"),
});

// Reservation — DELETE /:id params (same shape as the POST /delete body)
export const reservationIdParamsSchema = deleteReservationSchema;

export const assignReservationSchema = z.object({
  newOwnerId: z.string().uuid("Neplatné ID uživatele"),
});

// Shopping list item — status update
export const updateItemStatusSchema = z.object({
  status: z.enum(["pending", "bring_from_home", "purchased"]),
  price: z.coerce.number().positive().optional().nullable(),
  splitWith: z.array(z.string().uuid()).optional(),
});

// Shopping lists
export const createShoppingListSchema = z.object({
  name: z.string().trim().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
});

export const renameShoppingListSchema = z.object({
  name: z.string().trim().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
});

// Gallery — rename folder
export const renameFolderSchema = z.object({
  name: z.string().trim().min(1, "Název složky je povinný").max(100, "Maximální délka je 100 znaků"),
});

// Gallery — update photo description
export const updatePhotoDescriptionSchema = z.object({
  description: z.string().max(500, "Maximální délka je 500 znaků").optional().nullable(),
});

// Gallery — bulk delete photos
export const bulkDeletePhotosSchema = z.object({
  photoIds: z.array(z.string().uuid("Neplatné ID fotky")).min(1, "Žádné fotky k vymazání").max(100, "Maximálně 100 fotek najednou"),
});

// Diary — rename folder / update activityTag
export const renameDiaryFolderSchema = z.object({
  name: z.string().trim().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
  activityTag: z.string().max(50).optional().nullable(),
});

// Diary — update entry
export const updateDiaryEntrySchema = z.object({
  content: z.string().min(1, "Obsah je povinný").max(20000, "Maximální délka je 20000 znaků"),
  galleryPhotoIds: z.array(z.string().uuid()).optional(),
});

// Reconstruction — full update (extends create schema with all optional fields)
export const updateReconstructionItemSchema = z.object({
  category: z.enum(["idea", "company", "task"]),
  title: z.string().min(1, "Název je povinný").max(100, "Maximální délka je 100 znaků"),
  description: z.string().max(2000, "Maximální délka je 2000 znaků").optional(),
  link: reconstructionLinkSchema.optional().or(z.literal("")).or(z.literal(null)),
  thumbnail: reconstructionThumbnailSchema.optional().or(z.literal("")).or(z.literal(null)),
  cost: z.coerce.number().positive().max(999999999).optional().nullable(),
  status: reconstructionStatusSchema.optional(),
  tag: z.string().max(50).optional().nullable(),
  specialization: z.string().max(100).optional().nullable(),
  email: z.string().email().max(255).optional().or(z.literal("")).or(z.literal(null)),
  phone: z.string().max(30).optional().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// Workspace — handover note
export const updateHandoverNoteSchema = z.object({
  note: z.string().max(300, "Maximální délka je 300 znaků"),
});

// Inventory — add to cart
export const addToCartSchema = z.object({
  listId: z.string().uuid().optional(),
  newListName: z.string().trim().max(100).optional(),
});

// Inventory — POST /:id/pledge params („Koupím já“, #275)
export const inventoryIdParamsSchema = z.object({
  id: z.string().uuid("Neplatné ID zásoby"),
});

// Cabin settings
export const updateCabinSettingsSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  welcomeMessage: z.string().max(300).optional().nullable(),
  rules: z.string().max(5000).optional().nullable(),
  departureChecklist: z.array(z.string().max(100)).max(15).optional().nullable(),
  // coverPhotoUrl se tu záměrně nepřijímá (#321): titulní fotka jde nastavit jen z Galerie.
  municipalityCode: z.number().int().positive().optional().nullable(),
  isWinterized: z.boolean().optional(),
  features: z.record(z.string(), z.boolean()).optional().nullable(),
});

// PUT /api/cabin/cover-photo — titulní fotka chaty z vlastní Galerie (#321)
export const setCabinCoverPhotoSchema = z.object({
  photoId: z.string().uuid("Neplatné ID fotky"),
});

// Municipalities — GET /api/municipalities?q= (našeptávání nejbližší obce chaty)
export const municipalitySearchSchema = z.object({
  q: z.string().trim().min(2, "Napiš aspoň dva znaky názvu obce.").max(100, "Název obce je příliš dlouhý."),
});

// Cabin create
export const createCabinSchema = z.object({
  name: z.string().trim().min(2, "Název chaty musí mít alespoň 2 znaky").max(100, "Maximální délka je 100 znaků"),
});

// Note threads
export const createNoteThreadSchema = z.object({
  name: z.string().trim().min(1, "Název vlákna je povinný").max(100, "Maximální délka je 100 znaků"),
});

// Users — admin create
export const createUserSchema = z.object({
  username: z.string().trim().min(2, "Jméno musí mít alespoň 2 znaky").max(50, "Maximální délka je 50 znaků"),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(100),
  role: z.enum(["admin", "user", "guest"]).optional().default("user"),
});

// Users — preference Přehledu (#681). Striktní: neznámý klíč nebo jiný typ = 400. null u klíče = výchozí.
const dashboardToggle = z.boolean().nullable().optional();
export const dashboardPrefsSchema = z
  .object({
    weather: dashboardToggle,
    cabinScene: dashboardToggle,
    sinceLast: dashboardToggle,
    laterAndFree: dashboardToggle,
    stayForecast: dashboardToggle,
    regionEvents: dashboardToggle,
    noticeboard: dashboardToggle,
    sceneMode: z.enum(["animated", "static"]).nullable().optional(),
    simplifiedNoteDismissed: dashboardToggle,
  })
  .strict();

// Users — update profile
export const updateProfileSchema = z.object({
  email: z.string().email("Neplatný e-mail").optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Neplatná barva").optional(),
  animalIcon: z.string().max(50).optional(),
  // Povinné jen při změně e-mailu (#475), ověří ho routa
  currentPassword: z.string().max(100).optional(),
  // Slučuje se s uloženými preferencemi, null = všechno výchozí (#681)
  dashboardPrefs: dashboardPrefsSchema.nullable().optional(),
});

// Users — change own password
export const changeMyPasswordSchema = z.object({
  oldPassword: z.string().min(1, "Staré heslo je povinné"),
  newPassword: z.string().min(8, "Nové heslo musí mít alespoň 8 znaků").max(100),
});

// Users — „Odhlásit všude“ (#485): bez vstupu, případná pole v těle se zahodí
export const logoutEverywhereSchema = z.object({});

// Users — admin update user
export const adminUpdateUserSchema = z.object({
  role: z.enum(["admin", "user", "guest"]).optional(),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(100).optional(),
});

// Invites — create
export const createInviteSchema = z.object({
  role: z.enum(["admin", "user", "guest"]).default("user"),
  maxUses: z.number().int().min(1).max(100).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).default(7),
});

export const sendInviteEmailSchema = z.object({
  email: z.string().trim().email("Neplatná e-mailová adresa").max(255, "E-mail je příliš dlouhý"),
});

// Invites — accept
export const acceptInviteSchema = z.object({
  username: z.string().trim().min(2, "Jméno musí mít alespoň 2 znaky").max(50),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(100),
  email: z.string().email("Neplatný e-mail").optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Neplatná barva").optional(),
  animalIcon: z.string().max(50).optional(),
});

// Staging — zpětná vazba testera (#389); id úkolů zrcadlí frontend-v2 features/staging/testingTasks.ts
export const STAGING_FEEDBACK_TASK_IDS = [
  "general", "prehled", "rezervace", "nakup", "poznamka-mesic", "chat", "predavka", "galerie",
] as const;

export const stagingFeedbackSchema = z.object({
  taskId: z.enum(STAGING_FEEDBACK_TASK_IDS, { message: "Neznámý úkol" }),
  text: z.string().trim().min(1, "Napiš, co ti nešlo nebo co ti chybí").max(2000, "Text může mít nejvýš 2000 znaků"),
  screen: z.string().trim().min(1).max(300),
  viewportWidth: z.number().int().min(0).max(10000),
});

// Superadmin — create user
export const superadminCreateUserSchema = z.object({
  username: z.string().trim().min(2, "Jméno musí mít alespoň 2 znaky").max(50),
  email: z.string().email("Neplatný e-mail"),
  role: z.enum(["admin", "user", "guest"]).optional().default("user"),
});
