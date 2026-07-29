-- Extend existing catalog entities without removing historical rows.
ALTER TABLE "Branch"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Service"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Resource"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "StaffMember"
  ADD COLUMN "businessId" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ALTER COLUMN "membershipId" DROP NOT NULL;

UPDATE "StaffMember" AS staff
SET "businessId" = branch."businessId"
FROM "Branch" AS branch
WHERE branch."id" = staff."branchId";

ALTER TABLE "StaffMember" ALTER COLUMN "businessId" SET NOT NULL;

CREATE TABLE "StaffBranch" (
  "staffId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "StaffBranch_pkey" PRIMARY KEY ("staffId", "branchId")
);

INSERT INTO "StaffBranch" ("staffId", "branchId", "isPrimary")
SELECT "id", "branchId", true FROM "StaffMember";

CREATE TABLE "StaffScheduleRule" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startsAt" TEXT NOT NULL,
  "endsAt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffScheduleRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleBreak" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "staffId" TEXT,
  "dayOfWeek" INTEGER NOT NULL,
  "startsAt" TEXT NOT NULL,
  "endsAt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleBreak_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleException" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "staffId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

DROP INDEX "StaffMember_branchId_idx";
ALTER TABLE "StaffMember" DROP CONSTRAINT "StaffMember_branchId_fkey";
ALTER TABLE "StaffMember" DROP CONSTRAINT "StaffMember_membershipId_fkey";
ALTER TABLE "StaffMember" DROP COLUMN "branchId";

CREATE INDEX "StaffMember_businessId_archivedAt_idx" ON "StaffMember"("businessId", "archivedAt");
CREATE INDEX "StaffBranch_branchId_idx" ON "StaffBranch"("branchId");
CREATE INDEX "StaffScheduleRule_staffId_branchId_dayOfWeek_idx" ON "StaffScheduleRule"("staffId", "branchId", "dayOfWeek");
CREATE INDEX "StaffScheduleRule_branchId_dayOfWeek_idx" ON "StaffScheduleRule"("branchId", "dayOfWeek");
CREATE INDEX "ScheduleBreak_branchId_dayOfWeek_idx" ON "ScheduleBreak"("branchId", "dayOfWeek");
CREATE INDEX "ScheduleBreak_staffId_dayOfWeek_idx" ON "ScheduleBreak"("staffId", "dayOfWeek");
CREATE INDEX "ScheduleException_branchId_startsAt_endsAt_idx" ON "ScheduleException"("branchId", "startsAt", "endsAt");
CREATE INDEX "ScheduleException_staffId_startsAt_endsAt_idx" ON "ScheduleException"("staffId", "startsAt", "endsAt");

ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffBranch" ADD CONSTRAINT "StaffBranch_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffBranch" ADD CONSTRAINT "StaffBranch_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffScheduleRule" ADD CONSTRAINT "StaffScheduleRule_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffScheduleRule" ADD CONSTRAINT "StaffScheduleRule_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBreak" ADD CONSTRAINT "ScheduleBreak_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBreak" ADD CONSTRAINT "ScheduleBreak_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
