import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError();
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      next(err);
    } else {
      next(new AuthenticationError('Token inválido o expirado. Inicie sesión nuevamente.'));
    }
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AuthorizationError());
      return;
    }
    next();
  };
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  SUPERVISOR: 3,
  CASHIER: 2,
  WAREHOUSE: 1,
};

export function authorizeMinRole(minRole: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }
    if (ROLE_HIERARCHY[req.user.role] < ROLE_HIERARCHY[minRole]) {
      next(new AuthorizationError());
      return;
    }
    next();
  };
}
