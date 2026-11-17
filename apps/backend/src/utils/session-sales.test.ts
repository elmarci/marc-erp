import { describe, expect, it } from 'vitest';
import { netSalesByMethod } from './session-sales';

describe('netSalesByMethod', () => {
  it('ignora anuladas y resta devoluciones en su medio', () => {
    const r = netSalesByMethod([
      { status: 'COMPLETED', payments: [{ method: 'CASH', amount: 10 }, { method: 'YAPE', amount: 5 }] },
      { status: 'CANCELLED', payments: [{ method: 'CASH', amount: 99 }] },
      { status: 'PARTIALLY_RETURNED', payments: [{ method: 'CASH', amount: 20 }], returns: [{ totalAmount: 4.5, refundMethod: 'CASH' }] },
      { status: 'RETURNED', payments: [{ method: 'YAPE', amount: 8 }], returns: [{ totalAmount: 8, refundMethod: 'YAPE' }] },
    ]);
    expect(r.byMethod).toEqual({ CASH: 25.5, YAPE: 5 });
    expect(r.refundsByMethod).toEqual({ CASH: 4.5, YAPE: 8 });
  });
});
