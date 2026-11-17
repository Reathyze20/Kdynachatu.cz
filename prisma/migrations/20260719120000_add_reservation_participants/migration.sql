-- CreateTable
CREATE TABLE "reservation_participants" (
    "reservation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_participants_pkey" PRIMARY KEY ("reservation_id","user_id")
);

-- CreateIndex
CREATE INDEX "reservation_participants_user_id_idx" ON "reservation_participants"("user_id");

-- AddForeignKey
ALTER TABLE "reservation_participants" ADD CONSTRAINT "reservation_participants_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_participants" ADD CONSTRAINT "reservation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
