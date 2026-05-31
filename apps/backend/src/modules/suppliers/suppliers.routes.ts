import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { suppliersService } from './suppliers.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const supplierSchema = z.object({
  businessName: z.string().min(2),
  taxId: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  paymentTermDays: z.coerce.number().min(0).default(30),
  notes: z.string().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page, limit } = z.object({
      search: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(500).default(20),
    }).parse(req.query);
    const result = await suppliersService.list({ search, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await suppliersService.get(req.params.id);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.post('/', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = supplierSchema.parse(req.body);
    const supplier = await suppliersService.create(data);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.put('/:id', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = supplierSchema.partial().parse(req.body);
    const supplier = await suppliersService.update(req.params.id, data);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.delete('/:id', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await suppliersService.delete(req.params.id);
    res.json({ success: true, message: 'Proveedor eliminado.' });
  } catch (err) { next(err); }
});

export default router;
