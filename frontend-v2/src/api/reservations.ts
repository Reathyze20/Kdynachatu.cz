// Types matching src/types.ts — duplicated here to avoid cross-project imports
import apiClient from "./client";

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
  /** Legacy "Vzkaz pro další" from the booking form — not the handover (`checkoutState`) nor the pinned board note */
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

export const checkoutPath = (id: string) => `/reservations/${id}/checkout`;

/**
 * Completes the handover (předávka) of a stay: marks the checkout done and, when given,
 * stores the structured state of the cabin. The single write path shared by
 * CheckoutSection (reservation detail) and DepartureBanner (dashboard).
 * `state === undefined` keeps any previously stored state untouched.
 */
export function completeCheckout(id: string, state?: CheckoutState): Promise<CheckoutStatus> {
  return apiClient
    .patch<CheckoutStatus>(checkoutPath(id), state !== undefined ? { checkoutState: state } : undefined)
    .then((r) => r.data);
}
