// Types matching src/types.ts — duplicated here to avoid cross-project imports

export interface ReservationParticipant {
  userId: string;
  username: string;
  userColor?: string | null;
  userAnimalIcon?: string | null;
}

/** Structured "state of the cabin" filled at checkout; feeds the arrival briefing */
export interface CheckoutState {
  gas?: "full" | "half" | "low" | "empty" | null;
  heatingOff?: boolean;
  waterOff?: boolean;
  broken?: string;
  leftBehind?: string;
  note?: string;
}

export interface Reservation {
  id: string;
  userId: string;
  username: string;
  from: string;  // YYYY-MM-DD
  to: string;    // YYYY-MM-DD
  purpose: string;
  notes?: string;
  handoverNote?: string;
  status?: "primary" | "backup" | "soft";
  userColor?: string;
  userAnimalIcon?: string | null;
  isCheckoutCompleted?: boolean;
  checkoutCompletedBy?: string | null;
  checkoutCompletedAt?: string | null;
  checkoutState?: CheckoutState | null;
  /** Co-occupants (spolucestující); organizer is userId above */
  participants?: ReservationParticipant[];
}

export interface UserAvailability {
  id: string;
  userId: string;
  username: string;
  userColor: string;
  userAnimalIcon?: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface ReservationUser {
  id: string;
  username: string;
  color?: string;
  role?: string;
  animalIcon?: string | null;
}

export interface ReservationsApiResponse {
  reservations: Reservation[];
  availabilities: UserAvailability[];
}

export interface MissingSummary {
  count: number;
  items: { name: string; status: "LOW" | "EMPTY" }[];
  hasShoppingItems: boolean;
  pendingShoppingCount: number;
}

export interface CheckoutStatus {
  isCheckoutCompleted: boolean;
  checkoutCompletedBy: string | null;
  checkoutCompletedByUsername: string | null;
  checkoutCompletedAt: string | null;
  checkoutState?: CheckoutState | null;
}
