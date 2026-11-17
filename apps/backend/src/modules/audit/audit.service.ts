import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { AUDITED_MODELS } from './audit.util';

export class AuditService {
  async list(filters: {
    resource?: string; action?: string; userId?: string; search?: string;
    from?: Date; to?: Date; page: number; limit: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      // Los inicios de sesión solo se muestran si se piden: si no, tapan los cambios.
      ...(filters.resource ? { resource: filters.resource } : { resource: { not: 'auth' } }),
      ...(filters.action ? { action: filters.action as never } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
      ...(filters.search ? { metadata: { path: ['label'], string_contains: filters.search } } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      data,
      resources: Object.keys(AUDITED_MODELS),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }
}

export const auditService = new AuditService();
