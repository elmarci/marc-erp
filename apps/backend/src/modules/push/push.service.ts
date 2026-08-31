import webpush from 'web-push';
import { prisma } from '../../database/client';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { NotFoundError, BusinessError } from '../../utils/errors';

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

  async getSubscriberCount() {
    return prisma.pushSubscription.count();
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

  /* ── Notificaciones armadas a mano desde el ERP ──────────────────────── */

  // scheduledAt en el pasado/presente = se envía casi de inmediato (el
  // chequeo de checkAndSendScheduled corre cada minuto desde server.ts);
  // en el futuro = queda pendiente hasta esa hora exacta. Se guarda en la
  // misma tabla en ambos casos para tener un solo historial de "qué se
  // avisó y cuándo", en vez de separar envío inmediato de programado.
  async scheduleNotification(data: { title: string; body: string; url?: string; scheduledAt: Date; createdById?: string }) {
    const notification = await prisma.scheduledNotification.create({
      data: {
        title: data.title,
        body: data.body,
        url: data.url || '/ofertas',
        scheduledAt: data.scheduledAt,
        createdById: data.createdById,
      },
    });

    // Si ya le tocaba (o le tocó hace rato), no lo hacemos esperar hasta el
    // próximo tick del minuto — se manda ya mismo.
    if (notification.scheduledAt <= new Date()) {
      await this.sendScheduledNotification(notification.id);
    }

    return notification;
  }

  async listScheduledNotifications() {
    return prisma.scheduledNotification.findMany({
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
  }

  async cancelScheduledNotification(id: string) {
    const notification = await prisma.scheduledNotification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundError('Notificación');
    if (notification.sentAt) throw new BusinessError('Esta notificación ya se envió — no se puede cancelar.');
    await prisma.scheduledNotification.delete({ where: { id } });
  }

  private async sendScheduledNotification(id: string) {
    const notification = await prisma.scheduledNotification.update({
      where: { id },
      data: { sentAt: new Date() },
    });
    await this.broadcast({ title: notification.title, body: notification.body, url: notification.url });
  }

  // Se llama cada minuto desde server.ts — manda las que ya les tocó y
  // todavía no se enviaron. Marca sentAt ANTES de enviar (no después) para
  // que si el proceso se reinicia a media entrega no la vuelva a mandar
  // duplicada en el próximo tick.
  async checkAndSendPendingNotifications() {
    const due = await prisma.scheduledNotification.findMany({
      where: { sentAt: null, scheduledAt: { lte: new Date() } },
    });
    for (const notification of due) {
      await this.sendScheduledNotification(notification.id).catch(err =>
        logger.error({ err, notificationId: notification.id }, 'Error enviando notificación programada'),
      );
    }
  }
}

export const pushService = new PushService();
