-- CreateEnum
CREATE TYPE "SourceSystem" AS ENUM ('WORKLINE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SBOSS_STAFF', 'SBI_DEPUTED', 'CM', 'TM', 'TEAM_LEAD', 'FOS', 'SEVA_SARATHI', 'OTHER');

-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'AWAY');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'WEB');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('GRIEVANCE', 'REQUEST');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'NEEDS_RESOLVER_INPUT', 'ESCALATED', 'REASSIGNED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('USER', 'RESOLVER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('FREETEXT', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "EscalationTrigger" AS ENUM ('MANUAL', 'AUTO_TAT_BREACH');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "personalMobileNo" TEXT,
    "officeMobileNo" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OTHER',
    "designation" TEXT,
    "department" TEXT,
    "circle" TEXT,
    "branch" TEXT,
    "vendor" TEXT,
    "workforceCategory" TEXT,
    "employmentType" TEXT,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reportingManagerId" TEXT,
    "skipLevelManagerId" TEXT,
    "recordType" INTEGER,
    "lastModifiedBy" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'WORKLINE',
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "rawWorklineRecord" JSONB,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL DEFAULT 'GRIEVANCE',
    "defaultTatHours" INTEGER NOT NULL,
    "escalationContactId" TEXT,
    "requiresWebForm" BOOLEAN NOT NULL DEFAULT false,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleVisibility" "Role"[],
    "resolverTeamId" TEXT NOT NULL,
    "tatHoursOverride" INTEGER,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "presenceStatus" "PresenceStatus" NOT NULL DEFAULT 'OFFLINE',

    CONSTRAINT "Resolver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EscalationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "ticketType" "TicketType" NOT NULL DEFAULT 'GRIEVANCE',
    "teamId" TEXT NOT NULL,
    "resolverId" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "referenceNote" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'standard',
    "channel" "Channel" NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tatDueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderType" "SenderType" NOT NULL,
    "body" TEXT NOT NULL,
    "channelType" "MessageChannel" NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryError" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "escalationTrigger" "EscalationTrigger",
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "runType" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "windowFrom" TIMESTAMP(3),
    "windowTo" TIMESTAMP(3),
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsUpserted" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnknownContact" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "messageBody" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "UnknownContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_externalId_key" ON "Identity"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_personalMobileNo_key" ON "Identity"("personalMobileNo");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_officeMobileNo_key" ON "Identity"("officeMobileNo");

-- CreateIndex
CREATE INDEX "Identity_employmentStatus_idx" ON "Identity"("employmentStatus");

-- CreateIndex
CREATE INDEX "Identity_role_idx" ON "Identity"("role");

-- CreateIndex
CREATE INDEX "Identity_reportingManagerId_idx" ON "Identity"("reportingManagerId");

-- CreateIndex
CREATE INDEX "Identity_skipLevelManagerId_idx" ON "Identity"("skipLevelManagerId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "Category_ticketType_idx" ON "Category"("ticketType");

-- CreateIndex
CREATE INDEX "Category_isConfidential_idx" ON "Category"("isConfidential");

-- CreateIndex
CREATE UNIQUE INDEX "Resolver_email_key" ON "Resolver"("email");

-- CreateIndex
CREATE INDEX "Ticket_ticketType_idx" ON "Ticket"("ticketType");

-- CreateIndex
CREATE INDEX "Ticket_status_breached_idx" ON "Ticket"("status", "breached");

-- CreateIndex
CREATE INDEX "Ticket_identityId_status_idx" ON "Ticket"("identityId", "status");

-- CreateIndex
CREATE INDEX "UnknownContact_reviewed_idx" ON "UnknownContact"("reviewed");

-- CreateIndex
CREATE UNIQUE INDEX "UnknownContact_phoneNumber_key" ON "UnknownContact"("phoneNumber");

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "Identity"("externalId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_skipLevelManagerId_fkey" FOREIGN KEY ("skipLevelManagerId") REFERENCES "Identity"("externalId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_escalationContactId_fkey" FOREIGN KEY ("escalationContactId") REFERENCES "EscalationContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_resolverTeamId_fkey" FOREIGN KEY ("resolverTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolver" ADD CONSTRAINT "Resolver_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_resolverId_fkey" FOREIGN KEY ("resolverId") REFERENCES "Resolver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
