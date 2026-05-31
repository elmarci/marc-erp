import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  pinLoginSchema,
} from './auth.schemas';
import { prisma } from '../../database/client';
import { AuditAction } from '@prisma/client';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = loginSchema.parse({ body: req.body });
      const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const userAgent = req.headers['user-agent'] ?? 'unknown';

      const result = await authService.login(body, ipAddress, userAgent);

      await prisma.auditLog.create({
        data: {
          userId: result.user.id,
          action: AuditAction.LOGIN,
          resource: 'auth',
          ipAddress,
          userAgent,
        },
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async pinLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = pinLoginSchema.parse({ body: req.body });
      const ipAddress = req.ip ?? 'unknown';
      const result = await authService.pinLogin(body.userId, body.pin, ipAddress);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = refreshTokenSchema.parse({ body: req.body });
      const result = await authService.refreshAccessToken(body.refreshToken);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = refreshTokenSchema.parse({ body: req.body });
      await authService.logout(body.refreshToken);

      if (req.user) {
        await prisma.auditLog.create({
          data: {
            userId: req.user.sub,
            action: AuditAction.LOGOUT,
            resource: 'auth',
            ipAddress: req.ip ?? 'unknown',
          },
        });
      }

      res.json({ success: true, message: 'Sesión cerrada correctamente.' });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = changePasswordSchema.parse({ body: req.body });
      await authService.changePassword(req.user!.sub, body);
      res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
    } catch (err) {
      next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          mustChangePassword: true,
          lastLoginAt: true,
          avatarUrl: true,
        },
      });

      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
