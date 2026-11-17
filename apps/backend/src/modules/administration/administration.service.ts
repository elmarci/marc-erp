import { prisma } from '../../database/client';
import { getSettingValues } from '../../utils/settings';
import { nowInLima, parseLimaDate } from '../../utils/timezone';
import { NET_SALE_TOTAL, NET_ITEM_QTY } from '../reports/reports.service';
import { ADJUSTMENT_REASONS, LOSS_REASON_CODES, adjustmentReasonLabel } from '../inventory/adjustment-reasons';
import { buildIncomeTotals, changePercent, limitStatus, percentOf, previousRange } from './finance.util';

interface DateRange { from: Date; to: Date }

export const NRUS_DEFAULTS = { monthlyLimit: 8000, annualLimit: 96000, alertPercent: 80 };

const pad = (n: number) => String(n).padStart(2, '0');
const num = (v: unknown) => Number(v ?? 0);

export class AdministrationService {
  /* ── Control del tope del régimen (NRUS) ─────────────────────────────────── */

  // Ventas y compras de cada mes del año contra los topes del régimen. Ventas:
  // lo vendido menos devoluciones (sin la comisión de tarjeta, que no es venta).
  // Compras: lo recibido y no anulado, con su IGV, por fecha de recepción.
  async getRegimeControl(year?: number) {
    const now = nowInLima();
    const y = year ?? now.year;
    const settings = await getSettingValues(['tax_regime', 'nrus_monthly_limit', 'nrus_annual_limit', 'nrus_alert_percent']);
    const monthlyLimit = Number(settings.nrus_monthly_limit) || NRUS_DEFAULTS.monthlyLimit;
    const annualLimit = Number(settings.nrus_annual_limit) || NRUS_DEFAULTS.annualLimit;
    const alertPercent = Number(settings.nrus_alert_percent) || NRUS_DEFAULTS.alertPercent;

    const from = parseLimaDate(`${y}-01-01`, false);
    const to = parseLimaDate(`${y}-12-31`, true);

    const [salesRows, purchaseRows] = await Promise.all([
      prisma.$queryRaw<{ month: string; total: number; tickets: number }[]>`
        SELECT TO_CHAR(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM') as month,
               SUM(${NET_SALE_TOTAL})::float as total, COUNT(*)::int as tickets
        FROM sales s
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED')
          AND s.created_at BETWEEN ${from} AND ${to}
        GROUP BY 1
      `,
      prisma.$queryRaw<{ month: string; total: number; orders: number }[]>`
        SELECT TO_CHAR(COALESCE(po.received_date, po.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM') as month,
               SUM(po.total_amount)::float as total, COUNT(*)::int as orders
        FROM purchase_orders po
        WHERE po.voided_at IS NULL AND po.status IN ('RECEIVED', 'PARTIALLY_RECEIVED')
          AND COALESCE(po.received_date, po.created_at) BETWEEN ${from} AND ${to}
        GROUP BY 1
      `,
    ]);
    const salesBy = new Map(salesRows.map((r) => [r.month, r]));
    const purchasesBy = new Map(purchaseRows.map((r) => [r.month, r]));

    const lastMonth = y === now.year ? now.month : 12;
    const months = [];
    for (let m = 1; m <= lastMonth; m++) {
      const key = `${y}-${pad(m)}`;
      const sales = num(salesBy.get(key)?.total);
      const purchases = num(purchasesBy.get(key)?.total);
      months.push({
        month: key,
        isCurrent: y === now.year && m === now.month,
        sales, salesTickets: num(salesBy.get(key)?.tickets),
        salesPercent: percentOf(sales, monthlyLimit), salesStatus: limitStatus(sales, monthlyLimit, alertPercent),
        purchases, purchaseOrders: num(purchasesBy.get(key)?.orders),
        purchasesPercent: percentOf(purchases, monthlyLimit), purchasesStatus: limitStatus(purchases, monthlyLimit, alertPercent),
      });
    }

    const yearSales = months.reduce((s, m) => s + m.sales, 0);
    const yearPurchases = months.reduce((s, m) => s + m.purchases, 0);
    const current = months.find((m) => m.isCurrent) ?? months[months.length - 1] ?? null;
    const monthsOver = months.filter((m) => m.salesStatus === 'OVER' || m.purchasesStatus === 'OVER').map((m) => m.month);

    return {
      regime: settings.tax_regime || 'NRUS',
      year: y,
      limits: { monthly: monthlyLimit, annual: annualLimit, alertPercent },
      current,
      months,
      yearTotals: {
        sales: yearSales, salesPercent: percentOf(yearSales, annualLimit), salesStatus: limitStatus(yearSales, annualLimit, alertPercent),
        purchases: yearPurchases, purchasesPercent: percentOf(yearPurchases, annualLimit), purchasesStatus: limitStatus(yearPurchases, annualLimit, alertPercent),
      },
      monthsOver,
    };
  }

  /* ── Estado de resultados ────────────────────────────────────────────────── */

  private async periodFigures(range: DateRange) {
    const [sales, cost, expenseRows, lossRows, otherAdjRows, autoAdj, delivery, riders] = await Promise.all([
      prisma.$queryRaw<{ gross: number; net: number; tickets: number; commission: number }[]>`
        SELECT SUM(s.total_amount)::float as gross, SUM(${NET_SALE_TOTAL})::float as net,
               COUNT(*)::int as tickets, SUM(s.commission_amount)::float as commission
        FROM sales s
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `,
      prisma.$queryRaw<{ cost: number; items_without_cost: number }[]>`
        SELECT SUM(${NET_ITEM_QTY} * COALESCE(si.cost_price, 0))::float as cost,
               COUNT(*) FILTER (WHERE si.cost_price IS NULL OR si.cost_price = 0)::int as items_without_cost
        FROM sale_items si JOIN sales s ON si.sale_id = s.id
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `,
      prisma.expense.groupBy({
        by: ['category'],
        where: { voidedAt: null, expenseDate: { gte: range.from, lte: range.to } },
        _sum: { amount: true }, _count: true,
      }),
      // Mermas: salidas por ajuste con un motivo que es pérdida real.
      prisma.$queryRaw<{ code: string; value: number; n: number }[]>`
        SELECT reason_code as code, SUM(ABS(quantity) * COALESCE(unit_cost, 0))::float as value, COUNT(*)::int as n
        FROM inventory_movements
        WHERE type IN ('ADJUSTMENT_OUT', 'LOSS', 'EXPIRY') AND reason_code = ANY(${LOSS_REASON_CODES as string[]})
          AND created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY 1
      `,
      // Correcciones de registro (conteo, errores, sin clasificar): se muestran
      // aparte y no entran al resultado, porque muchas son mercadería que sí
      // existía pero se registró mal, no una pérdida ni una ganancia.
      prisma.$queryRaw<{ code: string | null; type: string; value: number; n: number }[]>`
        SELECT reason_code as code, type::text as type, SUM(ABS(quantity) * COALESCE(unit_cost, 0))::float as value, COUNT(*)::int as n
        FROM inventory_movements
        WHERE type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
          AND (reason_code IS NULL OR NOT (reason_code = ANY(${LOSS_REASON_CODES as string[]})))
          AND COALESCE(reference_type, '') <> 'SALE_AUTO_ADJUST'
          AND created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY 1, 2
      `,
      prisma.$queryRaw<{ value: number; n: number }[]>`
        SELECT SUM(ABS(quantity) * COALESCE(unit_cost, 0))::float as value, COUNT(*)::int as n
        FROM inventory_movements
        WHERE reference_type = 'SALE_AUTO_ADJUST' AND created_at BETWEEN ${range.from} AND ${range.to}
      `,
      prisma.storeOrder.aggregate({
        where: { saleId: { not: null }, status: { not: 'CANCELLED' }, createdAt: { gte: range.from, lte: range.to } },
        _sum: { deliveryCost: true },
      }),
      prisma.liquidacion.aggregate({
        where: { estado: 'PAGADA', pagadoAt: { gte: range.from, lte: range.to } },
        _sum: { monto: true },
      }),
    ]);

    const grossSales = num(sales[0]?.gross);
    const returns = grossSales - num(sales[0]?.net);
    const expenses = expenseRows.reduce((s, r) => s + num(r._sum.amount), 0);
    const inventoryLosses = lossRows.reduce((s, r) => s + num(r.value), 0);
    const figures = {
      grossSales, returns, cogs: num(cost[0]?.cost), expenses, inventoryLosses,
      deliveryIncome: num(delivery._sum.deliveryCost), riderPayments: num(riders._sum.monto),
    };

    return {
      ...figures,
      ...buildIncomeTotals(figures),
      tickets: num(sales[0]?.tickets),
      itemsWithoutCost: num(cost[0]?.items_without_cost),
      cardCommissionCollected: num(sales[0]?.commission),
      expensesByCategory: expenseRows
        .map((r) => ({ category: r.category as string, total: num(r._sum.amount), count: r._count }))
        .sort((a, b) => b.total - a.total),
      lossesByReason: lossRows
        .map((r) => ({ code: r.code, label: adjustmentReasonLabel(r.code), total: num(r.value), count: r.n }))
        .sort((a, b) => b.total - a.total),
      otherAdjustments: otherAdjRows.map((r) => ({
        code: r.code, label: adjustmentReasonLabel(r.code),
        direction: r.type === 'ADJUSTMENT_IN' ? 'IN' as const : 'OUT' as const,
        total: num(r.value), count: r.n,
      })),
      autoAdjustments: { total: num(autoAdj[0]?.value), count: num(autoAdj[0]?.n) },
    };
  }

  async getIncomeStatement(range: DateRange) {
    const prevRange = previousRange(range.from, range.to);
    const [current, previous] = await Promise.all([this.periodFigures(range), this.periodFigures(prevRange)]);

    const keys = ['grossSales', 'returns', 'netSales', 'cogs', 'grossProfit', 'expenses', 'inventoryLosses', 'deliveryNet', 'netProfit'] as const;
    const change = Object.fromEntries(keys.map((k) => [k, changePercent(current[k], previous[k])])) as Record<(typeof keys)[number], number | null>;

    // Avisos sobre qué tan confiable es el número — un resultado alto por
    // falta de datos no es utilidad real.
    const warnings: string[] = [];
    if (current.netSales > 0 && current.expenses < current.netSales * 0.03) {
      warnings.push('Casi no hay gastos registrados en este período (alquiler, luz, sueldos). La utilidad real es menor a la que se muestra.');
    }
    if (current.itemsWithoutCost > 0) {
      warnings.push(`${current.itemsWithoutCost} líneas vendidas no tienen costo registrado: su ganancia aparece como si costaran S/ 0.`);
    }
    if (current.autoAdjustments.count > 0) {
      warnings.push(`${current.autoAdjustments.count} ventas se hicieron sin stock en el sistema: hay compras que no se están registrando.`);
    }
    const unclassified = current.otherAdjustments.filter((a) => a.code === null && a.direction === 'OUT');
    if (unclassified.length > 0) {
      warnings.push('Hay bajas de inventario sin motivo clasificado: no se cuentan como merma hasta que se clasifiquen.');
    }

    return { range, previousRange: prevRange, current, previous, change, warnings };
  }

  adjustmentReasons() {
    return Object.entries(ADJUSTMENT_REASONS).map(([code, r]) => ({ code, label: r.label, loss: r.loss }));
  }
}

export const administrationService = new AdministrationService();
