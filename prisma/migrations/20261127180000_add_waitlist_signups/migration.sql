-- Zápisy zájemců z landing page (#696, spec #692). Aditivní: nová tabulka bez cabin_id (není data chaty).
-- Obsahuje rovnou i sloupce dobrovolných otázek (#699), aby celé funkci stačila jedna migrace.
-- CreateTable
CREATE TABLE "waitlist_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "households" TEXT,
    "willingness_to_pay" TEXT,
    "pain_point" TEXT,
    "rental_intent" TEXT,
    "rental_needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ref" VARCHAR(64),
    "consented_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_signups_email_key" ON "waitlist_signups"("email");
