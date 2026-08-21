import {
  sendPasswordResetEmail,
  sendTransactionalEmail,
  type EmailDeliveryResult,
} from "@/lib/email";
import { openSensitiveValue } from "@/lib/sensitive-data";

type NotificationJob = {
  channel: string;
  templateKey: string;
  recipient: string;
  payload: Record<string, unknown>;
};

export type NotificationDeliveryResult = EmailDeliveryResult;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textValue(payload: Record<string, unknown>, key: string, fallback = "") {
  const value = payload[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function emailCopy(templateKey: string, payload: Record<string, unknown>) {
  const reference = textValue(payload, "reference", textValue(payload, "orderId"));
  const scheduledStart = textValue(payload, "scheduledStart");
  const copies: Record<string, { subject: string; message: string }> = {
    "booking-created": {
      subject: "Recibimos tu pedido de limpieza",
      message: `Tu pedido ${reference || "Reludcir"} fue registrado y está pendiente de pago.`,
    },
    "payment-confirmed": {
      subject: "Pago confirmado — Reludcir",
      message: `Confirmamos el pago de tu pedido ${reference || "Reludcir"}.`,
    },
    "booking-cancelled": {
      subject: "Cancelación registrada — Reludcir",
      message: "Registramos la cancelación solicitada. Si corresponde un reembolso, nuestro equipo lo revisará.",
    },
    "booking-rescheduled": {
      subject: "Reserva reprogramada — Reludcir",
      message: `La nueva fecha registrada es ${scheduledStart || "la indicada en tu cuenta"}.`,
    },
    "incident-received": {
      subject: "Recibimos tu reporte — Reludcir",
      message: "Nuestro equipo revisará el reporte asociado a tu servicio.",
    },
    "incident-alert": {
      subject: "Nueva incidencia requiere revisión",
      message: `La reserva ${textValue(payload, "bookingId")} tiene una nueva incidencia.`,
    },
    password_changed: {
      subject: "Tu contraseña fue actualizada",
      message: "La contraseña de tu cuenta cambió y las sesiones anteriores fueron cerradas.",
    },
    "refund-review-required": {
      subject: "Revisión de reembolso requerida",
      message: `La orden ${reference} requiere revisión de reembolso.`,
    },
    "late-payment-refund-review": {
      subject: "Pago tardío: revisión urgente",
      message: `Se recibió un pago para la orden ${reference} después de su cancelación o vencimiento.`,
    },
    "late-payment-refund-pending": {
      subject: "Recibimos tu pago fuera del plazo de reserva",
      message: `Registramos el pago de la orden ${reference}. Como el horario ya fue liberado, nuestro equipo gestionará el reembolso.`,
    },
  };
  return copies[templateKey] ?? {
    subject: "Actualización de tu servicio Reludcir",
    message: "Hay una actualización relacionada con tu servicio.",
  };
}

async function sendEmail(job: NotificationJob): Promise<NotificationDeliveryResult> {
  if (job.templateKey === "password_reset") {
    const encryptedResetUrl = textValue(job.payload, "encryptedResetUrl");
    if (!encryptedResetUrl) return { sent: false, reason: "provider_error" };
    try {
      return sendPasswordResetEmail({
        to: job.recipient,
        resetUrl: openSensitiveValue(encryptedResetUrl),
      });
    } catch {
      return { sent: false, reason: "provider_error" };
    }
  }

  const copy = emailCopy(job.templateKey, job.payload);
  return sendTransactionalEmail({
    to: job.recipient,
    subject: copy.subject,
    html: `<div style="font-family:Arial,sans-serif;color:#0c122d;line-height:1.6"><h1 style="font-size:24px">${escapeHtml(copy.subject)}</h1><p>${escapeHtml(copy.message)}</p><p>Equipo Reludcir</p></div>`,
  });
}

async function sendWhatsApp(job: NotificationJob): Promise<NotificationDeliveryResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateByKey: Record<string, string | undefined> = {
    "booking-created": process.env.WHATSAPP_TEMPLATE_BOOKING_CREATED,
    "payment-confirmed": process.env.WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED,
    "booking-cancelled": process.env.WHATSAPP_TEMPLATE_BOOKING_CANCELLED,
    "booking-rescheduled": process.env.WHATSAPP_TEMPLATE_BOOKING_RESCHEDULED,
  };
  const templateName = templateByKey[job.templateKey];
  if (!phoneNumberId || !accessToken || !templateName) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: job.recipient.replace(/\D/g, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "es" },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return response.ok
      ? { sent: true }
      : { sent: false, reason: "provider_error" };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}

export async function deliverNotification(
  job: NotificationJob,
): Promise<NotificationDeliveryResult> {
  if (job.channel === "email") return sendEmail(job);
  if (job.channel === "whatsapp") return sendWhatsApp(job);
  return { sent: false, reason: "not_configured" };
}
