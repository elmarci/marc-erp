import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../database/client';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  AuthenticationError,
  BusinessError,
  NotFoundError,
} from '../../utils/errors';
import type { JwtPayload } from '../../middleware/auth';
import type { LoginInput, ChangePasswordInput } from './auth.schemas';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

export class AuthService {
  async login(input: LoginInput, ipAddress: string, userAgent: string) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.login.toLowerCase() }, { username: input.login }],
        deletedAt: null,
      },
    });

    if (!user) {
      // Timing-safe: igual tiempo aunque no exista el usuario
      await bcrypt.compare(input.password, '$2b$12$invalidhashfortimingequalityXXXXXXXXXXXXX');
      throw new AuthenticationError('Credenciales inválidas.');
    }

    if (user.status === 'LOCKED') {
      if (user.lockedAt) {
        const lockExpiry = new Date(user.lockedAt.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);
        if (new Date() < lockExpiry) {
          throw new AuthenticationError(
            `Cuenta bloqueada por múltiples intentos fallidos. Intente de nuevo en ${LOCK_DURATION_MINUTES} minutos.`,
          );
        }
        // Desbloquear automáticamente
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', failedLoginAttempts: 0, lockedAt: null },
        });
      }
    }

    if (user.status === 'INACTIVE') {
      throw new AuthenticationError('Cuenta desactivada. Contacte al administrador.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          ...(shouldLock ? { status: 'LOCKED', lockedAt: new Date() } : {}),
        },
      });

      if (shouldLock) {
        logger.warn({ userId: user.id, ipAddress }, 'Account locked due to failed attempts');
        throw new AuthenticationError(
          `Cuenta bloqueada por ${MAX_LOGIN_ATTEMPTS} intentos fallidos. Contacte al administrador.`,
        );
      }

      throw new AuthenticationError(
        `Credenciales inválidas. Intentos restantes: ${MAX_LOGIN_ATTEMPTS - newAttempts}.`,
      );
    }

    // Reset failed attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedAt: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    const sessionId = uuidv4();
    const { accessToken, refreshToken } = this.generateTokens(
      { sub: user.id, email: user.email, role: user.role, sessionId },
    );

    await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    logger.info({ userId: user.id, ipAddress }, 'User logged in');

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async pinLogin(userId: string, pin: string, ipAddress: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
    });

    if (!user?.pin) {
      throw new AuthenticationError('PIN no configurado para este usuario.');
    }

    const isPinValid = await bcrypt.compare(pin, user.pin);
    if (!isPinValid) {
      throw new AuthenticationError('PIN incorrecto.');
    }

    const sessionId = uuidv4();
    const { accessToken, refreshToken } = this.generateTokens(
      { sub: user.id, email: user.email, role: user.role, sessionId },
    );

    await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshToken,
        ipAddress,
        userAgent: 'PIN_LOGIN',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 horas
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async refreshAccessToken(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw new AuthenticationError('Refresh token inválido o expirado.');
    }

    const session = await prisma.userSession.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AuthenticationError('Sesión inválida. Inicie sesión nuevamente.');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new AuthenticationError('Cuenta desactivada.');
    }

    const newSessionId = uuidv4();
    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens({
      sub: session.userId,
      email: session.user.email,
      role: session.user.role,
      sessionId: newSessionId,
    });

    // Rotar refresh token
    await prisma.$transaction([
      prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.userSession.create({
        data: {
          userId: session.userId,
          refreshToken: newRefreshToken,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await prisma.userSession.updateMany({
      where: { refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Blacklist en Redis por si el token aún tiene tiempo de vida
    await redis.setex(`blacklist:${refreshToken}`, 60 * 60 * 24 * 7, '1');
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('Usuario');

    const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BusinessError('La contraseña actual es incorrecta.');
    }

    if (input.currentPassword === input.newPassword) {
      throw new BusinessError('La nueva contraseña debe ser diferente a la actual.');
    }

    const hash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    // Invalidar todas las sesiones excepto la actual
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private generateTokens(payload: JwtPayload) {
    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }
}

export const authService = new AuthService();
