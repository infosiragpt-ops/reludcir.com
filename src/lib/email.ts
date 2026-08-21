type PasswordResetEmail = {
  to: string;
  resetUrl: string;
};

type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
};

export type EmailDeliveryResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "provider_error" };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: PasswordResetEmail): Promise<EmailDeliveryResult> {
  const safeUrl = escapeHtml(resetUrl);
  return sendTransactionalEmail({
    to,
    subject: "Restablece tu contraseña de Reludcir",
    html: `
      <div style="font-family:Arial,sans-serif;color:#0c122d;line-height:1.6">
        <h1 style="font-size:24px">Restablece tu contraseña</h1>
        <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
        <p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1b5fc1;color:#fff;text-decoration:none">Crear nueva contraseña</a></p>
        <p>El enlace vence en una hora. Si no hiciste esta solicitud, ignora este mensaje.</p>
      </div>
    `,
  });
}

export async function sendTransactionalEmail({
  to,
  subject,
  html,
}: TransactionalEmail): Promise<EmailDeliveryResult> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false, reason: "not_configured" };
  }

  const endpoint =
    process.env.EMAIL_PROVIDER_API_URL ?? "https://api.resend.com/emails";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    return response.ok
      ? { sent: true }
      : { sent: false, reason: "provider_error" };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}
