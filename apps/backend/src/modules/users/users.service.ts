import bcrypt from 'bcrypt';
import { UserRole, UserStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { env } from '../../config/env';
import {
  NotFoundError,
  ConflictError,
  BusinessError,
} from '../../utils/errors';

interface CreateUserInput {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  password: string;
  pin?: string;
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  status?: UserStatus;
  pin?: string;
}

interface ListUsersQuery {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

export class UsersService {
  async create(input: CreateUserInput) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email.toLowerCase() }, { username: input.username }],
      },
    });

    if (existing) {
      if (existing.email === input.email.toLowerCase()) {
        throw new ConflictError('El correo electrónico ya está registrado.');
      }
      throw new ConflictError('El nombre de usuario ya está en uso.');
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    const pinHash = input.pin ? await bcrypt.hash(input.pin, env.BCRYPT_ROUNDS) : undefined;

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        role: input.role,
        passwordHash,
        pin: pinHash,
        mustChangePassword: true,
      },
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
        createdAt: true,
      },
    });

    return user;
  }

  async list(query: ListUsersQuery) {
    const { page, limit, search, role, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundError('Usuario');
    return user;
  }

  async update(id: string, input: UpdateUserInput) {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundError('Usuario');

    let pinHash: string | undefined;
    if (input.pin !== undefined) {
      if (input.pin) {
        pinHash = await bcrypt.hash(input.pin, env.BCRYPT_ROUNDS);
      } else {
        pinHash = '';
      }
    }

    return prisma.user.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(pinHash !== undefined ? { pin: pinHash || null } : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundError('Usuario');

    const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id },
      data: { passwordHash: hash, mustChangePassword: true },
    });
  }

  async deactivate(id: string, requestingUserId: string) {
    if (id === requestingUserId) {
      throw new BusinessError('No puede desactivar su propia cuenta.');
    }

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundError('Usuario');

    if (user.role === 'SUPER_ADMIN') {
      throw new BusinessError('No se puede desactivar al Super Admin.');
    }

    await prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    // Revocar todas las sesiones activas
    await prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export const usersService = new UsersService();
