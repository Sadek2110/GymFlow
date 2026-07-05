CREATE TABLE "GymCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dniEnc" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GymCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GymCredential_userId_key" ON "GymCredential"("userId");
ALTER TABLE "GymCredential"
  ADD CONSTRAINT "GymCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "autoReserveTimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "User"
SET "autoReserveTimes" = ARRAY["autoReserveTime"]
WHERE "autoReserveTime" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "autoReserveTime";

CREATE INDEX "Reservation_userId_date_idx" ON "Reservation"("userId", "date");
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
