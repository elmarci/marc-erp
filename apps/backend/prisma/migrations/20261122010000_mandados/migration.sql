-- CreateTable
CREATE TABLE "mandados" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "store_customer_id" TEXT,
    "cliente_nombre" TEXT NOT NULL,
    "cliente_telefono" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "con_compra" BOOLEAN NOT NULL DEFAULT true,
    "recojo_nombre" TEXT,
    "recojo_direccion" TEXT,
    "recojo_lat" DOUBLE PRECISION,
    "recojo_lng" DOUBLE PRECISION,
    "entrega_direccion" TEXT NOT NULL,
    "entrega_referencia" TEXT,
    "entrega_lat" DOUBLE PRECISION,
    "entrega_lng" DOUBLE PRECISION,
    "entrega_maps_link" TEXT,
    "programado_para" TIMESTAMP(3),
    "nota" TEXT,
    "oferta_cliente" DECIMAL(10,2) NOT NULL,
    "oferta_sugerida" DECIMAL(10,2) NOT NULL,
    "tarifa_acordada" DECIMAL(10,2),
    "presupuesto_max" DECIMAL(10,2),
    "total_compra" DECIMAL(10,2),
    "boleta_foto" TEXT,
    "metodo_pago" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "rider_id" TEXT,
    "acordado_at" TIMESTAMP(3),
    "cotizado_at" TIMESTAMP(3),
    "comprado_at" TIMESTAMP(3),
    "entregado_at" TIMESTAMP(3),
    "cancelado_at" TIMESTAMP(3),
    "motivo_cancelacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mandados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandado_items" (
    "id" TEXT NOT NULL,
    "mandado_id" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'und',
    "precio_estimado" DECIMAL(10,2),
    "precio_real" DECIMAL(10,2),
    "no_habia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "mandado_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandado_ofertas" (
    "id" TEXT NOT NULL,
    "mandado_id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "eta_min" INTEGER NOT NULL,
    "mensaje" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mandado_ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mandados_codigo_key" ON "mandados"("codigo");

-- CreateIndex
CREATE INDEX "mandados_estado_idx" ON "mandados"("estado");

-- CreateIndex
CREATE INDEX "mandados_rider_id_idx" ON "mandados"("rider_id");

-- CreateIndex
CREATE INDEX "mandados_cliente_telefono_idx" ON "mandados"("cliente_telefono");

-- CreateIndex
CREATE INDEX "mandados_store_customer_id_idx" ON "mandados"("store_customer_id");

-- CreateIndex
CREATE INDEX "mandado_items_mandado_id_idx" ON "mandado_items"("mandado_id");

-- CreateIndex
CREATE INDEX "mandado_ofertas_mandado_id_idx" ON "mandado_ofertas"("mandado_id");

-- CreateIndex
CREATE UNIQUE INDEX "mandado_ofertas_mandado_id_rider_id_key" ON "mandado_ofertas"("mandado_id", "rider_id");

-- AddForeignKey
ALTER TABLE "mandados" ADD CONSTRAINT "mandados_store_customer_id_fkey" FOREIGN KEY ("store_customer_id") REFERENCES "store_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandados" ADD CONSTRAINT "mandados_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandado_items" ADD CONSTRAINT "mandado_items_mandado_id_fkey" FOREIGN KEY ("mandado_id") REFERENCES "mandados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandado_ofertas" ADD CONSTRAINT "mandado_ofertas_mandado_id_fkey" FOREIGN KEY ("mandado_id") REFERENCES "mandados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandado_ofertas" ADD CONSTRAINT "mandado_ofertas_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

