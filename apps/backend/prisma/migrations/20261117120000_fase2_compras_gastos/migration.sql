-- Fase 2: comprobantes de compra y gasto, categorías de gasto editables,
-- gastos por pagar y por mes, devoluciones al proveedor, flujo simple de OC.

-- CreateEnum
CREATE TYPE "SupplierDocType" AS ENUM ('FACTURA', 'BOLETA', 'TICKET', 'NOTA_VENTA', 'RECIBO_SERVICIO', 'RECIBO_HONORARIOS', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierReturnSettlement" AS ENUM ('CREDIT_NOTE', 'REFUND', 'REPLACEMENT');

-- AlterEnum (Postgres 12+ permite varios ADD VALUE en la misma migración)
ALTER TYPE "MovementType" ADD VALUE 'SUPPLIER_RETURN';
ALTER TYPE "MovementType" ADD VALUE 'SUPPLIER_RETURN_VOID';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "accrual_date" TIMESTAMP(3),
ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "doc_number" TEXT,
ADD COLUMN     "doc_series" TEXT,
ADD COLUMN     "doc_type" "SupplierDocType",
ADD COLUMN     "is_pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payee_name" TEXT,
ADD COLUMN     "payee_tax_id" TEXT,
ADD COLUMN     "period" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "credited_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "doc_issue_date" TIMESTAMP(3),
ADD COLUMN     "doc_number" TEXT,
ADD COLUMN     "doc_series" TEXT,
ADD COLUMN     "doc_type" "SupplierDocType";

-- AlterTable
ALTER TABLE "recurring_expense_templates" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "payee_name" TEXT;

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "settlement" "SupplierReturnSettlement" NOT NULL,
    "reason_code" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "refund_account" "TreasuryAccount",
    "doc_series" TEXT,
    "doc_number" TEXT,
    "doc_issue_date" TIMESTAMP(3),
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_cost" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" "ExpenseCategory" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_return_number_key" ON "supplier_returns"("return_number");

-- CreateIndex
CREATE INDEX "supplier_returns_supplier_id_idx" ON "supplier_returns"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_returns_purchase_order_id_idx" ON "supplier_returns"("purchase_order_id");

-- CreateIndex
CREATE INDEX "supplier_returns_created_at_idx" ON "supplier_returns"("created_at");

-- CreateIndex
CREATE INDEX "supplier_return_items_return_id_idx" ON "supplier_return_items"("return_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_accrual_date_idx" ON "expenses"("accrual_date");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_doc_series_doc_number_idx" ON "purchase_orders"("supplier_id", "doc_series", "doc_number");

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Datos ──────────────────────────────────────────────────────────────────

-- Categorías iniciales: una por cada grupo que ya existía.
INSERT INTO "expense_categories" ("id", "name", "group", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'Personal', 'PERSONNEL', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Bolsas', 'BAGS', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Transporte', 'TRANSPORT', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Sistema', 'SYSTEM', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Agua', 'WATER', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Luz', 'ELECTRICITY', 6, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Alquiler', 'RENT', 7, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Impuestos (cuota SUNAT)', 'TAXES', 8, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Otros', 'OTHER', 9, CURRENT_TIMESTAMP);

UPDATE "expenses" e SET "category_id" = c."id"
  FROM "expense_categories" c WHERE c."group" = e."category";
UPDATE "recurring_expense_templates" t SET "category_id" = c."id"
  FROM "expense_categories" c WHERE c."group" = t."category";

-- Gastos antiguos: corresponden al mes en que se pagaron.
UPDATE "expenses" SET
  "period" = TO_CHAR("expense_date" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM'),
  "accrual_date" = "expense_date";
ALTER TABLE "expenses" ALTER COLUMN "period" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "accrual_date" SET NOT NULL;

-- Compras antiguas: separa serie y número cuando el texto lo permite
-- ("F001-123", "B002 45", "F001-00000123"). El resto queda solo como texto.
UPDATE "purchase_orders" SET
  "doc_series" = UPPER((regexp_match(TRIM("supplier_invoice"), '^([A-Za-z][A-Za-z0-9]{3})\s*[-\s]\s*0*([0-9]{1,8})$'))[1]),
  "doc_number" = (regexp_match(TRIM("supplier_invoice"), '^([A-Za-z][A-Za-z0-9]{3})\s*[-\s]\s*0*([0-9]{1,8})$'))[2],
  "doc_type" = CASE UPPER(LEFT(TRIM("supplier_invoice"), 1))
    WHEN 'F' THEN 'FACTURA'::"SupplierDocType"
    WHEN 'B' THEN 'BOLETA'::"SupplierDocType"
    ELSE NULL END
WHERE "supplier_invoice" ~ '^\s*[A-Za-z][A-Za-z0-9]{3}\s*[-\s]\s*0*[0-9]{1,8}\s*$';

-- Flujo simple: ya no hay aprobación; lo pedido queda como "Pedida".
UPDATE "purchase_orders" SET "status" = 'SENT' WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED');
