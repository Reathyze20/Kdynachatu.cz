# Component Inventory

Complete map of every existing React component in `frontend-v2/src/`. Read this before creating new components to avoid duplicating what already exists.

---

## shadcn/ui Primitives (`components/ui/`)

These are pre-built, ready to import from `@/components/ui/<name>`:

| Component | Import | Usage |
|---|---|---|
| Avatar | `@/components/ui/avatar` | User avatar display |
| Badge | `@/components/ui/badge` | Status tags, counts |
| Button | `@/components/ui/button` | Standard button with variants |
| Card | `@/components/ui/card` | Card, CardHeader, CardContent, CardFooter |
| Checkbox | `@/components/ui/checkbox` | Radix checkbox |
| Dialog | `@/components/ui/dialog` | Radix dialog (use Modal.tsx instead for consistency) |
| DropdownMenu | `@/components/ui/dropdown-menu` | Context menus, action dropdowns |
| Form | `@/components/ui/form` | React Hook Form integration |
| Input | `@/components/ui/input` | Text input |
| Label | `@/components/ui/label` | Form labels |
| ScrollArea | `@/components/ui/scroll-area` | Custom scrollbars |
| Separator | `@/components/ui/separator` | Horizontal/vertical dividers |
| Sheet | `@/components/ui/sheet` | Side drawers (mobile profile) |
| Sonner | `@/components/ui/sonner` | Toast library (internal, use showToast) |

---

## Layout (`components/layout/`)

| Component | Purpose | Key Props |
|---|---|---|
| **AppShell** | Main wrapper — header + nav + `<Outlet>` with Framer Motion route transitions | — |
| **DesktopSidebar** | Desktop left sidebar (frame #1b), a glass card: cabin name + `PRIMARY_NAV` and a „Víc“ group with `MORE_NAV`, icon + label; footer with help (`HelpFab variant="sidebar"`) and `SidebarProfileMenu`. Desktop has no top bar (#205) | `onOpenProfileDrawer` |
| **SidebarProfileMenu** | Profile menu at the bottom of the desktop sidebar (profile, backoffice, admin, invites, diagnostics, logout); opens upward via portal, keyboard menu-button pattern; avatar only on the collapsed sidebar | `onOpenProfileDrawer` |
| **TwoColumnLayout** | Page layout of frame #1b: main column + optional side panel (`<aside>`), side by side from 1024 px (1.5fr : 1fr), stacked on smaller screens; no side panel = nothing rendered, main takes full width. Side panel = light context only, never an action you must not miss | `children, aside?, asideLabel?, className?` |
| **MobileHeader** | Mobile top bar with user avatar | `animalIcon, username, onOpenProfileDrawer` |
| **MobileNav** | Bottom tab bar: `PRIMARY_NAV` (Přehled · Kalendář · Předávka · Zásoby) + „Víc“ sheet with `MORE_NAV` | — |
| **ProfileDrawer** | Right-side sheet with profile settings, avatar/color picker, password change, logout | `open, onClose` |

---

## Shared (`components/shared/`)

| Component | Purpose | Key Props |
|---|---|---|
| **Modal** | Unified portal modal — glassmorphism, Framer Motion, Escape/backdrop close | `isOpen, onClose, title, children, footer, maxWidth, persistent` |
| **Toast** | Global toast renderer — listens to `window.dispatchEvent('toast:show')` | — (auto-renders) |
| **FeatureErrorFallback** | Per-feature error boundary fallback with retry | `error, resetErrorBoundary, title?` |
| **GlobalFallback** | App-wide fatal error screen | `error, resetErrorBoundary` |
| **OfflineBanner** | Yellow "Jste offline" banner at top | — (uses `useOnline`) |
| **HelpFab** | Floating help button + modal with app guide | — |
| **AvatarPicker** | Grid of 30 animal emojis for profile | `value, onChange` |
| **ColorPicker** | Grid of 18 swatch colors for profile | `value, onChange` |
| **TurnusChainLine** | Turnus chain as one text line „Teď: X → Další: Y (po 14. 12.) → Pak: Z“; shared by Přehled (#172) and calendar (#211). Nodes from `buildTurnusChain`; empty chain renders nothing | `nodes, onSelect?, className?` |

---

## Feature Pages & Components

### Auth (`features/auth/`)
| Component | Type | Status |
|---|---|---|
| AuthPage | Page | ✅ Complete |
| LoginForm | Form | ✅ Complete |
| RegisterForm | Form | ✅ Complete |
| VerifyForm | Form | ✅ Complete |
| hooks/useCabinSignup | Hook | ✅ `signupEnabled` (CABIN_SIGNUP_ENABLED), `SIGNUP_STATUS_KEY` |

### Dashboard (`features/dashboard/`)
| Component | Type | Status |
|---|---|---|
| DashboardPage | Page | ✅ Complete |
| WeatherCard | Widget | ✅ (calls Open-Meteo directly) |
| CabinHero | Header | ✅ Compact cabin strip above both columns: photo slot (Midjourney drop-in via `overviewAssets.ts`), cabin name, date + weather line (#172) |
| ActiveReservation | Card | ✅ „Na chatě teď“: who is at the cabin now + turnus chain; nothing planned = invitation „Chata zatím čeká“ with illustration slot (#172) |
| NextArrivalCard | Card | ✅ Side panel „Další příjezd“: next firm stay, own as „Ty“, plus „Váš pobyt“ when mine is not next (#172) |
| DepartureBanner | Banner | ✅ |
| PinnedNote | Card | ✅ |
| RunningLowCard | Card | ✅ Side panel „Dochází“: essential (★) items waiting to be bought + shopping-list count, link to Zásoby; nothing to say = no card (#172) |

### Reservations (`features/reservations/`)
| Component | Type | Status |
|---|---|---|
| ReservationsPage | Page | ✅ |
| calendar/CalendarGrid | Custom | ✅ Monthly grid view |
| calendar/CalendarCell | Custom | ✅ Day cell with reservation bars |
| ui/AvailabilityModal | Modal | ✅ Mark vacation |
| ui/BookingForm | Form | ✅ Create/edit reservation |
| ui/CheckoutSection | Form | ✅ Departure checklist |
| ui/InventoryNotifyDialog | Modal | ✅ Missing items warning |
| ui/QuickStats | Widget | ✅ Month/year stats |
| ui/ReservationDetail | Panel | ✅ Detail + edit/delete |
| ui/ReservationList | List | ✅ Flat list alternative |
| hooks/useCalendar | Hook | ✅ Month nav, range selection |
| hooks/useReservations | Hook | ✅ CRUD + checkout |

### Notes (`features/notes/`)
| Component | Type | Status |
|---|---|---|
| NotesPage | Page | ✅ Master-detail |
| ThreadList | List | ✅ Left panel chat threads |
| ChatView | View | ✅ Right panel messages |
| MessageBubble | Item | ✅ With context actions |
| MessageInput | Form | ✅ Chat composer |
| AddToShoppingDialog | Modal | ✅ Add message → shopping |
| CreateRepairDialog | Modal | ✅ Message → reconstruction |
| hooks/useNotes | Hook | ✅ |
| hooks/useThreads | Hook | ✅ |

### Shopping (`features/shopping/`)
| Component | Type | Status |
|---|---|---|
| ShoppingPage | Page | ✅ |
| ViewSwitcher | Tabs | ✅ Lists / Pantry toggle |
| ListMaster | List | ✅ Left panel list cards |
| ListDetail | View | ✅ Right panel items |
| ItemRow | Item | ✅ Checkbox + delete |
| PantryView | View | ✅ Inventory right panel |
| InventoryRow | Item | ✅ Status display |
| AddToCartModal | Modal | ✅ |
| EditInventoryModal | Modal | ✅ |
| ShareListDialog | Modal | ✅ |
| hooks/useShoppingLists | Hook | ✅ |
| hooks/useInventory | Hook | ✅ |

### Gallery (`features/gallery/`)
| Component | Type | Status |
|---|---|---|
| GalleryPage | Page | ✅ |
| FolderGrid | Grid | ✅ |
| PhotoGrid | Grid | ✅ |
| Lightbox | Overlay | ✅ Fullscreen viewer |
| UploadModal | Modal | ✅ Photo upload + folder create |
| hooks/useGallery | Hook | ✅ |

### Diary (`features/diary/`)
| Component | Type | Status |
|---|---|---|
| DiaryPage | Page | ✅ |
| DiaryFolders | Grid | ✅ |
| DiaryCalendar | Calendar | ✅ Date picker + day view |
| NotebookModal | Modal | ✅ Entry editor |
| GalleryPicker | Modal | ✅ Attach photos |
| DiaryLightbox | Overlay | ✅ |
| hooks/useDiary | Hook | ✅ |

### Reconstruction (`features/reconstruction/`)
| Component | Type | Status |
|---|---|---|
| ReconstructionPage | Page | ✅ Kanban board |
| KanbanColumn | Column | ✅ Status-based |
| TaskFormModal | Modal | ✅ Create/edit |
| hooks/useReconstruction | Hook | ✅ |

### Admin (`features/admin/`)
| Component | Type | Status |
|---|---|---|
| AdminPage | Page | ✅ Member management |
| hooks/useAdmin | Hook | ✅ |

### Cabin Settings (`features/settings/`)
| Component | Type | Status |
|---|---|---|
| CabinSettingsPage | Page | ✅ |
| hooks/useCabinSettings | Hook | ✅ |

### Onboarding (`features/onboarding/`)
| Component | Type | Status |
|---|---|---|
| OnboardingPage | Page | ✅ First-time wizard |

### Landing (`features/landing/`)
| Component | Type | Status |
|---|---|---|
| LandingPage | Page | ✅ Public landing |

### Invite (`features/invite/`)
| Component | Type | Status |
|---|---|---|
| InvitePage | Page | ✅ Token join flow |

---

## API Modules (`api/`)

| Module | Key Exports | Functions |
|---|---|---|
| `client.ts` | `apiClient` (Axios) | JWT interceptor, 401 handler |
| `auth.ts` | `SignupStatusResponse`, `authApi` | getSignupStatus |
| `admin.ts` | `CabinUser`, `adminApi` | getUsers, getSystemInfo, getLogs, getInvites, createInvite, updateUserRole, deactivateUser |
| `dashboard.ts` | `DashboardData`, `dashboardApi` | getDashboard, getWeather, getWeatherForecast, getFreeWeekends |
| `diary.ts` | `DiaryFolder`, `DiaryEntry`, `diaryApi` | getFolders, createFolder, renameFolder, getEntriesInFolder, createEntry, updateEntry, deleteEntry |
| `gallery.ts` | `GalleryFolder`, `GalleryPhoto`, `galleryApi` | getFolders, createFolder, renameFolder, deleteFolder, getPhotos, getPhotosByIds, uploadPhotos |
| `notes.ts` | `Note`, `NoteThread`, `notesApi` | getNotes, sendNote, deleteNote, resolveNote, getThreads, createThread, deleteThread |
| `reconstruction.ts` | `RecItem`, `reconstructionApi` | getAll, create, update, vote |
| `reservations.ts` | `Reservation`, `reservationsApi` | getReservations, create, update, delete, checkout, availabilities CRUD |
| `settings.ts` | `CabinConfig`, `settingsApi` | getCabin, updateCabin |
| `shopping.ts` | `ShoppingItem`, `ShoppingList`, `shoppingApi` | getLists, createList, addItem, updateItem, deleteItem, getInventory |
| `schemas.ts` | Zod schemas | DashboardDataSchema, validation helpers |

---

## Global Hooks (`hooks/`)

| Hook | Purpose |
|---|---|
| `useOnline` | `navigator.onLine` + event listeners → `boolean` |
| `useCabinFeatures` | Query cabin feature flags → `{ features, isLoading }` |

---

## Lib Utilities (`lib/`)

| File | Key Exports |
|---|---|
| `utils.ts` | `cn()` (clsx+twMerge), `formatDate()`, `timeAgo()`, `escapeHtml()`, `ANIMAL_EMOJIS`, `SWATCH_COLORS`, `MONTH_NAMES`, `DAY_NAMES` |
| `dateUtils.ts` | `formatDateRange()`, `formatWeekendRange()`, `nightsBetween()`, `nightsLabel()`, `daysUntil()`, `formatShortDayDate()`, `getTodayFormatted()`, `getLocalTodayIso()` |
| `toast.ts` | `showToast(message, type)` — dispatches window event |
| `turnusChain.ts` | `buildTurnusChain(stays, today)` — nodes teď/další/pak from firm (`primary`) stays only, own stay `isMine` |
| `navRoutes.ts` | `PRIMARY_NAV[]`, `MORE_NAV[]`, `visibleNavItems()`, `findActiveNavItem()` — global navigation model |
| `networkError.ts` | `isNetworkError()`, `OFFLINE_TOAST_MSG` |

---

## Context (`context/`)

| Context | Hook | Provides |
|---|---|---|
| `AuthContext` | `useAuth()` | `user`, `token`, `isLoggedIn`, `isAdmin`, `activeCabinId`, `login()`, `logout()`, `updateActiveCabin()`, `updateAnimalIcon()` |
