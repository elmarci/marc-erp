import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

// Clave de acceso de un pedido web. Los números de pedido son correlativos
// (ORD-00042, ORD-00043…): sin esto, cualquiera podía recorrerlos y ver
// nombre, teléfono, dirección y, desde el seguimiento, dónde va la moto.
//
// La clave es una firma HMAC del número de pedido con el secreto del
// servidor, así que no hace falta guardarla en la base (sin cambio de
// esquema) y nadie puede calcularla sin el secreto. Se entrega al crear el
// pedido y viaja en el enlace: /pedido/ORD-00042?k=<clave>.
export function orderAccessKey(orderNumber: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`store-order:${orderNumber}`).digest('base64url').slice(0, 16);
}

export function isValidOrderKey(orderNumber: string, key: unknown): boolean {
  if (typeof key !== 'string' || key.length !== 16) return false;
  const a = Buffer.from(orderAccessKey(orderNumber));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
