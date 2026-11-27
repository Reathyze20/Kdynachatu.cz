import { PORT } from "../config/config";

type JsonSchema = Record<string, unknown>;
type OpenApiObject = Record<string, unknown>;

const ref = (schemaName: string): JsonSchema => ({
  $ref: `#/components/schemas/${schemaName}`,
});

const jsonResponse = (schema: JsonSchema, description: string, examples?: Record<string, unknown>): OpenApiObject => {
  const response: OpenApiObject = {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };

  if (examples) {
    const content = response.content as Record<string, OpenApiObject>;
    content["application/json"].examples = examples;
  }

  return response;
};

const jsonRequestBody = (schema: JsonSchema, description?: string, required = true): OpenApiObject => {
  const requestBody: OpenApiObject = {
    required,
    content: {
      "application/json": {
        schema,
      },
    },
  };

  if (description) {
    requestBody.description = description;
  }

  return requestBody;
};

const multipartRequestBody = (schema: JsonSchema, description?: string): OpenApiObject => {
  const requestBody: OpenApiObject = {
    required: true,
    content: {
      "multipart/form-data": {
        schema,
      },
    },
  };

  if (description) {
    requestBody.description = description;
  }

  return requestBody;
};

const bearerSecurity = [{ BearerAuth: [] as string[] }];

const schemas: Record<string, JsonSchema> = {
  ErrorResponse: {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string", example: "Chyba serveru." },
      code: { type: "string", nullable: true, example: "ACCOUNT_BANNED" },
      needsVerification: { type: "boolean", nullable: true, description: "Login 403: ucet neni overeny, overuje se jen odkazem z e-mailu (i role admin)" },
      errorId: { type: "string", nullable: true, example: "a1b2c3d4" },
    },
  },
  ValidationIssue: {
    type: "object",
    required: ["path", "message"],
    properties: {
      path: { type: "string", example: "password" },
      message: { type: "string", example: "Heslo musí mít alespoň 8 znaků" },
    },
  },
  ValidationErrorResponse: {
    type: "object",
    required: ["message", "errors"],
    properties: {
      message: { type: "string", example: "Chyba validace" },
      errors: {
        type: "array",
        items: ref("ValidationIssue"),
      },
    },
  },
  HealthResponse: {
    type: "object",
    required: ["status", "timestamp", "database"],
    properties: {
      status: { type: "string", example: "ok" },
      timestamp: { type: "string", format: "date-time" },
      database: { type: "string", example: "connected" },
    },
  },
  LoginRequest: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", example: "admin" },
      password: { type: "string", format: "password", example: "<vase-heslo>" },
    },
  },
  LoginResponse: {
    type: "object",
    required: ["token", "username", "userId", "role", "cabinId", "isSuperAdmin"],
    properties: {
      token: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
      username: { type: "string", example: "admin" },
      userId: { type: "string", format: "uuid" },
      role: { type: "string", enum: ["admin", "user", "guest"] },
      color: { type: "string", nullable: true, example: "#FFB300" },
      animalIcon: { type: "string", nullable: true, example: "fox" },
      cabinId: { type: "string", format: "uuid", nullable: true },
      isSuperAdmin: { type: "boolean", example: false },
    },
  },
  RegisterRequest: {
    type: "object",
    required: ["cabinName", "municipalityCode", "username", "email", "password"],
    properties: {
      cabinName: { type: "string", example: "Chata Trebenice" },
      subdomain: { type: "string", nullable: true, example: "trebenice" },
      municipalityCode: { type: "integer", description: "Kod nejblizsi obce v RUIAN z GET /api/municipalities", example: 565768 },
      username: { type: "string", example: "novyadmin" },
      email: { type: "string", format: "email", example: "admin@example.cz" },
      password: { type: "string", format: "password", example: "<vase-heslo>" },
      color: { type: "string", nullable: true, example: "#FFB300" },
    },
  },
  RegisterResponse: {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string", example: "Děkujeme za registraci. Poslali jsme ti e-mail s odkazem pro aktivaci účtu, zkontroluj schránku." },
      requiresVerification: { type: "boolean", nullable: true, description: "true = aktivacni odkaz poslany e-mailem, ucet se prihlasi az po overeni", example: true },
      testToken: { type: "string", nullable: true, description: "Jen mimo produkci, kdyz se aktivacni e-mail nepodarilo odeslat" },
    },
  },
  DashboardPrefs: {
    type: "object",
    additionalProperties: false,
    description: "Preference Prehledu u uzivatele (#681). Vsechny klice volitelne; chybejici klic nebo null = vychozi (weather true, ostatni bloky false, sceneMode animated, simplifiedNoteDismissed false). Neznamy klic nebo jiny typ = 400.",
    properties: {
      weather: { type: "boolean", nullable: true, description: "Blok Pocasi (vychozi zapnuty)" },
      cabinScene: { type: "boolean", nullable: true, description: "Blok Scena chaty" },
      sinceLast: { type: "boolean", nullable: true, description: "Blok Od minule" },
      laterAndFree: { type: "boolean", nullable: true, description: "Blok Potom a volno" },
      stayForecast: { type: "boolean", nullable: true, description: "Blok Predpoved na pobyt" },
      regionEvents: { type: "boolean", nullable: true, description: "Blok Akce v kraji" },
      noticeboard: { type: "boolean", nullable: true, description: "Blok Nastenka" },
      sceneMode: { type: "string", enum: ["animated", "static"], nullable: true, description: "Rezim Sceny chaty" },
      simplifiedNoteDismissed: { type: "boolean", nullable: true, description: "Jednorazova poznamka o zjednoduseni Prehledu je zavrena" },
    },
  },
  UserProfile: {
    type: "object",
    required: ["id", "username", "email", "color", "animalIcon", "role", "isEmailVerified", "dashboardPrefs"],
    properties: {
      id: { type: "string", format: "uuid" },
      username: { type: "string", example: "admin" },
      email: { type: "string", format: "email", nullable: true, example: "admin@example.cz" },
      color: { type: "string", nullable: true, example: "#FFB300" },
      animalIcon: { type: "string", nullable: true, example: "fox" },
      role: { type: "string", enum: ["admin", "user", "guest"] },
      isEmailVerified: { type: "boolean", example: true },
      dashboardPrefs: { allOf: [ref("DashboardPrefs")], nullable: true, description: "null = uzivatel si Prehled nenastavil, plati vychozi" },
    },
  },
  UpdateProfileRequest: {
    type: "object",
    properties: {
      email: { type: "string", format: "email", nullable: true, example: "admin@example.cz" },
      color: { type: "string", nullable: true, example: "#22C55E" },
      animalIcon: { type: "string", nullable: true, example: "fox" },
      currentPassword: { type: "string", maxLength: 100, description: "Soucasne heslo. Povinne jen pri zmene e-mailu (#475)." },
      dashboardPrefs: { allOf: [ref("DashboardPrefs")], nullable: true, description: "Slouci se s ulozenymi preferencemi; null u klice ho vrati na vychozi, null misto objektu vrati na vychozi vse. Meni jen prihlaseneho uzivatele, cabinId se neprijima." },
    },
  },
  UpdateProfileResponse: {
    type: "object",
    required: ["message", "user"],
    properties: {
      message: { type: "string", example: "Profil aktualizován." },
      user: {
        type: "object",
        properties: {
          email: { type: "string", format: "email", nullable: true },
          color: { type: "string", nullable: true },
          animalIcon: { type: "string", nullable: true },
          dashboardPrefs: { allOf: [ref("DashboardPrefs")], nullable: true },
        },
      },
    },
  },
  ChangeMyPasswordRequest: {
    type: "object",
    required: ["oldPassword", "newPassword"],
    properties: {
      oldPassword: { type: "string", format: "password" },
      newPassword: { type: "string", format: "password" },
    },
  },
  ChangeMyPasswordResponse: {
    type: "object",
    required: ["message", "token"],
    properties: {
      message: { type: "string", example: "Heslo úspěšně změněno." },
      token: { type: "string", description: "Novy JWT pro aktualni zarizeni; vsechny drivejsi tokeny prestaly platit" },
    },
  },
  CreateUserRequest: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", minLength: 2, maxLength: 50 },
      password: { type: "string", format: "password", minLength: 8, maxLength: 100 },
      role: { type: "string", enum: ["admin", "user", "guest"], default: "user" },
    },
  },
  CreateUserResponse: {
    type: "object",
    required: ["message", "user"],
    properties: {
      message: { type: "string", example: "Uživatel vytvořen." },
      user: {
        type: "object",
        required: ["id", "username"],
        properties: { id: { type: "string", format: "uuid" }, username: { type: "string" } },
      },
    },
  },
  MessageResponse: {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string", example: "OK" },
    },
  },
  SignupStatusResponse: {
    type: "object",
    required: ["cabinSignupEnabled"],
    properties: {
      cabinSignupEnabled: { type: "boolean", example: false },
    },
  },
  DemoAccountsResponse: {
    type: "object",
    required: ["accounts"],
    properties: {
      accounts: {
        type: "array",
        items: {
          type: "object",
          required: ["username", "label", "role", "password"],
          properties: {
            username: { type: "string", example: "demo-jana" },
            label: { type: "string", example: "Jana" },
            role: { type: "string", example: "user" },
            password: { type: "string" },
          },
        },
      },
    },
  },
  StagingFeedbackRequest: {
    type: "object",
    required: ["taskId", "text", "screen", "viewportWidth"],
    properties: {
      taskId: { type: "string", enum: ["general", "prehled", "rezervace", "nakup", "poznamka-mesic", "chat", "predavka", "galerie"] },
      text: { type: "string", minLength: 1, maxLength: 2000, example: "Nenasla jsem, kde je nakup." },
      screen: { type: "string", maxLength: 300, example: "/dashboard" },
      viewportWidth: { type: "integer", minimum: 0, maximum: 10000, example: 360 },
    },
  },
  StagingFeedbackResponse: {
    type: "object",
    required: ["id", "createdAt"],
    properties: { id: { type: "string", format: "uuid" }, createdAt: { type: "string", format: "date-time" } },
  },
  StagingFeedbackRecord: {
    allOf: [
      ref("StagingFeedbackRequest"),
      {
        type: "object",
        required: ["id", "createdAt", "cabinId", "userId", "username"],
        properties: {
          id: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          cabinId: { type: "string" },
          userId: { type: "string" },
          username: { type: "string" },
        },
      },
    ],
  },
  StagingFeedbackListResponse: {
    type: "object",
    required: ["feedback"],
    properties: { feedback: { type: "array", items: ref("StagingFeedbackRecord") } },
  },
  MunicipalitySearchResponse: {
    type: "object",
    required: ["municipalities"],
    properties: {
      municipalities: {
        type: "array",
        description: "Az 10 obci; obce se stejnym nazvem jako dotaz vzdy vsechny",
        items: {
          type: "object",
          required: ["code", "name", "district", "region"],
          properties: {
            code: { type: "integer", description: "Kod obce v RUIAN", example: 565768 },
            name: { type: "string", example: "Třebenice" },
            district: { type: "string", description: "Okres", example: "Litoměřice" },
            region: { type: "string", description: "Kraj", example: "Ústecký kraj" },
          },
        },
      },
    },
  },
  WaitlistSignupRequest: {
    type: "object",
    required: ["email", "segment", "consent"],
    properties: {
      email: { type: "string", format: "email", maxLength: 255, description: "Ulozi se oriznuty a malymi pismeny", example: "jana@example.com" },
      segment: { type: "string", enum: ["rodina", "spolek", "firma", "pronajimatel", "jine"], description: "Kdo se zapisuje" },
      consent: { type: "boolean", enum: [true], description: "Souhlas se zpracovanim e-mailu (ulozeni nejdele 24 mesicu)" },
      ref: { type: "string", nullable: true, description: "Odkud navstevnik prisel (?ref=); server ho orizne, necha jen pismena, cislice, . _ - a zkrati na 64 znaku" },
      website: { type: "string", description: "Honeypot, clovek ho necha prazdny. Vyplneny = nic se neulozi ani neposle, odpoved je stejna" },
    },
  },
  WaitlistSignupResponse: {
    type: "object",
    required: ["ok"],
    properties: { ok: { type: "boolean", enum: [true] } },
  },
  CabinSettings: {
    type: "object",
    required: ["id", "name", "subdomain", "weatherLocation", "isWinterized", "features", "createdAt"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string", example: "Chata Trebenice" },
      subdomain: { type: "string", example: "trebenice" },
      description: { type: "string", nullable: true },
      welcomeMessage: { type: "string", nullable: true },
      rules: { type: "string", nullable: true },
      departureChecklist: {
        type: "array",
        nullable: true,
        items: { type: "string" },
      },
      coverPhotoUrl: {
        type: "string", nullable: true, example: "/uploads/covers/0f8fad5b-d9cb-469f-a165-70867728950e.webp",
        description: "Titulni fotka ve velikosti pozadi appky: WebP varianta pro desktop 1920x1200 (do ~200 kB); varianta pro mobil 1080x1920 (do ~150 kB) ma stejne jmeno s priponou -sm. Meni se jen pres /api/cabin/cover-photo.",
      },
      weatherLocation: { type: "string", nullable: true, example: "Třebenice", description: "Nazev obce; u chat bez vybrane obce stary volny text" },
      municipalityCode: { type: "integer", nullable: true, example: 565768 },
      municipalityName: { type: "string", nullable: true, example: "Třebenice" },
      municipalityDistrict: { type: "string", nullable: true, example: "Litoměřice" },
      municipalityRegion: { type: "string", nullable: true, example: "Ústecký kraj" },
      latitude: { type: "number", nullable: true, description: "Definicni bod obce (WGS84), ne poloha chaty", example: 50.4763 },
      longitude: { type: "number", nullable: true, example: 13.99 },
      isWinterized: { type: "boolean", example: true },
      features: {
        type: "object",
        nullable: true,
        additionalProperties: true,
      },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  UpdateCabinSettingsRequest: {
    type: "object",
    properties: {
      name: { type: "string", example: "Chata Trebenice" },
      description: { type: "string", nullable: true },
      welcomeMessage: { type: "string", nullable: true },
      rules: { type: "string", nullable: true },
      departureChecklist: {
        type: "array",
        nullable: true,
        items: { type: "string" },
      },
      municipalityCode: {
        type: "integer", nullable: true, example: 565768,
        description: "Kod obce v RUIAN; server doplni nazev, okres, kraj a souradnice. null obec smaze. Volny text weatherLocation se neprijima.",
      },
      isWinterized: { type: "boolean" },
      features: { type: "object", additionalProperties: true },
    },
  },
  CheckoutState: {
    type: "object",
    description: "Stav chaty pri predavce; chybejici klic = neuvedeno. Plyn half je stara hodnota, UI zapisuje jen full/low/empty",
    properties: {
      gas: { type: "string", enum: ["full", "half", "low", "empty"] }, heatingOff: { type: "boolean" }, waterOff: { type: "boolean" },
      broken: { type: "string", maxLength: 1000 }, leftBehind: { type: "string", maxLength: 1000 }, note: { type: "string", maxLength: 1000 },
    },
  },
  CheckoutStatus: {
    type: "object",
    description: "Stav predavky pobytu; checkoutState je null, kdyz stav nikdo nevyplnil",
    properties: {
      isCheckoutCompleted: { type: "boolean" },
      checkoutCompletedBy: { type: "string", nullable: true }, checkoutCompletedByUsername: { type: "string", nullable: true },
      checkoutCompletedAt: { type: "string", format: "date-time", nullable: true }, checkoutState: ref("CheckoutState"),
    },
  },
  Reservation: {
    type: "object",
    required: ["id", "userId", "username", "from", "to", "purpose", "status"],
    properties: {
      id: { type: "string", format: "uuid" },
      userId: { type: "string", format: "uuid" },
      username: { type: "string", example: "admin" },
      from: { type: "string", format: "date", example: "2026-06-12" },
      to: { type: "string", format: "date", example: "2026-06-14" },
      purpose: { type: "string", example: "Vikend na chate" },
      notes: { type: "string", nullable: true },
      handoverNote: { type: "string", nullable: true },
      status: { type: "string", enum: ["primary", "soft", "backup"] },
      userColor: { type: "string", nullable: true },
      userAnimalIcon: { type: "string", nullable: true },
      isCheckoutCompleted: { type: "boolean", nullable: true },
      checkoutCompletedBy: { type: "string", nullable: true },
      checkoutCompletedAt: { type: "string", format: "date-time", nullable: true },
      participants: { type: "array", items: ref("ReservationParticipant") },
    },
  },
  ReservationParticipant: {
    type: "object",
    required: ["userId", "username"],
    properties: {
      userId: { type: "string", format: "uuid" },
      username: { type: "string", example: "babicka" },
      userColor: { type: "string", nullable: true },
      userAnimalIcon: { type: "string", nullable: true },
    },
  },
  Availability: {
    type: "object",
    required: ["id", "userId", "username", "startDate", "endDate"],
    properties: {
      id: { type: "string", format: "uuid" },
      userId: { type: "string", format: "uuid" },
      username: { type: "string" },
      userColor: { type: "string", nullable: true },
      userAnimalIcon: { type: "string", nullable: true },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
    },
  },
  ReservationListResponse: {
    type: "object",
    required: ["reservations", "availabilities"],
    properties: {
      reservations: {
        type: "array",
        items: ref("Reservation"),
      },
      availabilities: {
        type: "array",
        items: ref("Availability"),
      },
    },
  },
  CreateReservationRequest: {
    type: "object",
    required: ["from", "to", "purpose"],
    properties: {
      from: { type: "string", format: "date", example: "2026-06-12" },
      to: { type: "string", format: "date", example: "2026-06-14" },
      purpose: { type: "string", example: "Vikend na chate" },
      notes: { type: "string", nullable: true },
      handoverNote: { type: "string", nullable: true },
      status: {
        type: "string",
        enum: ["primary", "soft"],
        description: "Pozadovany typ (vychozi primary); pri kolizi s pevnou rezervaci server ulozi backup",
      },
      participantIds: {
        type: "array",
        items: { type: "string", format: "uuid" },
        description: "IDs spolucestujicich (organizator se vynecha)",
      },
    },
  },
  ShoppingUser: {
    type: "object",
    required: ["id", "username"],
    properties: {
      id: { type: "string", format: "uuid" },
      username: { type: "string" },
      color: { type: "string", nullable: true },
      animalIcon: { type: "string", nullable: true },
    },
  },
  ShoppingItem: {
    type: "object",
    required: ["id", "name", "status", "isEssential"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      status: { type: "string", enum: ["pending", "bring_from_home", "purchased"] },
      isEssential: { type: "boolean" },
      linkedInventoryId: { type: "string", format: "uuid", nullable: true },
      addedBy: ref("ShoppingUser"),
      purchasedBy: {
        allOf: [ref("ShoppingUser")],
        nullable: true,
        description: "Kdo položku zařídil – koupil nebo slíbil přivézt",
      },
      splits: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
    },
  },
  ShoppingList: {
    type: "object",
    required: ["id", "name", "createdAt", "isResolved", "items"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      isResolved: { type: "boolean" },
      createdBy: ref("ShoppingUser"),
      items: {
        type: "array",
        items: ref("ShoppingItem"),
      },
    },
  },
  CreateShoppingListRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", example: "Vikendovy nakup" },
    },
  },
  InventoryItem: {
    type: "object",
    required: ["id", "name", "category", "status", "isEssential", "inCart"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      category: { type: "string", example: "TRVANLIVE" },
      status: { type: "string", enum: ["OK", "LOW", "EMPTY"] },
      location: { type: "string", nullable: true },
      isEssential: { type: "boolean" },
      inCart: { type: "boolean" },
      updatedBy: {
        allOf: [ref("ShoppingUser")],
        nullable: true,
      },
    },
  },
  CreateInventoryItemRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", example: "Kava" },
      category: { type: "string", example: "TRVANLIVE" },
      status: { type: "string", enum: ["OK", "LOW", "EMPTY"] },
      location: { type: "string", nullable: true, example: "Kredenc" },
      isEssential: { type: "boolean", example: false },
    },
  },
  Channel: {
    type: "object",
    required: ["id", "name", "messageCount", "hasUnread"],
    properties: {
      id: { type: "string", format: "uuid", nullable: true },
      name: { type: "string", example: "Hlavni" },
      createdById: { type: "string", format: "uuid", nullable: true },
      createdAt: { type: "string", format: "date-time", nullable: true },
      messageCount: { type: "integer", example: 8 },
      lastMessage: { type: "string", nullable: true },
      lastMessageAt: { type: "string", format: "date-time", nullable: true },
      lastMessageBy: { type: "string", nullable: true },
      hasUnread: { type: "boolean" },
    },
  },
  CreateChannelRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", example: "Organizace vikendu" },
    },
  },
  GalleryFolder: {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string", example: "Leto 2026" },
    },
  },
  CreateGalleryFolderRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", example: "Leto 2026" },
    },
  },
  GalleryPhoto: {
    type: "object",
    required: ["id", "folderId", "src"],
    properties: {
      id: { type: "string", format: "uuid" },
      folderId: { type: "string", format: "uuid" },
      src: { type: "string", example: "/uploads/123.webp" },
      thumbSrc: { type: "string", nullable: true, example: "/uploads/thumbs/123.webp" },
      description: { type: "string", nullable: true },
    },
  },
  GalleryUploadResponse: {
    type: "array",
    items: ref("GalleryPhoto"),
  },
  AdminSystemResponse: {
    type: "object",
    required: ["userCount", "reservationCount", "photoCount", "noteCount"],
    properties: {
      userCount: { type: "integer", example: 5 },
      reservationCount: { type: "integer", example: 42 },
      photoCount: { type: "integer", example: 120 },
      noteCount: { type: "integer", example: 83 },
    },
  },
  LogEntry: {
    type: "object",
    additionalProperties: true,
    properties: {
      time: { type: "string", format: "date-time" },
      level: { type: "string", example: "info" },
      msg: { type: "string", example: "Token refreshed" },
      module: { type: "string", nullable: true, example: "AUTH" },
      requestId: { type: "string", nullable: true },
    },
  },
  LogsResponse: {
    type: "object",
    required: ["date", "count", "logs"],
    properties: {
      date: { type: "string", format: "date" },
      count: { type: "integer", example: 12 },
      logs: {
        type: "array",
        items: ref("LogEntry"),
      },
    },
  },
  LogFilesResponse: {
    type: "object",
    required: ["files"],
    properties: {
      files: {
        type: "array",
        items: { type: "string", example: "2026-05-30.log" },
      },
    },
  },
};

const paths: Record<string, OpenApiObject> = {
  "/api/health": {
    get: {
      tags: ["System"],
      summary: "Health check backendu a DB",
      responses: {
        "200": jsonResponse(ref("HealthResponse"), "Backend a databaze jsou dostupne"),
        "503": jsonResponse(ref("HealthResponse"), "Databaze neni dostupna"),
      },
    },
  },
  "/api/login": {
    post: {
      tags: ["Auth"],
      summary: "Prihlaseni uzivatele",
      requestBody: jsonRequestBody(ref("LoginRequest"), "Uzivatelske jmeno a heslo"),
      responses: {
        "200": jsonResponse(ref("LoginResponse"), "Prihlaseni probehlo uspesne"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny format requestu"),
        "401": jsonResponse(ref("ErrorResponse"), "Spatne prihlasovaci udaje"),
        "403": jsonResponse(ref("ErrorResponse"), "Ucet neni overen (needsVerification, plati i pro admina) nebo je blokovan (code ACCOUNT_BANNED)"),
      },
    },
  },
  "/api/session-cookie": {
    post: {
      tags: ["Auth"],
      summary: "Nastav cookie pro fotky z tokenu prihlasene relace",
      description: "Set-Cookie s tymz JWT (HttpOnly, SameSite=Strict, Path=/uploads, do exp tokenu); nastavuje ji i login a kazde vydani tokenu. /uploads/* vyda soubor jen s touto cookie clenovi chaty, ktere patri (jinak 401/404).",
      security: bearerSecurity,
      responses: { "204": { description: "Cookie nastavena" }, "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token") },
    },
  },
  "/api/logout": {
    post: { tags: ["Auth"], summary: "Odhlaseni: smaze cookie pro fotky", responses: { "204": { description: "Cookie smazana" } } },
  },
  "/api/register": {
    post: {
      tags: ["Auth"],
      summary: "Registrace nove chaty a admin uzivatele",
      requestBody: jsonRequestBody(ref("RegisterRequest")),
      responses: {
        "201": jsonResponse(ref("RegisterResponse"), "Registrace probehla uspesne"),
        "400": jsonResponse(ref("ErrorResponse"), "Neplatny vstup"),
        "403": jsonResponse(ref("ErrorResponse"), "Registrace novych chat je uzavrena (CABIN_SIGNUP_ENABLED)"),
        "409": jsonResponse(ref("ErrorResponse"), "Konflikt uzivatele nebo e-mailu"),
      },
    },
  },
  "/api/signup-status": {
    get: {
      tags: ["Auth"],
      summary: "Verejny stav registrace novych chat (CABIN_SIGNUP_ENABLED)",
      responses: {
        "200": jsonResponse(ref("SignupStatusResponse"), "Zda jde zalozit novou chatu"),
      },
    },
  },
  "/api/demo-accounts": {
    get: {
      tags: ["Auth"],
      summary: "Fiktivni demo ucty pro rychle prihlaseni (neprazdne jen na stagingu)",
      responses: {
        "200": jsonResponse(ref("DemoAccountsResponse"), "Seznam demo uctu, mimo staging prazdny"),
      },
    },
  },
  "/api/staging-feedback": {
    post: {
      tags: ["Staging"],
      summary: "Zpetna vazba testera z karty Co vyzkouset (jen staging; cabinId a uzivatel z prihlaseni)",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("StagingFeedbackRequest")),
      responses: {
        "201": jsonResponse(ref("StagingFeedbackResponse"), "Zaznam byl pripsan do souboru zpetne vazby"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Prazdny nebo prilis dlouhy text, neznamy ukol"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "404": jsonResponse(ref("ErrorResponse"), "Mimo staging endpoint neexistuje"),
      },
    },
    get: {
      tags: ["Staging"],
      summary: "Zpetna vazba testeru pro spravce chaty, od nejnovejsi (jen staging; jen zaznamy chaty prihlaseneho)",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("StagingFeedbackListResponse"), "Zaznamy chaty prihlaseneho spravce, bez souboru prazdny seznam"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "404": jsonResponse(ref("ErrorResponse"), "Mimo staging, nebo prihlaseny neni spravce chaty"),
      },
    },
  },
  "/api/municipalities": {
    get: {
      tags: ["Auth"],
      summary: "Verejne naseptavani obci CR (RUIAN, CUZK, CC BY 4.0) pro vyber nejblizsi obce chaty",
      parameters: [{
        name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 100 },
        description: "Zacatek nazvu obce, bez ohledu na diakritiku; muze pokracovat okresem (nova ves benesov)",
      }],
      responses: {
        "200": jsonResponse(ref("MunicipalitySearchResponse"), "Obce s okresem a krajem, bez souradnic"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Chybi dotaz nebo je kratsi nez 2 znaky"),
      },
    },
  },
  "/api/waitlist": {
    post: {
      tags: ["Waitlist"],
      summary: "Verejny zapis zajemce z landing page (bez prihlaseni, neni to data chaty)",
      description: "Navstevnik dostane jeden potvrzovaci e-mail (reply-to WAITLIST_CONTACT_EMAIL), spravce upozorneni na WAITLIST_NOTIFY_EMAIL. Bez nastavene adresy nebo pri vypadku maileru se zapis ulozi i tak.",
      requestBody: jsonRequestBody(ref("WaitlistSignupRequest")),
      responses: {
        "200": jsonResponse(ref("WaitlistSignupResponse"), "Zapis prijat; stejna odpoved i pro duplicitni e-mail (nic se nezmeni ani neposle) a vyplneny honeypot"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny e-mail, chybejici souhlas nebo neznamy segment"),
        "429": jsonResponse(ref("ErrorResponse"), "Prilis mnoho zapisu z jedne IP (5 za hodinu)"),
      },
    },
  },
  "/api/users": {
    post: {
      tags: ["Users"],
      summary: "Spravce zalozi clena sve chaty (cabinId z prihlaseni)",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("CreateUserRequest")),
      responses: {
        "201": jsonResponse(ref("CreateUserResponse"), "Clen byl vytvoren v chate spravce"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Prihlaseny neni spravce nebo nema prirazenou chatu"),
        "409": jsonResponse(ref("ErrorResponse"), "Jmeno je obsazene v jakekoli chate, bez ohledu na velikost pismen (jako registrace)"),
      },
    },
  },
  "/api/users/me": {
    get: {
      tags: ["Users"],
      summary: "Nacti profil prihlaseneho uzivatele",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("UserProfile"), "Profil uzivatele"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "404": jsonResponse(ref("ErrorResponse"), "Uzivatel nebyl nalezen"),
      },
    },
    patch: {
      tags: ["Users"],
      summary: "Uprav profil prihlaseneho uzivatele",
      description: "Zmena e-mailu (i jeho odebrani) vyzaduje currentPassword; na puvodni adresu pak odejde upozorneni. Barva, ikona a preference Prehledu heslo nechteji.",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("UpdateProfileRequest")),
      responses: {
        "200": jsonResponse(ref("UpdateProfileResponse"), "Profil byl aktualizovan"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Zmena e-mailu bez hesla nebo se spatnym heslem, nic se neulozilo"),
      },
    },
  },
  "/api/users/me/password": {
    patch: {
      tags: ["Users"],
      summary: "Zmen heslo prihlaseneho uzivatele",
      description: "Zvysi verzi tokenu: vsechna drivejsi prihlaseni (i na jinych zarizenich) prestanou platit. Aktualni zarizeni dostane v odpovedi novy token.",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("ChangeMyPasswordRequest")),
      responses: {
        "200": jsonResponse(ref("ChangeMyPasswordResponse"), "Heslo bylo zmeneno, odpoved nese novy token"),
        "400": jsonResponse(ref("ErrorResponse"), "Puvodni heslo nesedi"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/users/me/logout-all": {
    post: {
      tags: ["Users"],
      summary: "Odhlasit vsude: zneplatni vsechny tokeny uzivatele vcetne aktualniho",
      description: "Zvysi verzi tokenu. Kazdy drive vydany token pak vraci 401, i ten, kterym byl pozadavek poslan. Telo se ignoruje.",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("MessageResponse"), "Uzivatel byl odhlasen na vsech zarizenich"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/cabin": {
    get: {
      tags: ["Cabin"],
      summary: "Nacti aktualni nastaveni chaty",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("CabinSettings"), "Aktualni nastaveni chaty"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
        "404": jsonResponse(ref("ErrorResponse"), "Chata nebyla nalezena"),
      },
    },
    patch: {
      tags: ["Cabin"],
      summary: "Uprav nastaveni chaty",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("UpdateCabinSettingsRequest")),
      responses: {
        "200": jsonResponse(ref("CabinSettings"), "Nastaveni chaty bylo ulozeno"),
        "400": jsonResponse(ref("ErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Pouze admin muze menit nastaveni"),
      },
    },
  },
  "/api/cabin/cover-photo": {
    put: {
      tags: ["Cabin"],
      summary: "Nastav fotku z Galerie chaty jako titulni fotku (jen spravce)",
      description: "Server z fotky vyrobi dve WebP varianty ve velikosti pozadi appky (desktop 1920x1200 do ~200 kB, mobil 1080x1920 do ~150 kB s priponou -sm; orez na stred, kvalita se snizuje, dokud se varianta nevejde) pod novym jmenem a smaze soubory predchozi titulni fotky. Titulni fotka je kopie, smazani zdrojove fotky ji nezrusi. Chate odejde realtime event cabin:changed.",
      security: bearerSecurity,
      requestBody: jsonRequestBody({ type: "object", required: ["photoId"], properties: { photoId: { type: "string", format: "uuid" } } }),
      responses: {
        "200": jsonResponse(ref("CabinSettings"), "Titulni fotka nastavena, odpoved je aktualni nastaveni chaty"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatne ID fotky"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Titulni fotku muze menit jen spravce chaty"),
        "404": jsonResponse(ref("ErrorResponse"), "Fotka neni v Galerii teto chaty"),
      },
    },
    delete: {
      tags: ["Cabin"],
      summary: "Odeber titulni fotku chaty (jen spravce)",
      description: "Vynuluje coverPhotoUrl a smaze soubory obou variant. Chate odejde realtime event cabin:changed.",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("CabinSettings"), "Titulni fotka odebrana"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Titulni fotku muze menit jen spravce chaty"),
      },
    },
  },
  "/api/cabin/create": {
    post: {
      tags: ["Cabin"],
      summary: "Zaloz chatu pro prihlaseneho uzivatele bez chaty (onboarding)",
      security: bearerSecurity,
      requestBody: jsonRequestBody({ type: "object", required: ["name"], properties: { name: { type: "string", minLength: 2, maxLength: 100 } } }),
      responses: {
        "201": jsonResponse({ type: "object" }, "Chata vytvorena, odpoved obsahuje novy token a cabinId"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup nebo ucet uz chatu ma"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Registrace novych chat je uzavrena (CABIN_SIGNUP_ENABLED)"),
      },
    },
  },
  "/api/reservations": {
    get: {
      tags: ["Reservations"],
      summary: "Seznam rezervaci a dostupnosti pro aktualni chatu (host jen svoje pobyty a volno)",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("ReservationListResponse"), "Data rezervaci a dostupnosti"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
    post: {
      tags: ["Reservations"],
      summary: "Vytvor novou rezervaci",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("CreateReservationRequest")),
      responses: {
        "201": jsonResponse(ref("Reservation"), "Rezervace byla vytvorena"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
        "404": jsonResponse(ref("ErrorResponse"), "Ucastnik (participantIds) neni clenem chaty"),
      },
    },
  },
  "/api/reservations/{id}": {
    put: {
      tags: ["Reservations"],
      summary: "Uprav rezervaci (vlastnik nebo admin)",
      security: bearerSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: jsonRequestBody(ref("CreateReservationRequest"), "Vsechna pole jsou volitelna; status muze byt i backup"),
      responses: {
        "200": jsonResponse(ref("Reservation"), "Rezervace byla upravena"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "403": jsonResponse(ref("ErrorResponse"), "Cizi rezervace v ramci chaty a uzivatel neni admin"),
        "404": jsonResponse(ref("ErrorResponse"), "Rezervace nebo ucastnik neni v chate uzivatele"),
        "409": jsonResponse(ref("ErrorResponse"), "Kolize s potvrzenou rezervaci"),
      },
    },
    delete: {
      tags: ["Reservations"],
      summary: "Smaz rezervaci (vlastnik nebo admin); stejne jako puvodni POST /api/reservations/delete",
      security: bearerSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: {
        "200": jsonResponse(ref("MessageResponse"), "Rezervace byla smazana"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatne ID"),
        "403": jsonResponse(ref("ErrorResponse"), "Cizi rezervace v ramci chaty a uzivatel neni admin"),
        "404": jsonResponse(ref("ErrorResponse"), "Rezervace neni v chate uzivatele"),
      },
    },
  },
  "/api/reservations/{id}/checkout": {
    get: {
      tags: ["Reservations"],
      summary: "Stav predavky pobytu (kdo a kdy predal, stav chaty); host jen svuj pobyt",
      security: bearerSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": jsonResponse(ref("CheckoutStatus"), "Stav predavky"),
        "404": jsonResponse(ref("ErrorResponse"), "Pobyt neni v chate uzivatele"),
      },
    },
    patch: {
      tags: ["Reservations"],
      summary: "Predej chatu: dokonci predavku, nebo prepise stav uz dokoncene (cely objekt, neslucuje); emituje reservation:updated",
      security: bearerSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: jsonRequestBody({ type: "object", properties: { checkoutState: ref("CheckoutState") } },
        "Bez checkoutState se jen dokonci predavka a ulozeny stav zustane; nezname klice a typy server zahodi", false),
      responses: {
        "200": jsonResponse(ref("CheckoutStatus"), "Predavka ulozena"),
        "404": jsonResponse(ref("ErrorResponse"), "Pobyt neni v chate uzivatele"),
      },
    },
  },
  "/api/reservations/{reservationId}/assign": {
    post: {
      tags: ["Reservations"],
      summary: "Prirad rezervaci jinemu clenovi chaty (admin)",
      security: bearerSecurity,
      parameters: [{ name: "reservationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: jsonRequestBody({
        type: "object",
        required: ["newOwnerId"],
        properties: { newOwnerId: { type: "string", format: "uuid" } },
      }),
      responses: {
        "200": jsonResponse({ type: "object", properties: { message: { type: "string" } } }, "Prirazeno"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "403": jsonResponse(ref("ErrorResponse"), "Pouze admin"),
        "404": jsonResponse(ref("ErrorResponse"), "Rezervace nebo novy vlastnik neni v chate uzivatele"),
      },
    },
  },
  "/api/dashboard/reservations": {
    get: {
      tags: ["Dashboard"],
      summary: "Rezervacni cast dashboardu (aktivni pobyt, nadchazejici, posledni pobyt, gate odjezdu); host jen svuj pobyt",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(
          {
            type: "object",
            properties: {
              departingToday: { type: "boolean", description: "Muj pobyt dnes konci a predavka (isCheckoutCompleted) jeste neni dokoncena" },
              departingReservationId: { type: "string", nullable: true, description: "ID tohoto pobytu pro dokonceni predavky (PATCH /api/reservations/{id}/checkout), jinak null" },
              lastFault: {
                type: "object",
                nullable: true,
                description: "Zavada (pole broken) z posledni dokoncene predavky; null, kdyz ji dalsi predavka neuvadi",
                properties: {
                  text: { type: "string" },
                  reportedBy: { type: "string", description: "Kdo predavku vyplnil" },
                  reportedAt: { type: "string", format: "date-time" },
                },
              },
            },
            additionalProperties: true,
          },
          "Data pro dashboard; zde jsou popsana jen pole gate odjezdu a zavady",
        ),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
  },
  "/api/handover": {
    get: {
      tags: ["Reservations"],
      summary: "Tab Predavka: muj pobyt k predani a posledni predavka v chate (den v Europe/Prague); host dostane 403",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(
          {
            type: "object",
            required: ["myStay", "lastHandover"],
            properties: {
              myStay: {
                type: "object",
                nullable: true,
                description: "Muj primary pobyt (organizator nebo spolucestujici). Prednost: departure nedokoncena, departure dokoncena, ongoing, nejblizsi upcoming",
                properties: {
                  reservationId: { type: "string" },
                  from: { type: "string", format: "date" },
                  to: { type: "string", format: "date" },
                  phase: { type: "string", enum: ["upcoming", "ongoing", "departure"], description: "departure = den odjezdu nebo den po nem" },
                  isCheckoutCompleted: { type: "boolean" },
                },
              },
              lastHandover: {
                type: "object",
                nullable: true,
                description: "Posledni dokoncena predavka v chate (dateTo <= dnes) mimo myStay, razeni dateTo a checkoutCompletedAt sestupne",
                properties: {
                  reservationId: { type: "string" },
                  from: { type: "string", format: "date" },
                  to: { type: "string", format: "date" },
                  organizer: { type: "object", properties: { username: { type: "string" }, userColor: { type: "string", nullable: true }, userAnimalIcon: { type: "string", nullable: true } } },
                  completedByUsername: { type: "string", nullable: true, description: "Kdo predavku dokoncil" },
                  completedAt: { type: "string", format: "date-time", nullable: true },
                  checkoutState: ref("CheckoutState"),
                },
              },
            },
          },
          "Prehled predavky pro prihlaseneho uzivatele",
        ),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema prirazenou chatu, nebo je host"),
      },
    },
  },
  "/api/dashboard/shopping": {
    get: {
      tags: ["Dashboard"],
      summary: "Nakupni cast dashboardu: nevyrizene polozky, pocty a karta Potrebuje pozornost",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(
          {
            type: "object",
            properties: {
              attention: {
                type: "array",
                description: "Zasoby LOW/EMPTY a nevyrizene dulezite polozky bez takove zasoby; Doslo pred Dochazi, dulezite napred",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    isEmpty: { type: "boolean", description: "Doslo (EMPTY), jinak Dochazi" },
                    isEssential: { type: "boolean" },
                    inventoryId: { type: "string", nullable: true, description: "Zasoba pro POST /api/inventory/{id}/pledge" },
                    shoppingItemId: { type: "string", nullable: true, description: "Nevyrizena polozka nakupu, pokud uz na seznamu je" },
                  },
                },
              },
            },
            additionalProperties: true,
          },
          "Data pro dashboard; zde je popsano jen pole karty Potrebuje pozornost",
        ),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
  },
  "/api/inventory/{id}/pledge": {
    post: {
      tags: ["Shopping"],
      summary: "Koupim ja: slib Privezu z domova pro zasobu; chybi-li polozka na aktivnim seznamu, prida ji",
      security: bearerSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: {
        "200": jsonResponse(
          {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["bring_from_home"] },
              purchasedById: { type: "string" },
              created: { type: "boolean", description: "Polozku pridal az slib (Zpet ji smaze, jinak ji vrati na Koupit)" },
              supplyStatusBefore: { type: "string", enum: ["OK", "LOW", "EMPTY"], description: "Stav zasoby pred slibem, pro Zpet (#511)" },
            },
          },
          "Polozka nakupu je slibena a zasoba doplnena (OK)",
        ),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatne ID"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "404": jsonResponse(ref("ErrorResponse"), "Zasoba neni v chate uzivatele"),
      },
    },
  },
  "/api/shopping-lists": {
    get: {
      tags: ["Shopping"],
      summary: "Seznam aktivnich nakupnich seznamu",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse({ type: "array", items: ref("ShoppingList") }, "Aktivni nakupni seznamy"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
    post: {
      tags: ["Shopping"],
      summary: "Vytvor novy nakupni seznam",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("CreateShoppingListRequest")),
      responses: {
        "201": jsonResponse(ref("ShoppingList"), "Seznam byl vytvoren"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/shopping-lists/{id}": {
    delete: {
      tags: ["Shopping"],
      summary: "Smaz nakupni seznam i s polozkami (zakladatel seznamu nebo admin)",
      security: bearerSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: {
        "200": jsonResponse(ref("MessageResponse"), "Seznam byl smazan"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Host, nebo clen, ktery seznam nezalozil a neni admin"),
        "404": jsonResponse(ref("ErrorResponse"), "Seznam neni v chate uzivatele"),
      },
    },
  },
  "/api/shopping-list/{itemId}": {
    delete: {
      tags: ["Shopping"],
      summary: "Smaz polozku nakupu (autor polozky, zakladatel seznamu nebo admin)",
      security: bearerSecurity,
      parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: {
        "200": jsonResponse({ type: "object", properties: { success: { type: "boolean" } } }, "Polozka byla smazana"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Host, nebo clen, ktery polozku nepridal, seznam nezalozil a neni admin"),
        "404": jsonResponse(ref("ErrorResponse"), "Polozka neni v chate uzivatele"),
      },
    },
  },
  "/api/inventory": {
    get: {
      tags: ["Inventory"],
      summary: "Seznam zasob na chate",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse({ type: "array", items: ref("InventoryItem") }, "Inventar chaty"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
    post: {
      tags: ["Inventory"],
      summary: "Vytvor novou polozku inventare",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("CreateInventoryItemRequest")),
      responses: {
        "201": jsonResponse(ref("InventoryItem"), "Polozka inventare byla vytvorena"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/channels": {
    get: {
      tags: ["Channels"],
      summary: "Seznam kanalu s preview posledni zpravy",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse({ type: "array", items: ref("Channel") }, "Kanaly chaty"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
    post: {
      tags: ["Channels"],
      summary: "Vytvor novy kanal",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("CreateChannelRequest")),
      responses: {
        "201": jsonResponse(ref("Channel"), "Kanal byl vytvoren"),
        "400": jsonResponse(ref("ErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/gallery/folders": {
    get: {
      tags: ["Gallery"],
      summary: "Seznam galerijnich slozek",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse({ type: "array", items: ref("GalleryFolder") }, "Slozky galerie"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Uzivatel nema priirazenou chatu"),
      },
    },
    post: {
      tags: ["Gallery"],
      summary: "Vytvor novou galerijni slozku",
      security: bearerSecurity,
      requestBody: jsonRequestBody(ref("CreateGalleryFolderRequest")),
      responses: {
        "201": jsonResponse(ref("GalleryFolder"), "Slozka byla vytvorena"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/gallery/photos": {
    post: {
      tags: ["Gallery"],
      summary: "Nahraj jednu nebo vice fotek do slozky",
      security: bearerSecurity,
      requestBody: multipartRequestBody(
        {
          type: "object",
          required: ["folderId", "photos"],
          properties: {
            folderId: { type: "string", format: "uuid", example: "11111111-1111-1111-1111-111111111111" },
            photos: {
              type: "array",
              items: { type: "string", format: "binary" },
            },
          },
        },
        "V Postmanu použij form-data pole folderId a jedno nebo více polí photos"
      ),
      responses: {
        "200": jsonResponse(ref("GalleryUploadResponse"), "Fotky byly uspesne nahrane"),
        "400": jsonResponse(ref("ErrorResponse"), "Chybi folderId nebo soubory, nebo soubor neni podporovany obrazek (SVG, podvrh, pixel bomb nad 100 MP); davka se pak neulozi cela"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "404": jsonResponse(ref("ErrorResponse"), "Slozka nebyla nalezena"),
        "413": jsonResponse(ref("ErrorResponse"), "Soubor je vetsi nez 15 MB"),
      },
    },
    delete: {
      tags: ["Gallery"],
      summary: "Hromadne smaze fotky; clen smaze jen vlastni, cizi se preskoci",
      security: bearerSecurity,
      requestBody: jsonRequestBody({ type: "object", required: ["photoIds"], properties: { photoIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", format: "uuid" } } } }),
      responses: {
        "200": jsonResponse({ type: "object", required: ["message", "deleted"], properties: { message: { type: "string" }, deleted: { type: "integer", minimum: 0, description: "Kolik fotek se opravdu smazalo" } } }, "Smazane fotky, ktere uzivatel smi smazat"),
        "400": jsonResponse(ref("ValidationErrorResponse"), "Neplatny vstup"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
      },
    },
  },
  "/api/admin/system": {
    get: {
      tags: ["Admin"],
      summary: "Zakladni systemove statistiky pro admina",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("AdminSystemResponse"), "Systemove statistiky"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Pouze pro admina"),
      },
    },
  },
  "/api/logs/files": {
    get: {
      tags: ["Logs"],
      summary: "Seznam dostupnych log souboru",
      security: bearerSecurity,
      responses: {
        "200": jsonResponse(ref("LogFilesResponse"), "Dostupne log soubory"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Pouze pro adminy"),
      },
    },
  },
  "/api/logs": {
    get: {
      tags: ["Logs"],
      summary: "Cteni backend/frontend logu s filtry",
      security: bearerSecurity,
      parameters: [
        { name: "date", in: "query", schema: { type: "string", format: "date" }, required: false },
        { name: "lines", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 }, required: false },
        { name: "level", in: "query", schema: { type: "string", enum: ["debug", "info", "warn", "error"] }, required: false },
        { name: "source", in: "query", schema: { type: "string", enum: ["backend", "frontend"] }, required: false },
        { name: "requestId", in: "query", schema: { type: "string" }, required: false },
        { name: "userId", in: "query", schema: { type: "string" }, required: false },
        { name: "module", in: "query", schema: { type: "string" }, required: false },
        { name: "path", in: "query", schema: { type: "string" }, required: false },
        { name: "status", in: "query", schema: { type: "integer", minimum: 100, maximum: 599 }, required: false },
        { name: "search", in: "query", schema: { type: "string" }, required: false },
      ],
      responses: {
        "200": jsonResponse(ref("LogsResponse"), "Filtrovany vystup logu"),
        "400": jsonResponse(ref("ErrorResponse"), "Neplatny filtr logu"),
        "401": jsonResponse(ref("ErrorResponse"), "Chybi nebo je neplatny token"),
        "403": jsonResponse(ref("ErrorResponse"), "Pouze pro adminy"),
      },
    },
  },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Chata API",
    version: "1.0.0",
    description: "Starter OpenAPI coverage for backend learning flows, Swagger UI and Postman. Covers the most useful endpoints for auth, profile, cabin, reservations, shopping, inventory, channels, gallery, admin and logs. The backend contains more routes than are currently documented here. Role guest (host) dostane 403 vsude mimo whitelist: vlastni rezervace a check-out, GET /api/cabin, dashboard rezervaci, vlastni profil; cizi pobyt je pro hosta 404.",
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: "Local backend",
    },
    {
      url: "/",
      description: "Relative backend origin",
    },
  ],
  tags: [
    { name: "System", description: "Health and platform status" },
    { name: "Auth", description: "Public authentication flows" },
    { name: "Users", description: "Current user profile endpoints" },
    { name: "Cabin", description: "Cabin settings and shared configuration" },
    { name: "Reservations", description: "Reservation planning and availability" },
    { name: "Dashboard", description: "Dashboard summaries" },
    { name: "Shopping", description: "Shopping lists" },
    { name: "Inventory", description: "Pantry and stock" },
    { name: "Channels", description: "Chat channels" },
    { name: "Gallery", description: "Gallery folders and uploads" },
    { name: "Admin", description: "Admin-only cabin diagnostics" },
    { name: "Logs", description: "Operational log access" },
    { name: "Staging", description: "Staging-only guided testing" },
    { name: "Waitlist", description: "Public waitlist signup from the landing page" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT s platnosti 7 dni nese tokenVersion. Token bez verze nebo se starou verzi (po zmene hesla, banu, odebrani z chaty, zmene role, smazani uctu nebo Odhlasit vsude) vraci 401.",
      },
    },
    schemas,
  },
  paths,
} as const;