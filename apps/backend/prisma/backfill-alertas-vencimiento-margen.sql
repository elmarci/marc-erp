-- Datos iniciales para: vencimiento obligatorio, alerta de margen bajo y
-- préstamos por cliente. Es idempotente (se puede correr varias veces).
-- Se aplica después de `prisma db push` con la tabla/columnas nuevas.

-- 1) Categorías con vencimiento obligatorio (y sus subcategorías heredan la regla).
UPDATE categories SET requires_expiry = true
WHERE requires_expiry = false
  AND (lower(name) LIKE '%lácteo%' OR lower(name) LIKE '%lacteo%'
    OR lower(name) LIKE '%panader%'
    OR lower(name) LIKE '%carne%' OR lower(name) LIKE '%embutid%');

-- 2) Categorías de precio volátil.
UPDATE categories SET volatile_pricing = true
WHERE volatile_pricing = false
  AND (lower(name) LIKE '%fruta%' OR lower(name) LIKE '%verdura%');

-- 3) Productos de esas categorías (o de sus subcategorías) pasan a controlar vencimiento.
UPDATE products p SET track_expiry = true
WHERE p.track_expiry = false AND p.deleted_at IS NULL
  AND p.category_id IN (
    SELECT c.id FROM categories c
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE c.requires_expiry = true OR parent.requires_expiry = true
  );

-- 4) Último costo de compra por producto, tomado del kardex (compras sin anular,
--    sin contar bonificaciones que entran a costo 0).
UPDATE products p
SET last_purchase_cost = m.unit_cost, last_purchase_at = m.created_at
FROM (
  SELECT DISTINCT ON (im.product_id) im.product_id, im.unit_cost, im.created_at
  FROM inventory_movements im
  WHERE im.type = 'PURCHASE_IN' AND im.unit_cost > 0
    AND NOT EXISTS (
      SELECT 1 FROM inventory_movements v
      WHERE v.product_id = im.product_id AND v.type = 'PURCHASE_VOID' AND v.reference_id = im.reference_id
    )
  ORDER BY im.product_id, im.created_at DESC
) m
WHERE m.product_id = p.id AND p.last_purchase_cost IS NULL;

-- 5) Préstamos antiguos: se vinculan solos al cliente cuando el nombre coincide
--    exactamente con UN solo cliente registrado; el resto queda sin vincular
--    para que se haga a mano desde Caja → Préstamos.
UPDATE loans l SET customer_id = c.id
FROM (
  SELECT lower(trim(coalesce(business_name, first_name || ' ' || coalesce(last_name, '')))) AS full_name, min(id) AS id, count(*) AS n
  FROM customers WHERE deleted_at IS NULL
  GROUP BY 1
) c
WHERE l.customer_id IS NULL AND c.n = 1 AND lower(trim(l.borrower_name)) = c.full_name;
