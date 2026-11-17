-- Fase 3: lote ligado a la compra (proveedor, costo, cantidad inicial) e
-- historial de movimientos por lote.

-- CreateEnum
CREATE TYPE "BatchMovementType" AS ENUM ('RECEIVED', 'MANUAL', 'SALE', 'SALE_VOID', 'SUPPLIER_RETURN', 'SUPPLIER_RETURN_VOID', 'PURCHASE_VOID', 'RESOLVED', 'RECONCILE', 'EDIT');

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "initial_quantity" DECIMAL(10,3),
ADD COLUMN     "purchase_order_id" TEXT,
ADD COLUMN     "supplier_id" TEXT,
ADD COLUMN     "unit_cost" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "batch_movements" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "type" "BatchMovementType" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "quantity_after" DECIMAL(10,3) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_movements_batch_id_idx" ON "batch_movements"("batch_id");

-- CreateIndex
CREATE INDEX "batch_movements_reference_type_reference_id_idx" ON "batch_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "batches_purchase_order_id_idx" ON "batches"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_movements" ADD CONSTRAINT "batch_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Datos ──────────────────────────────────────────────────────────────────

-- Lotes antiguos creados al recibir una compra: se ligan a la entrada de
-- kardex del mismo producto registrada en los mismos segundos.
UPDATE "batches" b SET
  "purchase_order_id" = x.reference_id,
  "unit_cost" = x.unit_cost,
  "initial_quantity" = x.quantity
FROM (
  SELECT b2.id, m.reference_id, m.unit_cost, m.quantity
  FROM "batches" b2
  JOIN LATERAL (
    SELECT im.reference_id, im.unit_cost, im.quantity
    FROM "inventory_movements" im
    WHERE im.product_id = b2.product_id
      AND im.type = 'PURCHASE_IN' AND im.reference_type = 'PURCHASE'
      AND ABS(EXTRACT(EPOCH FROM (im.created_at - b2.created_at))) < 10
    ORDER BY ABS(EXTRACT(EPOCH FROM (im.created_at - b2.created_at)))
    LIMIT 1
  ) m ON true
) x
WHERE b.id = x.id
  AND EXISTS (SELECT 1 FROM "purchase_orders" po WHERE po.id = x.reference_id);

UPDATE "batches" b SET "supplier_id" = po.supplier_id
FROM "purchase_orders" po WHERE b.purchase_order_id = po.id;

-- Sin dato de entrada: se toma lo que tienen hoy como punto de partida.
UPDATE "batches" SET "initial_quantity" = "quantity" WHERE "initial_quantity" IS NULL;
