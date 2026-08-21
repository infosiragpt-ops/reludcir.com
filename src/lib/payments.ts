type CheckoutInput = {
  amountMinor: number;
  customerEmail: string;
  orderReference: string;
  origin: string;
  expiresAt: Date;
};

type StripeCheckoutSession = {
  id: string;
  url: string | null;
};

type StripeRefund = {
  id: string;
  status?: string;
};

export async function createStripeCheckout({
  amountMinor,
  customerEmail,
  orderReference,
  origin,
  expiresAt,
}: CheckoutInput) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { configured: false as const };
  }

  const form = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    customer_email: customerEmail,
    client_reference_id: orderReference,
    success_url: `${origin}/confirmacion-reserva?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?payment=cancelled#form`,
    expires_at: String(Math.floor(expiresAt.getTime() / 1_000)),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "pen",
    "line_items[0][price_data][unit_amount]": String(amountMinor),
    "line_items[0][price_data][product_data][name]": "Servicios de limpieza Reludcir",
    "metadata[order_reference]": orderReference,
    "payment_intent_data[metadata][order_reference]": orderReference,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: AbortSignal.timeout(12_000),
  });

  const payload = (await response.json()) as
    | StripeCheckoutSession
    | { error?: { message?: string } };
  if (!response.ok || !("id" in payload)) {
    const message =
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "Stripe no pudo iniciar el pago.";
    throw new Error(message);
  }

  return {
    configured: true as const,
    sessionId: payload.id,
    checkoutUrl: payload.url,
  };
}

export async function expireStripeCheckoutSession(sessionId: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !sessionId) return false;

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function createStripeRefund({
  paymentIntentId,
  amountMinor,
  idempotencyKey,
  paymentOperationId,
}: {
  paymentIntentId: string;
  amountMinor: number;
  idempotencyKey: string;
  paymentOperationId: number;
}) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { configured: false as const };

  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: new URLSearchParams({
      payment_intent: paymentIntentId,
      amount: String(amountMinor),
      reason: "requested_by_customer",
      "metadata[reludcir_payment_operation_id]": String(paymentOperationId),
      "metadata[reludcir_idempotency_key]": idempotencyKey,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json()) as
    | StripeRefund
    | { error?: { message?: string } };
  if (!response.ok || !("id" in payload)) {
    throw new Error(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "Stripe no pudo procesar el reembolso.",
    );
  }
  return {
    configured: true as const,
    refundId: payload.id,
    status: payload.status ?? "pending",
  };
}

export async function getStripeRefund(refundId: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { configured: false as const };

  const response = await fetch(
    `https://api.stripe.com/v1/refunds/${encodeURIComponent(refundId)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const payload = (await response.json()) as
    | StripeRefund
    | { error?: { message?: string } };
  if (!response.ok || !("id" in payload)) {
    throw new Error(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "Stripe no pudo consultar el reembolso.",
    );
  }
  return {
    configured: true as const,
    refundId: payload.id,
    status: payload.status ?? "pending",
  };
}
