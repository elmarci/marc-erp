import { AsyncLocalStorage } from 'async_hooks';

// Quién está haciendo la petición en curso. Lo llena el middleware
// `authenticate` y lo lee el registro de auditoría (audit.middleware.ts) sin
// tener que pasar el usuario por cada función de cada módulo.
export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

export const auditContext = new AsyncLocalStorage<AuditContext>();
