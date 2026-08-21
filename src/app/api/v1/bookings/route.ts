import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  agents,
  availabilityRules,
  bookingAssignments,
  bookingOrders,
  bookings,
  bookingStatusEvents,
  districts,
  idempotencyKeys,
  notificationOutbox,
  payments,
  scheduleExceptions,
  servicePackages,
  services,
} from "@/db/schema";
import { apiError, normalizeEmail, normalizePeruvianPhone, postgresErrorCode } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { attachGuestBookingClaim } from "@/lib/booking-claims";
import { expireStaleBookingOrders } from "@/lib/booking-expiration";
import { createStripeCheckout, expireStripeCheckoutSession } from "@/lib/payments";
import { calculateBookingPrice, isPackageHours } from "@/lib/pricing";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";
import { buildRecurrenceOccurrences } from "@/lib/recurrence";
import { agentRulesCoverSchedule, buildScheduleOccurrences } from "@/lib/scheduling";

type BookingResponseBody = {
  id: string;
  bookingId: number;
  bookingIds: string[];
  visits: number;
  total: string;
  currency: "PEN";
  expiresAt: string;
  confirmationCode: string;
  status: "pending_payment";
  payment: {
    method: "card" | "yape" | "transfer";
    status: string;
    checkoutUrl?: string;
    instructions?: string;
  };
};

const bookingSchema = z.object({
  districtId: z.number().int().positive(),
  serviceId: z.union([z.literal(5), z.literal(7)]),
  durationHours: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(0[7-9]|1\d):00$/),
  staffId: z.number().int().positive(),
  timezone: z.literal("America/Lima").optional().default("America/Lima"),
  paymentMethod: z.enum(["card", "yape", "transfer"]),
  recurrence: z
    .object({
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      times: z
        .array(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6),
            time: z.string().regex(/^(0[7-9]|1\d):00$/),
          }),
        )
        .min(1)
        .max(7),
      startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
  customer: z.object({
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(24),
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(100),
    address: z.string().trim().min(8).max(300),
    interior: z.string().trim().max(80).optional().default(""),
  }),
}).superRefine((value, context) => {
  if (value.serviceId === 7 && !value.recurrence) {
    context.addIssue({ code: "custom", message: "La recurrencia es obligatoria." });
  }
  if (value.serviceId === 5 && value.recurrence) {
    context.addIssue({ code: "custom", message: "El servicio único no admite recurrencia." });
  }
  if (value.recurrence) {
    const uniqueDays = new Set(value.recurrence.weekdays);
    const configuredDays = new Set(value.recurrence.times.map((item) => item.dayOfWeek));
    if (
      uniqueDays.size !== value.recurrence.weekdays.length ||
      configuredDays.size !== uniqueDays.size ||
      [...uniqueDays].some((day) => !configuredDays.has(day)) ||
      value.recurrence.endsOn < value.recurrence.startsOn
    ) {
      context.addIssue({ code: "custom", message: "La recurrencia no es válida." });
    }
  }
});

class BookingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function parseScheduledStart(date: string, time: string) {
  const value = new Date(`${date}T${time}:00-05:00`);
  if (Number.isNaN(value.getTime())) {
    throw new BookingRequestError("La fecha seleccionada no es válida.", 422, "INVALID_DATE");
  }

  const minimumStart = Date.now() + 10 * 60 * 60 * 1000;
  const maximumStart = Date.now() + 180 * 24 * 60 * 60 * 1000;
  if (value.getTime() < minimumStart || value.getTime() > maximumStart) {
    throw new BookingRequestError(
      "Selecciona una fecha disponible dentro de los próximos seis meses.",
      422,
      "DATE_OUT_OF_RANGE",
    );
  }

  return value;
}

function buildOccurrenceStarts(data: z.infer<typeof bookingSchema>): Date[] {
  if (data.serviceId === 5 || !data.recurrence) {
    return [parseScheduledStart(data.date, data.time)];
  }

  const rangeStart = new Date(`${data.recurrence.startsOn}T12:00:00-05:00`);
  const rangeEnd = new Date(`${data.recurrence.endsOn}T12:00:00-05:00`);
  if (
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    rangeEnd.getTime() - rangeStart.getTime() > 180 * 24 * 60 * 60 * 1000
  ) {
    throw new BookingRequestError(
      "El periodo recurrente debe estar dentro de los próximos seis meses.",
      422,
      "RECURRENCE_OUT_OF_RANGE",
    );
  }

  const occurrences = buildRecurrenceOccurrences(data.recurrence, 60);
  const starts = occurrences.map((occurrence) =>
    parseScheduledStart(occurrence.date, occurrence.time),
  );

  if (starts.length < 2) {
    throw new BookingRequestError(
      "Un servicio recurrente debe incluir al menos dos visitas.",
      422,
      "TOO_FEW_VISITS",
    );
  }

  const selectedStart = parseScheduledStart(data.date, data.time);
  if (selectedStart.getTime() !== starts[0]?.getTime()) {
    throw new BookingRequestError(
      "La primera visita debe coincidir con el calendario recurrente.",
      422,
      "RECURRENCE_FIRST_VISIT_MISMATCH",
    );
  }

  return starts;
}

function manualPaymentInstructions(
  method: "yape" | "transfer",
  reference: string,
  amount: string,
) {
  const contact = process.env.WHATSAPP_CONTACT_NUMBER ?? "+51 994 358 300";
  if (method === "yape") {
    const number = process.env.YAPE_NUMBER;
    const holder = process.env.YAPE_HOLDER;
    return number
      ? `Yapea S/ ${amount} al ${number}${holder ? ` (${holder})` : ""}. Incluye ${reference} y envía la constancia al ${contact}.`
      : `Solicita los datos de Yape por WhatsApp al ${contact} e indica el pedido ${reference}.`;
  }

  const bank = process.env.BANK_NAME;
  const account = process.env.BANK_ACCOUNT;
  const cci = process.env.BANK_CCI;
  const holder = process.env.BANK_HOLDER;
  return bank && (account || cci)
    ? `Transfiere S/ ${amount} a ${bank}${account ? `, cuenta ${account}` : ""}${cci ? `, CCI ${cci}` : ""}${holder ? `, titular ${holder}` : ""}. Usa ${reference} y envía la constancia al ${contact}.`
    : `Solicita los datos bancarios por WhatsApp al ${contact} e indica el pedido ${reference}.`;
}

async function releaseFailedCardHold(input: {
  orderId: number;
  paymentId: number;
  bookingIds: number[];
  claimedKeyId: number;
  reason: string;
}) {
  const now = new Date();
  await getDb().transaction(async (transaction) => {
    await transaction
      .update(bookingAssignments)
      .set({ status: "cancelled", releasedAt: now, updatedAt: now })
      .where(
        and(
          inArray(bookingAssignments.bookingId, input.bookingIds),
          eq(bookingAssignments.status, "assigned"),
        ),
      );
    await transaction
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: input.reason,
        updatedAt: now,
      })
      .where(
        and(
          inArray(bookings.id, input.bookingIds),
          eq(bookings.status, "pending_payment"),
        ),
      );
    await transaction
      .update(bookingOrders)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(bookingOrders.id, input.orderId),
          eq(bookingOrders.status, "pending_payment"),
        ),
      );
    await transaction
      .update(payments)
      .set({ status: "failed", updatedAt: now })
      .where(eq(payments.id, input.paymentId));
    await transaction.insert(bookingStatusEvents).values(
      input.bookingIds.map((bookingId) => ({
        bookingId,
        fromStatus: "pending_payment",
        toStatus: "cancelled",
        reason: input.reason,
      })),
    );
    await transaction
      .delete(idempotencyKeys)
      .where(eq(idempotencyKeys.id, input.claimedKeyId));
  });
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return apiError(
      "Falta una clave de idempotencia válida.",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  }

  const rawBody = await request.text();
  const parsed = bookingSchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody) as unknown;
      } catch {
        return null;
      }
    })(),
  );

  if (!parsed.success) {
    return apiError(
      "Revisa la ubicación, el horario y tus datos de contacto.",
      422,
      "INVALID_BOOKING",
    );
  }

  const authenticatedUser = await getAuthenticatedUser().catch(() => null);
  const requestHash = createHash("sha256").update(rawBody).digest("hex");
  const data = parsed.data;

  if (data.paymentMethod === "card" && !process.env.STRIPE_SECRET_KEY) {
    return apiError(
      "El pago con tarjeta no está disponible temporalmente.",
      503,
      "PAYMENT_UNAVAILABLE",
    );
  }
  if (
    data.paymentMethod === "card" &&
    process.env.NODE_ENV === "production" &&
    !process.env.NEXT_PUBLIC_SITE_URL
  ) {
    return apiError(
      "El pago con tarjeta no está configurado correctamente.",
      503,
      "PAYMENT_UNAVAILABLE",
    );
  }

  try {
    const [replay] = await getDb()
      .select({
        requestHash: idempotencyKeys.requestHash,
        responseStatus: idempotencyKeys.responseStatus,
        responseBody: idempotencyKeys.responseBody,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.scope, "booking:create"),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        return apiError(
          "La clave de idempotencia ya fue usada con otros datos.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      }
      if (!replay.responseBody || !replay.responseStatus) {
        return apiError(
          "La reserva ya se está procesando.",
          409,
          "BOOKING_IN_PROGRESS",
        );
      }
      const response = NextResponse.json(replay.responseBody, {
        status: replay.responseStatus,
      });
      if (!authenticatedUser && replay.responseStatus < 400) {
        const replayBody = replay.responseBody as unknown as BookingResponseBody;
        await attachGuestBookingClaim(
          response,
          replayBody.id,
          replayBody.confirmationCode,
        );
      }
      return response;
    }

    const bookingLimitMessage =
      "Alcanzaste el límite de pedidos pendientes. Completa el pago o inténtalo más tarde.";
    if (authenticatedUser) {
      const userLimit = await consumeRateLimit(
        "booking:create:user",
        String(authenticatedUser.id),
        5,
        2 * 60 * 60 * 1_000,
      );
      if (!userLimit.allowed) {
        return rateLimitError(userLimit, bookingLimitMessage);
      }
    } else {
      const ipLimit = await consumeRateLimit(
        "booking:create:ip",
        getClientIp(request),
        2,
        2 * 60 * 60 * 1_000,
      );
      if (!ipLimit.allowed) {
        return rateLimitError(ipLimit, bookingLimitMessage);
      }
      const emailLimit = await consumeRateLimit(
        "booking:create:email",
        normalizeEmail(data.customer.email),
        2,
        2 * 60 * 60 * 1_000,
      );
      if (!emailLimit.allowed) {
        return rateLimitError(emailLimit, bookingLimitMessage);
      }
      const phoneLimit = await consumeRateLimit(
        "booking:create:phone",
        normalizePeruvianPhone(data.customer.phone),
        2,
        2 * 60 * 60 * 1_000,
      );
      if (!phoneLimit.allowed) {
        return rateLimitError(phoneLimit, bookingLimitMessage);
      }
    }

    await expireStaleBookingOrders();

    const result = await getDb().transaction(async (transaction) => {
      const [claimedKey] = await transaction
        .insert(idempotencyKeys)
        .values({
          scope: "booking:create",
          idempotencyKey,
          requestHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .onConflictDoNothing()
        .returning({ id: idempotencyKeys.id });

      if (!claimedKey) {
        const [existing] = await transaction
          .select({
            requestHash: idempotencyKeys.requestHash,
            responseStatus: idempotencyKeys.responseStatus,
            responseBody: idempotencyKeys.responseBody,
          })
          .from(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.scope, "booking:create"),
              eq(idempotencyKeys.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);

        if (!existing || !existing.responseBody || !existing.responseStatus) {
          throw new BookingRequestError(
            "La reserva ya se está procesando.",
            409,
            "BOOKING_IN_PROGRESS",
          );
        }
        if (existing.requestHash !== requestHash) {
          throw new BookingRequestError(
            "La clave de idempotencia ya fue usada con otros datos.",
            409,
            "IDEMPOTENCY_CONFLICT",
          );
        }

        return {
          cached: true as const,
          body: existing.responseBody,
          status: existing.responseStatus,
        };
      }

      const mode = data.serviceId === 7 ? "recurring" : "one_time";

      if (!isPackageHours(data.durationHours)) {
        throw new BookingRequestError("Duración no disponible.", 422, "INVALID_DURATION");
      }

      const occurrenceStarts = buildOccurrenceStarts(data);
      const schedule = buildScheduleOccurrences(occurrenceStarts, data.durationHours);
      const occurrenceEnds = schedule.map((occurrence) => occurrence.end);

      const [[district], [agent], [catalogPackage]] = await Promise.all([
        transaction
          .select({ id: districts.id, name: districts.name })
          .from(districts)
          .where(and(eq(districts.id, data.districtId), eq(districts.isActive, true)))
          .limit(1),
        transaction
          .select({ id: agents.id, name: agents.firstName })
          .from(agents)
          .where(and(eq(agents.id, data.staffId), eq(agents.isActive, true)))
          .limit(1),
        transaction
          .select({
            id: servicePackages.id,
            serviceId: services.id,
            packageName: servicePackages.name,
          })
          .from(servicePackages)
          .innerJoin(services, eq(servicePackages.serviceId, services.id))
          .where(
            and(
              eq(services.slug, "limpieza-hogar"),
              eq(services.isActive, true),
              eq(servicePackages.durationMinutes, data.durationHours * 60),
              eq(servicePackages.isActive, true),
            ),
          )
          .limit(1),
      ]);

      if (!district) {
        throw new BookingRequestError("El distrito no está disponible.", 422, "DISTRICT_UNAVAILABLE");
      }
      if (!agent) {
        throw new BookingRequestError("El agente no está disponible.", 422, "AGENT_UNAVAILABLE");
      }
      if (!catalogPackage) {
        throw new BookingRequestError("El servicio no está disponible.", 422, "SERVICE_UNAVAILABLE");
      }

      const overlapConditions = schedule.map((occurrence) =>
        and(
          lt(scheduleExceptions.startsAt, occurrence.end),
          gt(scheduleExceptions.endsAt, occurrence.start),
        ),
      );
      const [rules, unavailableExceptions] = await Promise.all([
        transaction
          .select({
            agentId: availabilityRules.agentId,
            districtId: availabilityRules.districtId,
            dayOfWeek: availabilityRules.dayOfWeek,
            startsAt: availabilityRules.startsAt,
            endsAt: availabilityRules.endsAt,
            validFrom: availabilityRules.validFrom,
            validUntil: availabilityRules.validUntil,
          })
          .from(availabilityRules)
          .where(
            and(
              eq(availabilityRules.agentId, agent.id),
              eq(availabilityRules.isActive, true),
              or(
                isNull(availabilityRules.districtId),
                eq(availabilityRules.districtId, district.id),
              ),
            ),
          ),
        transaction
          .select({ id: scheduleExceptions.id })
          .from(scheduleExceptions)
          .where(
            and(
              eq(scheduleExceptions.agentId, agent.id),
              eq(scheduleExceptions.kind, "unavailable"),
              or(...overlapConditions),
            ),
          )
          .limit(1),
      ]);

      if (
        unavailableExceptions.length > 0 ||
        !agentRulesCoverSchedule(rules, agent.id, district.id, schedule)
      ) {
        throw new BookingRequestError(
          "El agente no está disponible para todo el horario seleccionado.",
          409,
          "AGENT_UNAVAILABLE",
        );
      }

      const quote = calculateBookingPrice({
        hours: data.durationHours,
        mode,
        visits: occurrenceStarts.length,
      });
      const unitTotal = quote.unitAmount;
      const orderTotal = quote.totalAmount;
      const customerEmail = normalizeEmail(data.customer.email);
      const customerPhone = normalizePeruvianPhone(data.customer.phone);
      const serviceName =
        mode === "recurring"
          ? "Limpieza por horas [recurrente]"
          : "Limpieza por horas [único]";
      const orderExpiresAt = new Date(
        Date.now() + (data.paymentMethod === "card" ? 31 : 120) * 60 * 1_000,
      );

      const [order] = await transaction
        .insert(bookingOrders)
        .values({
          userId: authenticatedUser?.id ?? null,
          customerName: `${data.customer.firstName} ${data.customer.lastName}`,
          customerEmail,
          customerPhoneE164: customerPhone,
          status: "pending_payment",
          subtotal: orderTotal,
          total: orderTotal,
          currency: "PEN",
          expiresAt: orderExpiresAt,
        })
        .returning({
          id: bookingOrders.id,
          reference: bookingOrders.reference,
        });

      if (!order) {
        throw new Error("No se pudo crear la orden.");
      }

      const recurrenceGroupId = mode === "recurring" ? randomUUID() : null;
      const createdBookings = await transaction
        .insert(bookings)
        .values(
          occurrenceStarts.map((scheduledStart, index) => ({
            orderId: order.id,
            userId: authenticatedUser?.id ?? null,
            serviceId: catalogPackage.serviceId,
            servicePackageId: catalogPackage.id,
            districtId: district.id,
            status: "pending_payment",
            bookingMode: mode,
            recurrenceGroupId,
            scheduledStart,
            originalScheduledStart: scheduledStart,
            refundEligibleUntil: new Date(
              scheduledStart.getTime() - 24 * 60 * 60 * 1_000,
            ),
            scheduledEnd: occurrenceEnds[index]!,
            serviceNameSnapshot: serviceName,
            packageNameSnapshot: catalogPackage.packageName,
            durationMinutesSnapshot: data.durationHours * 60,
            unitPriceSnapshot: unitTotal,
            totalPriceSnapshot: unitTotal,
            currency: "PEN",
            addressSnapshot: {
              address: data.customer.address,
              interior: data.customer.interior,
              district: district.name,
              districtId: district.id,
            },
            recurrenceSnapshot: mode === "recurring" ? data.recurrence : null,
          })),
        )
        .returning({ id: bookings.id, publicId: bookings.publicId });

      const firstBooking = createdBookings[0];
      if (!firstBooking || createdBookings.length !== occurrenceStarts.length) {
        throw new Error("No se pudo crear la reserva.");
      }

      await transaction.insert(bookingAssignments).values(
        createdBookings.map((booking, index) => ({
          bookingId: booking.id,
          agentId: agent.id,
          status: "assigned",
          startsAt: occurrenceStarts[index]!,
          endsAt: occurrenceEnds[index]!,
        })),
      );

      const [payment] = await transaction
        .insert(payments)
        .values({
          orderId: order.id,
          provider:
            data.paymentMethod === "card"
              ? "stripe"
              : data.paymentMethod === "transfer"
                ? "bank_transfer"
                : "yape",
          methodType: data.paymentMethod,
          status: "pending",
          amount: orderTotal,
          currency: "PEN",
          metadata: {
            bookingPublicIds: createdBookings.map((booking) => booking.publicId),
            visits: createdBookings.length,
          },
        })
        .returning({ id: payments.id });

      if (!payment) {
        throw new Error("No se pudo crear el pago.");
      }

      await transaction.insert(bookingStatusEvents).values(
        createdBookings.map((booking) => ({
          bookingId: booking.id,
          actorUserId: authenticatedUser?.id ?? null,
          toStatus: "pending_payment",
          reason: "Reserva creada desde el sitio web",
        })),
      );

      if (data.paymentMethod !== "card") {
        await transaction.insert(notificationOutbox).values([
          {
            userId: authenticatedUser?.id ?? null,
            bookingId: firstBooking.id,
            channel: "email",
            templateKey: "booking-created",
            recipient: customerEmail,
            deduplicationKey: `booking-created:email:${firstBooking.publicId}`,
            payload: { reference: order.reference, visits: createdBookings.length },
          },
          {
            userId: authenticatedUser?.id ?? null,
            bookingId: firstBooking.id,
            channel: "whatsapp",
            templateKey: "booking-created",
            recipient: customerPhone,
            deduplicationKey: `booking-created:whatsapp:${firstBooking.publicId}`,
            payload: { reference: order.reference, visits: createdBookings.length },
          },
        ]);
      }

      const responseBody: BookingResponseBody = {
        id: firstBooking.publicId,
        bookingId: firstBooking.id,
        bookingIds: createdBookings.map((booking) => booking.publicId),
        visits: createdBookings.length,
        total: orderTotal,
        currency: "PEN",
        expiresAt: orderExpiresAt.toISOString(),
        confirmationCode: order.reference,
        status: "pending_payment",
        payment: { method: data.paymentMethod, status: "pending" },
      };

      return {
        cached: false as const,
        body: responseBody,
        status: 201,
        claimedKeyId: claimedKey.id,
        paymentId: payment.id,
        orderId: order.id,
        bookingInternalIds: createdBookings.map((booking) => booking.id),
        firstBookingId: firstBooking.id,
        amountMinor: quote.totalAmountMinor,
        customerEmail,
        customerPhone,
        orderReference: order.reference,
      };
    });

    if (result.cached) {
      const response = NextResponse.json(result.body, { status: result.status });
      if (!authenticatedUser && result.status < 400) {
        const cachedBody = result.body as unknown as BookingResponseBody;
        await attachGuestBookingClaim(
          response,
          cachedBody.id,
          cachedBody.confirmationCode,
        );
      }
      return response;
    }

    let responseBody: BookingResponseBody = result.body;
    if (data.paymentMethod === "card") {
      let checkoutSessionId: string | null = null;
      try {
        const checkoutOrigin = (
          process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
        ).replace(/\/$/, "");
        const checkout = await createStripeCheckout({
          amountMinor: result.amountMinor,
          customerEmail: result.customerEmail,
          orderReference: result.orderReference,
          origin: checkoutOrigin,
          expiresAt: new Date(responseBody.expiresAt),
        });

        if (!checkout.configured) {
          throw new Error("Stripe no devolvió una sesión de pago utilizable.");
        }
        checkoutSessionId = checkout.sessionId;
        if (!checkout.checkoutUrl) {
          throw new Error("Stripe no devolvió una URL de pago utilizable.");
        }
        responseBody = {
          ...responseBody,
          payment: {
            method: "card",
            status: "requires_action",
            checkoutUrl: checkout.checkoutUrl,
          },
        };

        await getDb().transaction(async (transaction) => {
          await transaction
            .update(payments)
            .set({
              providerPaymentId: checkout.sessionId,
              status: "requires_action",
              updatedAt: new Date(),
            })
            .where(eq(payments.id, result.paymentId));
          await transaction.insert(notificationOutbox).values([
            {
              userId: authenticatedUser?.id ?? null,
              bookingId: result.firstBookingId,
              channel: "email",
              templateKey: "booking-created",
              recipient: result.customerEmail,
              deduplicationKey: `booking-created:email:${responseBody.id}`,
              payload: {
                reference: result.orderReference,
                visits: responseBody.visits,
              },
            },
            {
              userId: authenticatedUser?.id ?? null,
              bookingId: result.firstBookingId,
              channel: "whatsapp",
              templateKey: "booking-created",
              recipient: result.customerPhone,
              deduplicationKey: `booking-created:whatsapp:${responseBody.id}`,
              payload: {
                reference: result.orderReference,
                visits: responseBody.visits,
              },
            },
          ]);
          await transaction
            .update(idempotencyKeys)
            .set({
              responseStatus: result.status,
              responseBody,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
            })
            .where(eq(idempotencyKeys.id, result.claimedKeyId));
        });
      } catch (checkoutError) {
        console.error("Stripe checkout creation failed", checkoutError);
        if (checkoutSessionId) {
          await expireStripeCheckoutSession(checkoutSessionId);
        }
        try {
          await releaseFailedCardHold({
            orderId: result.orderId,
            paymentId: result.paymentId,
            bookingIds: result.bookingInternalIds,
            claimedKeyId: result.claimedKeyId,
            reason: "No se pudo iniciar el pago con tarjeta",
          });
        } catch (releaseError) {
          console.error("Failed to release card booking hold", releaseError);
        }
        return apiError(
          "No pudimos iniciar el pago con tarjeta. El horario no quedó reservado; inténtalo nuevamente.",
          503,
          "PAYMENT_UNAVAILABLE",
        );
      }
    } else {
      responseBody = {
        ...responseBody,
        payment: {
          method: data.paymentMethod,
          status: "pending",
          instructions:
            manualPaymentInstructions(
              data.paymentMethod,
              result.orderReference,
              responseBody.total,
            ),
        },
      };
      await getDb()
        .update(idempotencyKeys)
        .set({
          responseStatus: result.status,
          responseBody,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        })
        .where(eq(idempotencyKeys.id, result.claimedKeyId));
    }

    const response = NextResponse.json(responseBody, { status: result.status });
    if (!authenticatedUser) {
      await attachGuestBookingClaim(
        response,
        responseBody.id,
        responseBody.confirmationCode,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof BookingRequestError) {
      return apiError(error.message, error.status, error.code);
    }

    if (postgresErrorCode(error) === "23P01") {
      return apiError(
        "Ese agente acaba de ser reservado para el horario seleccionado. Elige otro horario o agente.",
        409,
        "SCHEDULE_CONFLICT",
      );
    }

    console.error("Booking creation failed", error);
    return apiError("No pudimos completar la reserva.", 500, "INTERNAL_ERROR");
  }
}
