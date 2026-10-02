-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'DEPOSIT_RETURN';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "settledAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "isAuthorization" BOOLEAN NOT NULL DEFAULT false;
