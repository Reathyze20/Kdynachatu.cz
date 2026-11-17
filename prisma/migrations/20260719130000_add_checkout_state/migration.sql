-- AlterTable: structured "state of the cabin" captured at checkout (arrival-briefing source)
ALTER TABLE "reservations" ADD COLUMN "checkout_state" JSONB;
ALTER TABLE "reservations" ADD COLUMN "checkout_state_at" TIMESTAMP(3);
