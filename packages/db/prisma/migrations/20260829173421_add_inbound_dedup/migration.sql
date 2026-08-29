-- CreateTable
CREATE TABLE "InboundMessageDedup" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessageDedup_pkey" PRIMARY KEY ("id")
);
