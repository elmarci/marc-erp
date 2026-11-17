import type { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger';
import { auditContext } from './audit-context';
import { AUDITED_MODELS, diffRecords, onlyIgnoredFields, recordLabel, sanitizeRecord } from './audit.util';

type Row = Record<string, unknown>;

// Registro general de cambios: cada alta, edición o baja de los datos
// maestros (productos, precios, clientes, proveedores, usuarios, ajustes,
// gastos…) hecha por un usuario del ERP queda en audit_logs con quién, cuándo,
// el valor anterior y el nuevo. Solo se registran cambios con usuario
// identificado: lo que hace el sistema solo (tareas programadas, la tienda
// online) no entra.
//
// Nunca debe romper la operación que audita: cualquier error aquí se anota en
// el log del servidor y la operación sigue.
export function installAuditMiddleware(prisma: PrismaClient) {
  prisma.$use(async (params, next) => {
    const cfg = params.model ? AUDITED_MODELS[params.model] : undefined;
    const ctx = auditContext.getStore();
    const action = params.action;
    if (!cfg || !ctx || !['create', 'update', 'delete', 'upsert'].includes(action)) return next(params);
    if (action === 'update' && onlyIgnoredFields(params.args?.data, cfg.ignore)) return next(params);

    const model = params.model as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model.charAt(0).toLowerCase() + model.slice(1)];

    let before: Row | null = null;
    if (action !== 'create' && params.args?.where) {
      try { before = await delegate.findUnique({ where: params.args.where }); } catch { before = null; }
    }

    const result = await next(params);

    try {
      const after = (result ?? null) as Row | null;
      let entry: { action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID'; oldValues?: Row; newValues?: Row } | null = null;

      if (action === 'delete') {
        entry = { action: 'DELETE', oldValues: sanitizeRecord(before) };
      } else if (!before) {
        entry = { action: 'CREATE', newValues: sanitizeRecord(after) };
      } else if (after) {
        const diff = diffRecords(before, after, cfg.ignore);
        if (diff) {
          const softDeleted = before.deletedAt == null && after.deletedAt != null;
          const voided = before.voidedAt == null && after.voidedAt != null;
          entry = { action: softDeleted ? 'DELETE' : voided ? 'VOID' : 'UPDATE', ...diff };
        }
      }

      if (entry) {
        const row = after ?? before;
        const data: Prisma.AuditLogUncheckedCreateInput = {
          userId: ctx.userId,
          action: entry.action,
          resource: model,
          resourceId: row?.id != null ? String(row.id) : null,
          oldValues: entry.oldValues as Prisma.InputJsonValue | undefined,
          newValues: entry.newValues as Prisma.InputJsonValue | undefined,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent?.slice(0, 300),
          metadata: { label: recordLabel(model, row) },
        };
        // Sin await: el registro no debe demorar la respuesta al usuario.
        prisma.auditLog.create({ data }).catch((err) => logger.error({ err, model }, 'No se pudo guardar el registro de auditoría'));
      }
    } catch (err) {
      logger.error({ err, model }, 'Error al preparar el registro de auditoría');
    }

    return result;
  });
}
