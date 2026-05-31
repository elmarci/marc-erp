import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/client';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { redis } from '../../config/redis';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.setting.findMany({ orderBy: [{ group: 'asc' }, { label: 'asc' }] });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.patch('/', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { updates } = z.object({ updates: z.record(z.string()) }).parse(req.body);
    const ops = Object.entries(updates).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value, label: key, group: 'general' },
      }),
    );
    await prisma.$transaction(ops);
    await redis.del('settings:*');
    res.json({ success: true, message: 'Configuración actualizada.' });
  } catch (err) { next(err); }
});

export default router;
