import { Server } from 'socket.io';

// Singleton — avoids circular import with server.ts
let _io: Server | null = null;

export function setIo(io: Server): void {
  _io = io;
}

export function emitEvent(event: string, data?: unknown): void {
  try {
    _io?.emit(event, data);
  } catch { /* ignore */ }
}

/** Emite solo a una sala (p. ej. 'staff': personal del ERP con sesión válida). */
export function emitToRoom(room: string, event: string, data?: unknown): void {
  try {
    _io?.to(room).emit(event, data);
  } catch { /* ignore */ }
}
