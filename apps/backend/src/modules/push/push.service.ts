import webpush from 'web-push';
import { prisma } from '../../database/client';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const vapidConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export class PushService {
  isConfigured() {
    return vapidConfigured;
  }

  getPublicKey() {
    return env.VAPID_PUBLIC_KEY ?? null;
  }

  async subscribe(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, customerId?: string) {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, customerId: customerId ?? undefined },
      create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, customerId: customerId ?? undefined },
    });
  }

  async unsubscribe(endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  // Envía a todos los suscritos — la tienda es chica, no hace falta
  // segmentar por preferencias todavía. Si el navegador ya revocó una
  // suscripción (410 Gone / 404 Not Found), se limpia sola de la tabla en
  // vez de seguir intentando enviarle para siempre.
  async broadcast(payload: PushPayload) {
    if (!vapidConfigured) {
      logger.warn('VAPID no configurado — se omite el envío de notificaciones push');
      return;
    }
    const subs = await prisma.pushSubscription.findMany();
    if (subs.length === 0) return;

    const payloadStr = JSON.stringify(payload);
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          logger.error({ err, subscriptionId: sub.id }, 'Error enviando notificación push');
        }
      }
    }));
  }
}

export const pushService = new PushService();
