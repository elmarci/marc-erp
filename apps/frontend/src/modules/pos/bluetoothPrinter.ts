import { create } from 'zustand';

/**
 * Impresora térmica Bluetooth (ESC/POS) directo desde el navegador.
 *
 * Usa Web Bluetooth: funciona en Chrome/Edge de Android (y en Chrome de
 * PC/Mac). NO funciona en iPhone/iPad (Safari no lo implementa) ni en
 * Firefox. Requiere HTTPS (Railway ya lo da) o localhost.
 *
 * Solo sirve con impresoras que exponen Bluetooth "LE" (BLE) — la mayoría de
 * ticketeras portátiles chinas de 58/80 mm lo hacen (además del Bluetooth
 * clásico). Las que solo tienen Bluetooth clásico (SPP) no aparecen en la
 * lista del navegador; para esas haría falta una app puente.
 *
 * La configuración (ancho de papel, imprimir solo al cobrar, última
 * impresora) es de cada equipo: se guarda en este navegador, no en el
 * servidor, porque cada celular tiene su propia impresora al lado.
 */

// Servicios BLE de impresión más comunes en ticketeras genéricas. El
// navegador solo deja hablar con los servicios declarados aquí.
const PRINTER_SERVICES: BluetoothServiceUUID[] = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
];

const STORAGE_KEY = 'marc.btPrinter';

export type PaperWidth = 58 | 80;

interface StoredPrefs {
  paperWidth: PaperWidth;
  autoPrint: boolean;
  lastDeviceId?: string;
  lastDeviceName?: string;
}

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { paperWidth: 58, autoPrint: false, ...JSON.parse(raw) };
  } catch { /* navegador sin storage: valores por defecto */ }
  return { paperWidth: 58, autoPrint: false };
}

function savePrefs(p: StoredPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* no crítico */ }
}

export function isBluetoothPrintSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth && window.isSecureContext;
}

type Status = 'disconnected' | 'connecting' | 'connected' | 'printing';

interface BtPrinterState extends StoredPrefs {
  status: Status;
  deviceName: string | null;
  setPaperWidth: (w: PaperWidth) => void;
  setAutoPrint: (v: boolean) => void;
  connect: () => Promise<boolean>;
  reconnect: () => Promise<boolean>;
  disconnect: () => void;
  print: (data: Uint8Array) => Promise<void>;
}

let device: BluetoothDevice | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

async function findWritableCharacteristic(server: BluetoothRemoteGATTServer) {
  const services = await server.getPrimaryServices();
  // Primero los servicios conocidos de impresión, luego cualquiera.
  services.sort((a, b) => Number(PRINTER_SERVICES.includes(b.uuid)) - Number(PRINTER_SERVICES.includes(a.uuid)));
  for (const service of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try { chars = await service.getCharacteristics(); } catch { continue; }
    const writable = chars.find(c => c.properties.writeWithoutResponse) ?? chars.find(c => c.properties.write);
    if (writable) return writable;
  }
  throw new Error('La impresora no tiene un canal de impresión compatible.');
}

async function openGatt(dev: BluetoothDevice) {
  const server = await dev.gatt!.connect();
  characteristic = await findWritableCharacteristic(server);
}

export const useBtPrinter = create<BtPrinterState>()((set, get) => {
  const prefs = loadPrefs();
  const persist = () => {
    const { paperWidth, autoPrint, lastDeviceId, lastDeviceName } = get();
    savePrefs({ paperWidth, autoPrint, lastDeviceId, lastDeviceName });
  };

  const onDisconnected = () => {
    characteristic = null;
    set({ status: 'disconnected' });
  };

  const attach = async (dev: BluetoothDevice) => {
    device?.removeEventListener('gattserverdisconnected', onDisconnected);
    device = dev;
    dev.addEventListener('gattserverdisconnected', onDisconnected);
    await openGatt(dev);
    set({ status: 'connected', deviceName: dev.name ?? 'Impresora', lastDeviceId: dev.id, lastDeviceName: dev.name ?? 'Impresora' });
    persist();
  };

  return {
    ...prefs,
    status: 'disconnected',
    deviceName: null,

    setPaperWidth: (paperWidth) => { set({ paperWidth }); persist(); },
    setAutoPrint: (autoPrint) => { set({ autoPrint }); persist(); },

    // Abre la lista de equipos Bluetooth del navegador (requiere un toque del usuario).
    connect: async () => {
      if (!isBluetoothPrintSupported()) return false;
      set({ status: 'connecting' });
      try {
        const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
        await attach(dev);
        return true;
      } catch (err) {
        set({ status: 'disconnected' });
        if ((err as { name?: string })?.name === 'NotFoundError') return false; // cerró la lista
        throw err;
      }
    },

    // Sin abrir la lista: reusa la impresora ya elegida (misma sesión) o, si
    // el navegador lo permite, la última que se emparejó.
    reconnect: async () => {
      if (!isBluetoothPrintSupported()) return false;
      if (characteristic && device?.gatt?.connected) return true;
      try {
        if (device) { set({ status: 'connecting' }); await attach(device); return true; }
        const { lastDeviceId } = get();
        if (lastDeviceId && navigator.bluetooth.getDevices) {
          const known = (await navigator.bluetooth.getDevices()).find(d => d.id === lastDeviceId);
          if (known) { set({ status: 'connecting' }); await attach(known); return true; }
        }
      } catch { set({ status: 'disconnected' }); }
      return false;
    },

    disconnect: () => {
      try { device?.gatt?.disconnect(); } catch { /* ya estaba desconectada */ }
      device = null;
      characteristic = null;
      set({ status: 'disconnected', deviceName: null });
    },

    print: async (data) => {
      if (!characteristic || !device?.gatt?.connected) {
        const ok = await get().reconnect();
        if (!ok || !characteristic) throw new Error('La impresora Bluetooth no está conectada.');
      }
      set({ status: 'printing' });
      try {
        const ch = characteristic!;
        const noResponse = ch.properties.writeWithoutResponse;
        // BLE manda paquetes chicos: se trocea. Sin confirmación es más
        // rápido pero hay que dar respiro para no desbordar el búfer.
        const CHUNK = noResponse ? 128 : 180;
        for (let i = 0; i < data.length; i += CHUNK) {
          const part = data.slice(i, i + CHUNK);
          if (noResponse) {
            await ch.writeValueWithoutResponse(part);
            await new Promise(r => setTimeout(r, 12));
          } else {
            await ch.writeValueWithResponse(part);
          }
        }
      } finally {
        set({ status: characteristic ? 'connected' : 'disconnected' });
      }
    },
  };
});
