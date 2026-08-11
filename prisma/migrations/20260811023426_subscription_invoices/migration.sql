-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('OPEN', 'NEEDS_ATTENTION', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "AuditEvent" ALTER COLUMN "businessId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "period" "BillingPeriod" NOT NULL,
    "amountDiram" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "period" "BillingPeriod" NOT NULL,
    "amountDiram" INTEGER NOT NULL,
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "reference" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_plan_period_key" ON "PlanPrice"("plan", "period");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_reference_key" ON "SubscriptionInvoice"("reference");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_businessId_status_idx" ON "SubscriptionInvoice"("businessId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_status_createdAt_idx" ON "SubscriptionInvoice"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
