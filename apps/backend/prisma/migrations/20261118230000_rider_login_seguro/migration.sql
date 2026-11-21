-- Ingreso seguro de repartidores: celular autorizado, código de activación,
-- PIN de 6 dígitos, bloqueo por intentos y registro de intentos. Solo agrega.
-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "pin_length" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "rider_devices" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "rider_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_activation_codes" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_login_attempts" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_devices_secret_hash_key" ON "rider_devices"("secret_hash");

-- CreateIndex
CREATE INDEX "rider_devices_rider_id_idx" ON "rider_devices"("rider_id");

-- CreateIndex
CREATE INDEX "rider_activation_codes_rider_id_idx" ON "rider_activation_codes"("rider_id");

-- CreateIndex
CREATE INDEX "rider_login_attempts_rider_id_created_at_idx" ON "rider_login_attempts"("rider_id", "created_at");

-- AddForeignKey
ALTER TABLE "rider_devices" ADD CONSTRAINT "rider_devices_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_activation_codes" ADD CONSTRAINT "rider_activation_codes_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_login_attempts" ADD CONSTRAINT "rider_login_attempts_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

