import { env } from '../config/env';
import { logger } from '../config/logger';
import { BusinessError } from './errors';

// Envío de correos transaccionales por la API HTTP de Resend
// (https://resend.com/docs/api-reference/emails/send-email). Railway bloquea
// SMTP saliente en planes básicos, por eso no se usa nodemailer/SMTP.
export async function sendMail(to: string, subject: string, html: string, text: string) {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      logger.error('RESEND_API_KEY no configurada: no se pudo enviar el correo');
      throw new BusinessError('No pudimos enviar el correo en este momento. Intenta más tarde o escríbenos por WhatsApp.');
    }
    // Desarrollo local: el correo "se envía" al log para poder probar el flujo.
    logger.warn({ to, subject, text }, '[mailer] RESEND_API_KEY vacía — correo solo en el log');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, '[mailer] Resend rechazó el envío');
    throw new BusinessError('No pudimos enviar el correo en este momento. Intenta más tarde o escríbenos por WhatsApp.');
  }
}

// Plantilla sencilla con los colores de la marca (correo = HTML con estilos
// en línea; muchos clientes de correo ignoran <style>).
export function codeEmail(opts: { name: string; title: string; intro: string; code: string }) {
  const { name, title, intro, code } = opts;
  const safeName = name.replace(/[<>&"]/g, '');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#26241c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e5e3dc;border-radius:16px">
<tr><td style="padding:24px 24px 8px;font-size:20px;font-weight:800;color:#2460b4">Minimarket Marc</td></tr>
<tr><td style="padding:0 24px;font-size:16px;font-weight:700">${title}</td></tr>
<tr><td style="padding:12px 24px;font-size:14px;line-height:1.5;color:#5b5744">Hola ${safeName}, ${intro}</td></tr>
<tr><td align="center" style="padding:8px 24px 16px"><div style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:800;background:#f4f4f2;border-radius:12px;padding:12px 20px;color:#26241c">${code}</div></td></tr>
<tr><td style="padding:0 24px 24px;font-size:12px;line-height:1.5;color:#8a8570">El código vence en 15 minutos. Si no fuiste tú, ignora este correo: nadie podrá entrar a tu cuenta sin este código. Nunca te pediremos este código por teléfono ni por WhatsApp.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hola ${safeName}, ${intro}\n\nTu código: ${code}\n\nVence en 15 minutos. Si no fuiste tú, ignora este correo. Nunca te pediremos este código por teléfono ni por WhatsApp.\n\nMinimarket Marc`;
  return { html, text };
}
