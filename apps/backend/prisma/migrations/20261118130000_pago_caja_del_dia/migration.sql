-- Pagos de compras en efectivo: guardar de qué caja del día salió el dinero.
-- Si queda NULL y el método es CASH, el efectivo salió de Caja General.
-- AlterTable
ALTER TABLE "payer_repayments" ADD COLUMN     "cash_session_id" TEXT;

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "cash_session_id" TEXT;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payer_repayments" ADD CONSTRAINT "payer_repayments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Pagos antiguos: se completan con el retiro de caja que se hizo en el mismo momento.
UPDATE "supplier_payments" sp SET "cash_session_id" = m.cash_session_id
FROM (
  SELECT DISTINCT ON (p.id) p.id, cm.cash_session_id
  FROM "supplier_payments" p
  JOIN "cash_movements" cm ON cm.type = 'WITHDRAWAL'
   AND abs(extract(epoch FROM cm.created_at - p.paid_at)) < 120
   AND ((p.batch_id IS NULL AND cm.reference_type = 'PURCHASE' AND cm.reference_id = p.purchase_order_id AND cm.amount = p.amount)
     OR (p.batch_id IS NOT NULL AND cm.reference_type = 'PURCHASE_PAYMENT_BATCH' AND cm.reference_id = p.batch_id))
  WHERE p.method = 'CASH'
  ORDER BY p.id, abs(extract(epoch FROM cm.created_at - p.paid_at))
) m
WHERE sp.id = m.id;

UPDATE "payer_repayments" pr SET "cash_session_id" = m.cash_session_id
FROM (
  SELECT DISTINCT ON (p.id) p.id, cm.cash_session_id
  FROM "payer_repayments" p
  JOIN "cash_movements" cm ON cm.type = 'WITHDRAWAL'
   AND cm.reference_type = 'PAYER_REPAYMENT_BATCH' AND cm.reference_id = p.batch_id
  WHERE p.method = 'CASH'
  ORDER BY p.id, abs(extract(epoch FROM cm.created_at - p.paid_at))
) m
WHERE pr.id = m.id;
