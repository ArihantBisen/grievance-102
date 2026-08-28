/*
  Warnings:

  - Added the required column `passwordHash` to the `Resolver` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Identity" ADD COLUMN     "roleClassifiedBy" TEXT NOT NULL DEFAULT 'sync';

-- AlterTable
ALTER TABLE "Resolver" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordHash" TEXT NOT NULL;
