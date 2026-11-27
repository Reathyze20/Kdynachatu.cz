// Tab Předávka, GET /api/handover (spec #173). Wire typ zdvojený se src/types.ts (HandoverOverview).
import { z } from "zod";
import apiClient from "./client";
import { CheckoutStateLiteSchema } from "./schemas";

const HandoverOverviewSchema = z.object({
  myStay: z.object({
    reservationId: z.string(),
    from: z.string(),
    to: z.string(),
    phase: z.enum(["upcoming", "ongoing", "departure"]),
    isCheckoutCompleted: z.boolean(),
  }).nullable(),
  lastHandover: z.object({
    reservationId: z.string(),
    from: z.string(),
    to: z.string(),
    organizer: z.object({ username: z.string(), userColor: z.string().nullable(), userAnimalIcon: z.string().nullable() }),
    completedByUsername: z.string().nullable(),
    completedAt: z.string().nullable(),
    checkoutState: CheckoutStateLiteSchema,
  }).nullable(),
});

export type HandoverOverview = z.infer<typeof HandoverOverviewSchema>;
export type LastHandover = NonNullable<HandoverOverview["lastHandover"]>;

export async function fetchHandoverOverview(): Promise<HandoverOverview> {
  const { data } = await apiClient.get("/handover");
  return HandoverOverviewSchema.parse(data);
}
