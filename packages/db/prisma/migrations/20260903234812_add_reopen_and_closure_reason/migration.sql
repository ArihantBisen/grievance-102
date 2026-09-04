-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closureReason" TEXT,
ADD COLUMN     "lastReopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0;
