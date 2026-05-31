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
