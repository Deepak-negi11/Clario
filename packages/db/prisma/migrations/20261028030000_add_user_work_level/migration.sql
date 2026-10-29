-- CreateEnum
CREATE TYPE "WorkLevel" AS ENUM ('Fresher', 'Junior', 'Mid', 'Senior', 'Lead');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "level" "WorkLevel";
