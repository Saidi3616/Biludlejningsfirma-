-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "idempotencyKey" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");

