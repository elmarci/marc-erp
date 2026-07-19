import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  discountAmount: number;
  discountPercent: number;
  subtotal: number;
  stock: number;
}

export interface CartPayment {
  method: string;
  amount: number;
  reference?: string;
  cardLast4?: string;
}

interface PosState {
  cashSessionId: string | null;
  cashRegisterId: string | null;
  items: CartItem[];
  payments: CartPayment[];
  customerId: string | null;
  customerName: string | null;
  documentType: string;
  globalDiscountAmount: number;
  globalDiscountPercent: number;
  couponCode: string | null;
  couponDiscountPercent: number;
  isCredit: boolean;
  notes: string;

  // Calculated
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  totalPaid: number;
  change: number;

  setCashSession: (sessionId: string, registerId: string) => void;
  addItem: (item: Omit<CartItem, 'subtotal'>) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateDiscount: (productId: string, discountAmount: number, discountPercent: number) => void;
  removeItem: (productId: string) => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setDocumentType: (type: string) => void;
  setGlobalDiscount: (amount: number, percent: number) => void;
  setCoupon: (code: string | null, percent: number) => void;
  setIsCredit: (isCredit: boolean) => void;
  setNotes: (notes: string) => void;
  addPayment: (payment: CartPayment) => void;
  removePayment: (index: number) => void;
  clearCart: () => void;
}

function calcItemSubtotal(item: Omit<CartItem, 'subtotal'>): number {
  const effectivePrice = item.unitPrice - item.discountAmount;
  return Math.max(0, effectivePrice * item.quantity);
}

function recalcTotals(
  items: CartItem[],
  globalDiscountAmount: number,
  globalDiscountPercent: number,
  payments: CartPayment[],
  couponDiscountPercent = 0,
) {
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const manualDiscount = globalDiscountAmount > 0
    ? globalDiscountAmount
    : (subtotal * globalDiscountPercent) / 100;
  const couponDiscount = (subtotal * couponDiscountPercent) / 100;
  const discountAmount = manualDiscount + couponDiscount;
  const discountedSubtotal = subtotal - discountAmount;
  // IGV incluido en el precio de venta (precio con IGV)
  const taxAmount = discountedSubtotal - discountedSubtotal / 1.18;
  const total = discountedSubtotal;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const change = Math.max(0, totalPaid - total);
  return { subtotal, discountAmount, taxAmount, total, totalPaid, change };
}

export const usePosStore = create<PosState>()((set, get) => ({
  cashSessionId: null,
  cashRegisterId: null,
  items: [],
  payments: [],
  customerId: null,
  customerName: null,
  documentType: 'TICKET',
  globalDiscountAmount: 0,
  globalDiscountPercent: 0,
  couponCode: null,
  couponDiscountPercent: 0,
  isCredit: false,
  notes: '',
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  total: 0,
  totalPaid: 0,
  change: 0,

  setCashSession: (sessionId, registerId) => {
    set({ cashSessionId: sessionId, cashRegisterId: registerId });
  },

  addItem: (newItem) => {
    const { items, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent } = get();
    const existing = items.find((i) => i.productId === newItem.productId);

    let updatedItems: CartItem[];
    if (existing) {
      const newQty = existing.quantity + newItem.quantity;
      if (newQty > existing.stock) return; // No exceder stock
      updatedItems = items.map((i) =>
        i.productId === newItem.productId
          ? { ...i, quantity: newQty, subtotal: calcItemSubtotal({ ...i, quantity: newQty }) }
          : i,
      );
    } else {
      const item: CartItem = { ...newItem, subtotal: calcItemSubtotal(newItem) };
      updatedItems = [...items, item];
    }

    set({ items: updatedItems, ...recalcTotals(updatedItems, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent) });
  },

  updateQuantity: (productId, quantity) => {
    const { items, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent } = get();
    if (quantity <= 0) {
      const updatedItems = items.filter((i) => i.productId !== productId);
      set({ items: updatedItems, ...recalcTotals(updatedItems, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent) });
      return;
    }
    const updatedItems = items.map((i) =>
      i.productId === productId
        ? { ...i, quantity, subtotal: calcItemSubtotal({ ...i, quantity }) }
        : i,
    );
    set({ items: updatedItems, ...recalcTotals(updatedItems, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent) });
  },

  updateDiscount: (productId, discountAmount, discountPercent) => {
    const { items, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent } = get();
    const updatedItems = items.map((i) => {
      if (i.productId !== productId) return i;
      const effDiscount = discountAmount > 0 ? discountAmount : (i.originalPrice * discountPercent) / 100;
      const unitPrice = Math.max(0, i.originalPrice - effDiscount);
      return {
        ...i,
        discountAmount: effDiscount,
        discountPercent,
        unitPrice,
        subtotal: calcItemSubtotal({ ...i, unitPrice, discountAmount: 0, discountPercent: 0 }),
      };
    });
    set({ items: updatedItems, ...recalcTotals(updatedItems, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent) });
  },

  removeItem: (productId) => {
    const { items, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent } = get();
    const updatedItems = items.filter((i) => i.productId !== productId);
    set({ items: updatedItems, ...recalcTotals(updatedItems, globalDiscountAmount, globalDiscountPercent, payments, couponDiscountPercent) });
  },

  setCustomer: (id, name) => {
    const { items, globalDiscountAmount, globalDiscountPercent, payments } = get();
    // El cupón aplicado queda validado para un cliente específico — si
    // cambia o se quita el cliente, ese cupón deja de ser válido para esta venta.
    set({ customerId: id, customerName: name, couponCode: null, couponDiscountPercent: 0,
      ...recalcTotals(items, globalDiscountAmount, globalDiscountPercent, payments, 0) });
  },

  setDocumentType: (type) => set({ documentType: type }),

  setGlobalDiscount: (amount, percent) => {
    const { items, payments, couponDiscountPercent } = get();
    set({ globalDiscountAmount: amount, globalDiscountPercent: percent, ...recalcTotals(items, amount, percent, payments, couponDiscountPercent) });
  },

  setCoupon: (code, percent) => {
    const { items, globalDiscountAmount, globalDiscountPercent, payments } = get();
    set({ couponCode: code, couponDiscountPercent: percent,
      ...recalcTotals(items, globalDiscountAmount, globalDiscountPercent, payments, percent) });
  },

  setIsCredit: (isCredit) => set({ isCredit }),

  setNotes: (notes) => set({ notes }),

  addPayment: (payment) => {
    const { payments, items, globalDiscountAmount, globalDiscountPercent, couponDiscountPercent } = get();
    const updated = [...payments, payment];
    set({ payments: updated, ...recalcTotals(items, globalDiscountAmount, globalDiscountPercent, updated, couponDiscountPercent) });
  },

  removePayment: (index) => {
    const { payments, items, globalDiscountAmount, globalDiscountPercent, couponDiscountPercent } = get();
    const updated = payments.filter((_, i) => i !== index);
    set({ payments: updated, ...recalcTotals(items, globalDiscountAmount, globalDiscountPercent, updated, couponDiscountPercent) });
  },

  clearCart: () => {
    set({
      items: [],
      payments: [],
      customerId: null,
      customerName: null,
      documentType: 'TICKET',
      globalDiscountAmount: 0,
      globalDiscountPercent: 0,
      couponCode: null,
      couponDiscountPercent: 0,
      isCredit: false,
      notes: '',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      total: 0,
      totalPaid: 0,
      change: 0,
    });
  },
}));
