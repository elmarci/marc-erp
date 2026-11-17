-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('INFORMAL', 'PLANILLA');

-- CreateEnum
CREATE TYPE "LaborRegime" AS ENUM ('MICRO', 'GENERAL');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PensionSystem" AS ENUM ('NONE', 'ONP', 'AFP');

-- CreateEnum
CREATE TYPE "PayrollKind" AS ENUM ('REGULAR', 'GRATIFICACION', 'CTS', 'VACACIONES', 'LIQUIDACION');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "doc_number" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'INFORMAL',
    "labor_regime" "LaborRegime",
    "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'WEEKLY',
    "salary" DECIMAL(10,2) NOT NULL,
    "pension_system" "PensionSystem" NOT NULL DEFAULT 'NONE',
    "afp_name" TEXT,
    "afp_rate" DECIMAL(5,2),
    "family_allowance" BOOLEAN NOT NULL DEFAULT false,
    "discount_absences" BOOLEAN NOT NULL DEFAULT true,
    "discount_lateness" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_advances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "expense_id" TEXT,
    "payment_id" TEXT,
    "user_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payments" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "kind" "PayrollKind" NOT NULL DEFAULT 'REGULAR',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "labor_regime" "LaborRegime",
    "days_scheduled" INTEGER NOT NULL DEFAULT 0,
    "days_worked" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(10,2) NOT NULL,
    "family_allowance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "absence_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "late_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(10,2) NOT NULL,
    "pension_system" "PensionSystem" NOT NULL DEFAULT 'NONE',
    "pension_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pension_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "advances_deducted" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_discount_note" TEXT,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "employer_health" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expense_id" TEXT,
    "health_expense_id" TEXT,
    "pension_expense_id" TEXT,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_doc_number_key" ON "employees"("doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_is_active_idx" ON "employees"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "employee_advances_expense_id_key" ON "employee_advances"("expense_id");

-- CreateIndex
CREATE INDEX "employee_advances_employee_id_idx" ON "employee_advances"("employee_id");

-- CreateIndex
CREATE INDEX "employee_advances_payment_id_idx" ON "employee_advances"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_number_key" ON "payroll_payments"("number");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_expense_id_key" ON "payroll_payments"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_health_expense_id_key" ON "payroll_payments"("health_expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_pension_expense_id_key" ON "payroll_payments"("pension_expense_id");

-- CreateIndex
CREATE INDEX "payroll_payments_employee_id_period_start_idx" ON "payroll_payments"("employee_id", "period_start");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payroll_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

