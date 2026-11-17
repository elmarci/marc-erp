-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE 'TAXES';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" TEXT;

-- AlterTable
ALTER TABLE "inventory_adjustments" ADD COLUMN     "reason_code" TEXT;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "reason_code" TEXT;

-- CreateIndex
CREATE INDEX "inventory_movements_reason_code_idx" ON "inventory_movements"("reason_code");


-- Clasifica los ajustes anteriores a partir del motivo escrito a mano, para
-- que el historial ya entre al reporte de mermas. Lo que no calza queda sin
-- clasificar (NULL) y se puede revisar a mano.
UPDATE "inventory_adjustments" SET "reason_code" = CASE
  WHEN "reason" ILIKE '%merma%' OR "reason" ILIKE '%vencid%' OR "reason" ILIKE '%vencim%' OR "reason" ILIKE '%hongue%' THEN 'EXPIRED'
  WHEN "reason" ILIKE '%conteo%' OR "reason" ILIKE '%fisico%' OR "reason" ILIKE '%físico%' OR "reason" ILIKE '%stock real%' OR "reason" ILIKE '%conte f%' THEN 'COUNT'
  WHEN "reason" ILIKE '%registr%' OR "reason" ILIKE '%error%' THEN 'ENTRY_ERROR'
  ELSE NULL END
WHERE "reason_code" IS NULL;

UPDATE "inventory_movements" m SET "reason_code" = a."reason_code"
FROM "inventory_adjustments" a
WHERE m."reference_type" = 'ADJUSTMENT' AND m."reference_id" = a."id"
  AND m."reason_code" IS NULL AND a."reason_code" IS NOT NULL;
