-- Fase 5: compras "afectas a IGV" con el IGV DENTRO del costo y percepción aparte.
-- Las compras antiguas quedan igual (igv_included = false: su IGV se sumó encima).
ALTER TABLE "purchase_orders" ADD COLUMN "igv_included" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "purchase_orders" ADD COLUMN "perception_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
