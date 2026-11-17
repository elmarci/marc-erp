import { describe, expect, it } from 'vitest';
import {
  attendanceDiscounts, computeTotals, employerHealthFor, fullMonthsBetween, periodBase,
  periodFamilyAllowance, suggestBenefit, vacationDaysEarned, type CalcEmployee,
} from './payroll-calc';

const informal: CalcEmployee = {
  employmentType: 'INFORMAL', laborRegime: null, payFrequency: 'WEEKLY', salary: 350,
  pensionSystem: 'NONE', afpRate: null, familyAllowance: false,
};
const general: CalcEmployee = {
  employmentType: 'PLANILLA', laborRegime: 'GENERAL', payFrequency: 'MONTHLY', salary: 1500,
  pensionSystem: 'ONP', afpRate: null, familyAllowance: true,
};
const micro: CalcEmployee = { ...general, laborRegime: 'MICRO', pensionSystem: 'AFP', afpRate: 11.37, familyAllowance: false };

describe('pago regular', () => {
  it('informal: sueldo de la semana menos adelantos, sin descuentos de ley', () => {
    expect(periodBase(informal)).toBe(350);
    const t = computeTotals(informal, {
      kind: 'REGULAR', baseAmount: 350, familyAllowance: 0, bonus: 20, absenceDiscount: 50, lateDiscount: 0,
      advancesDeducted: 100, otherDiscount: 0,
    });
    expect(t).toEqual({ grossAmount: 320, pensionRate: 0, pensionDiscount: 0, netAmount: 220, employerHealth: 0 });
  });

  it('régimen general: asignación familiar, ONP 13% y EsSalud 9%', () => {
    const fam = periodFamilyAllowance(general);
    expect(fam).toBe(113);
    const t = computeTotals(general, {
      kind: 'REGULAR', baseAmount: periodBase(general), familyAllowance: fam, bonus: 0, absenceDiscount: 0,
      lateDiscount: 0, advancesDeducted: 200, otherDiscount: 0,
    });
    expect(t.grossAmount).toBe(1613);
    expect(t.pensionDiscount).toBe(209.69);
    expect(t.netAmount).toBe(1203.31);
    expect(t.employerHealth).toBe(145.17);
  });

  it('microempresa quincenal: AFP y SIS', () => {
    const e = { ...micro, payFrequency: 'BIWEEKLY' as const };
    expect(periodBase(e)).toBe(750);
    const t = computeTotals(e, {
      kind: 'REGULAR', baseAmount: 750, familyAllowance: 0, bonus: 0, absenceDiscount: 0, lateDiscount: 0,
      advancesDeducted: 0, otherDiscount: 0,
    });
    expect(t.pensionDiscount).toBe(85.28);
    expect(t.employerHealth).toBe(7.5);
  });

  it('EsSalud usa la RMV como mínimo', () => {
    expect(employerHealthFor({ ...general, salary: 600 }, 'REGULAR', 600)).toBe(101.7);
  });
});

describe('asistencia', () => {
  it('descuenta faltas por día y tardanzas por minuto', () => {
    const d = attendanceDiscounts({
      base: 360, scheduledDays: 6, absences: 1, lateMinutes: 48, minutesPerDay: 480,
      discountAbsences: true, discountLateness: true,
    });
    expect(d).toEqual({ dayValue: 60, absenceDiscount: 60, lateDiscount: 6 });
  });
});

describe('beneficios', () => {
  it('meses completos', () => {
    expect(fullMonthsBetween('2026-01-01', '2026-07-01')).toBe(6);
    expect(fullMonthsBetween('2026-03-15', '2026-07-01')).toBe(3);
  });
  it('gratificación de diciembre con 9%', () => {
    const g = suggestBenefit(general, 'GRATIFICACION', { startDate: '2025-01-10', today: '2026-12-10' });
    expect(g.months).toBe(6);
    expect(g.baseAmount).toBe(1613);
    expect(g.bonus).toBe(145.17);
  });
  it('microempresa no tiene gratificación ni CTS', () => {
    expect(suggestBenefit(micro, 'CTS', { startDate: '2025-01-01', today: '2026-11-10' }).baseAmount).toBe(0);
  });
  it('CTS de noviembre', () => {
    const c = suggestBenefit(general, 'CTS', { startDate: '2025-01-01', today: '2026-11-10' });
    // noviembre deposita mayo-octubre completo: (1613 + 1613/6) / 12 × 6
    expect(c.months).toBe(6);
    expect(c.baseAmount).toBe(940.92);
  });
  it('vacaciones ganadas', () => {
    expect(vacationDaysEarned('MICRO', '2026-01-01', '2026-12-31')).toBe(15);
    expect(vacationDaysEarned('GENERAL', '2026-01-01', '2026-06-30')).toBe(15);
  });
});

import { nextPeriod, nextPeriodStart } from './payroll-calc';

describe('siguiente periodo', () => {
  it('sin pagos: el periodo que acaba de terminar', () => {
    expect(nextPeriodStart('BIWEEKLY', '2026-10-01', null, '2026-11-17')).toBe('2026-11-01');
    expect(nextPeriodStart('WEEKLY', '2026-10-01', null, '2026-11-17')).toBe('2026-11-09');
    expect(nextPeriodStart('MONTHLY', '2026-10-01', null, '2026-11-17')).toBe('2026-11-01');
  });
  it('no antes del ingreso', () => {
    expect(nextPeriodStart('WEEKLY', '2026-11-12', null, '2026-11-17')).toBe('2026-11-12');
    expect(nextPeriodStart('BIWEEKLY', '2026-11-17', null, '2026-11-17')).toBe('2026-11-17');
  });
  it('con pagos: el día siguiente', () => {
    expect(nextPeriodStart('WEEKLY', '2026-10-01', '2026-11-15', '2026-11-17')).toBe('2026-11-16');
    expect(nextPeriod('BIWEEKLY', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-30' });
  });
});
