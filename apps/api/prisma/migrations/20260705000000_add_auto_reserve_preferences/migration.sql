-- AlterTable
ALTER TABLE "User" ADD COLUMN "autoReserveEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoReserveTime" TEXT;
