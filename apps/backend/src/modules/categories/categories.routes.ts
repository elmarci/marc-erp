import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/client';
import { authenticate } from '../../middleware/auth';
import { redis, CACHE_TTL } from '../../config/redis';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'categories:all';
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json({ success: true, data: JSON.parse(cached) });
      return;
    }

    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    await redis.setex(cacheKey, CACHE_TTL.CATEGORIES, JSON.stringify(categories));
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

router.get('/flat', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

export default router;
