-- CreateEnum
CREATE TYPE "PrepaymentMode" AS ENUM ('FULL', 'DEPOSIT', 'NONE');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'NOT_REQUIRED';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "depositAmountDiram" INTEGER,
ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "prepaymentMode" "PrepaymentMode" NOT NULL DEFAULT 'FULL';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "totalDiram" INTEGER NOT NULL DEFAULT 0;

-- Every payment that exists today was the whole price of its visit: deposits did not exist, so the
-- amount asked for and the price were the same number. Leaving the default would claim that every past
-- booking cost nothing and that its customer therefore overpaid.
UPDATE "Payment" SET "totalDiram" = "amountDiram";

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "depositAmountDiram" INTEGER,
ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "prepaymentMode" "PrepaymentMode";
