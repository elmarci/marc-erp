import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ExpenseCategory, PaymentMethod, SupplierDocType } from '@prisma/client';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { ValidationError } from '../../utils/errors';
import { treasuryService } from './treasury.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { parseLimaDate } from '../../utils/timezone';

const router = Router();

const RECEIPT_DIR = path.join(process.cwd(), 'uploads', 'receipts');
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(new ValidationError('La foto debe ser JPG, PNG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

router.use(authenticate);

// Ver el saldo es lo mínimo que necesita un cajero para decidir cuánto sacar
// al abrir su caja — el resto del módulo (gastos, depósitos, plantillas)
// requiere Supervisor o superior, mismo nivel que aprobar compras.
router.get('/balance', authorizeMinRole('CASHIER'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const balances = await treasuryService.getBalances();
    res.json({ success: true, data: balances });
  } catch (err) { next(err); }
});

router.use(authorizeMinRole('SUPERVISOR'));

router.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, account, dateFrom, dateTo, page, limit } = z.object({
      type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
      account: z.enum(['CASH', 'YAPE', 'PLIN']).optional(),
      dateFrom: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      dateTo: z.string().transform((s) => parseLimaDate(s, true)).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await treasuryService.listMovements({ type, account, dateFrom, dateTo, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/deposits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, description, account } = z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
      account: z.enum(['CASH', 'YAPE', 'PLIN']).default('CASH'),
    }).parse(req.body);
    const movement = await treasuryService.deposit(amount, description, req.user!.sub, account);
    res.status(201).json({ success: true, data: movement });
  } catch (err) { next(err); }
});

// Traspaso entre cuentas de Caja General (ej. Yape → Efectivo) — no es un
// gasto, ver nota en treasury.service.ts.
router.get('/transfers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { account, page, limit } = z.object({
      account: z.enum(['CASH', 'YAPE', 'PLIN']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await treasuryService.listTransfers({ account, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/transfers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fromAccount, toAccount, amount, notes } = z.object({
      fromAccount: z.enum(['CASH', 'YAPE', 'PLIN']),
      toAccount: z.enum(['CASH', 'YAPE', 'PLIN']),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }).parse(req.body);
    const transfer = await treasuryService.createTransfer({ fromAccount, toAccount, amount, notes, userId: req.user!.sub });
    res.status(201).json({ success: true, data: transfer });
  } catch (err) { next(err); }
});

const expenseDocSchema = {
  payeeName: z.string().max(120).nullable().optional(),
  payeeTaxId: z.string().max(11).nullable().optional(),
  docType: z.nativeEnum(SupplierDocType).nullable().optional(),
  docSeries: z.string().max(10).nullable().optional(),
  docNumber: z.string().max(20).nullable().optional(),
  receiptUrl: z.string().url().max(500).nullable().optional(),
};
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes no válido').optional();

/* ── Categorías de gasto (editables) ─────────────────────────────────── */

router.get('/expense-categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const all = req.query.all === 'true';
    res.json({ success: true, data: await treasuryService.listExpenseCategories(all) });
  } catch (err) { next(err); }
});

router.post('/expense-categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      name: z.string().trim().min(2, 'Escribe un nombre').max(60),
      group: z.nativeEnum(ExpenseCategory),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await treasuryService.createExpenseCategory(data) });
  } catch (err) { next(err); }
});

router.patch('/expense-categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      name: z.string().trim().min(2).max(60).optional(),
      group: z.nativeEnum(ExpenseCategory).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    res.json({ success: true, data: await treasuryService.updateExpenseCategory(req.params.id, data) });
  } catch (err) { next(err); }
});

/* ── Foto del comprobante ────────────────────────────────────────────── */

router.post('/expenses/receipt-photo', receiptUpload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No se recibió ninguna imagen.');
    await fs.mkdir(RECEIPT_DIR, { recursive: true });
    const filename = `${uuidv4()}.jpg`;
    // Legible pero liviana: 1600 px por el lado más largo.
    await sharp(req.file.buffer).rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(RECEIPT_DIR, filename));
    const url = `${req.protocol}://${req.get('host')}/uploads/receipts/${filename}`;
    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
});

/* ── Gastos ──────────────────────────────────────────────────────────── */

router.get('/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, categoryId, pending, search, dateFrom, dateTo, page, limit, includeVoided } = z.object({
      category: z.nativeEnum(ExpenseCategory).optional(),
      categoryId: z.string().uuid().optional(),
      pending: z.enum(['true', 'false']).optional(),
      search: z.string().trim().min(1).optional(),
      dateFrom: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      dateTo: z.string().transform((s) => parseLimaDate(s, true)).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
      includeVoided: z.enum(['true', 'false']).optional(),
    }).parse(req.query);
    const result = await treasuryService.listExpenses({
      category, categoryId, search, dateFrom, dateTo, page, limit,
      pending: pending === undefined ? undefined : pending === 'true',
      includeVoided: includeVoided === 'true',
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/expenses/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = z.object({
      dateFrom: z.string().transform((s) => parseLimaDate(s, false)),
      dateTo: z.string().transform((s) => parseLimaDate(s, true)),
    }).parse(req.query);
    const summary = await treasuryService.getExpensesSummary(dateFrom, dateTo);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.post('/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      categoryId: z.string().uuid().optional(),
      category: z.nativeEnum(ExpenseCategory).optional(),
      description: z.string().min(1),
      amount: z.number().positive(),
      method: z.nativeEnum(PaymentMethod).optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      expenseDate: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      period: periodSchema,
      isPending: z.boolean().optional(),
      ...expenseDocSchema,
      // Solo tiene efecto con method === 'CASH': ata el gasto a esa sesión de
      // caja (caja del día) en vez de Caja General.
      cashSessionId: z.string().uuid().optional(),
    }).refine((d) => d.categoryId || d.category, { message: 'Elige la categoría del gasto.' }).parse(req.body);
    const expense = await treasuryService.createExpense({ ...data, userId: req.user!.sub });
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
});

router.patch('/expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      categoryId: z.string().uuid().optional(),
      category: z.nativeEnum(ExpenseCategory).optional(),
      description: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      reference: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      expenseDate: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      period: periodSchema,
      ...expenseDocSchema,
    }).parse(req.body);
    const expense = await treasuryService.updateExpense(req.params.id, data);
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
});

router.post('/expenses/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      method: z.nativeEnum(PaymentMethod),
      cashSessionId: z.string().uuid().optional(),
      paidAt: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      reference: z.string().nullable().optional(),
      amount: z.number().positive().optional(),
    }).parse(req.body);
    const expense = await treasuryService.payExpense(req.params.id, req.user!.sub, data);
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
});

router.post('/expenses/:id/void', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3, 'Indica el motivo de la anulación.') }).parse(req.body);
    const expense = await treasuryService.voidExpense(req.params.id, req.user!.sub, reason);
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
});

// Conciliación/arqueo de Caja General al cierre del día — separado del
// arqueo de caja de turno (que ya existe vía CashSessionReconciliation).
router.get('/reconciliations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { account, page, limit } = z.object({
      account: z.enum(['CASH', 'YAPE', 'PLIN']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await treasuryService.listReconciliations({ account, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/reconcile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { account, countedAmount, notes, date } = z.object({
      account: z.enum(['CASH', 'YAPE', 'PLIN']),
      countedAmount: z.number().min(0),
      notes: z.string().optional(),
      date: z.string().transform((s) => parseLimaDate(s, false)).optional(),
    }).parse(req.body);
    const reconciliation = await treasuryService.recordReconciliation({
      account, countedAmount, notes, date, userId: req.user!.sub,
    });
    res.status(201).json({ success: true, data: reconciliation });
  } catch (err) { next(err); }
});

router.get('/recurring-expenses', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await treasuryService.listRecurringTemplates();
    res.json({ success: true, data: templates });
  } catch (err) { next(err); }
});

router.post('/recurring-expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      categoryId: z.string().uuid().optional(),
      category: z.nativeEnum(ExpenseCategory).optional(),
      payeeName: z.string().max(120).nullable().optional(),
      description: z.string().min(1),
      amount: z.number().positive(),
      dayOfMonth: z.number().int().min(1).max(28),
    }).refine((d) => d.categoryId || d.category, { message: 'Elige la categoría del gasto.' }).parse(req.body);
    const template = await treasuryService.createRecurringTemplate({ ...data, userId: req.user!.sub });
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
});

router.patch('/recurring-expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      description: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      dayOfMonth: z.number().int().min(1).max(28).optional(),
      isActive: z.boolean().optional(),
      categoryId: z.string().uuid().optional(),
      payeeName: z.string().max(120).nullable().optional(),
    }).parse(req.body);
    const template = await treasuryService.updateRecurringTemplate(req.params.id, input);
    res.json({ success: true, data: template });
  } catch (err) { next(err); }
});

router.delete('/recurring-expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await treasuryService.deleteRecurringTemplate(req.params.id);
    res.json({ success: true, message: 'Plantilla eliminada.' });
  } catch (err) { next(err); }
});

export default router;
