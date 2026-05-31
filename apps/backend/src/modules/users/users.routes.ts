import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRole, UserStatus } from '@prisma/client';
import { usersService, CreateUserInput, ListUsersQuery } from './users.service';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email('Correo inválido'),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo'),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Debe tener mayúscula, minúscula y número'),
  pin: z.string().length(4).regex(/^\d+$/).optional(),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  pin: z.string().length(4).regex(/^\d+$/).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  search: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query) as ListUsersQuery;
    const result = await usersService.list(query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createUserSchema.parse(req.body) as CreateUserInput;
    const user = await usersService.create(input);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.getById(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateUserSchema.parse(req.body);
    const user = await usersService.update(req.params.id, input);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

router.post('/:id/reset-password', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = z.object({
      password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    }).parse(req.body);
    await usersService.resetPassword(req.params.id, password);
    res.json({ success: true, message: 'Contraseña restablecida. El usuario deberá cambiarla en el próximo acceso.' });
  } catch (err) { next(err); }
});

router.post('/:id/deactivate', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await usersService.deactivate(req.params.id, req.user!.sub);
    res.json({ success: true, message: 'Usuario desactivado.' });
  } catch (err) { next(err); }
});

export default router;
