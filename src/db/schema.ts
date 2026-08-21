import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

type JsonObject = Record<string, unknown>;

const id = () =>
  bigint("id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").default("customer").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique_idx").on(sql`lower(${table.email})`),
    check(
      "users_role_check",
      sql`${table.role} in ('customer', 'agent', 'admin', 'support')`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
    check("sessions_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique_idx").on(table.tokenHash),
    index("password_reset_tokens_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
    check(
      "password_reset_tokens_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "password_reset_tokens_used_at_check",
      sql`${table.usedAt} is null or ${table.usedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: bigint("user_id", { mode: "number" })
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phoneE164: text("phone_e164"),
    marketingConsent: boolean("marketing_consent").default(false).notNull(),
    marketingConsentAt: timestamp("marketing_consent_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("customer_profiles_phone_idx").on(table.phoneE164)],
);

export const districts = pgTable(
  "districts",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    province: text("province").default("Lima").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    currency: char("currency", { length: 3 }).default("PEN").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("districts_slug_unique_idx").on(table.slug),
    index("districts_active_name_idx").on(table.isActive, table.name),
    check("districts_delivery_fee_check", sql`${table.deliveryFee} >= 0`),
    check("districts_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: id(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customerProfiles.userId, { onDelete: "cascade" }),
    districtId: bigint("district_id", { mode: "number" })
      .notNull()
      .references(() => districts.id, { onDelete: "restrict" }),
    label: text("label").default("Casa").notNull(),
    addressLine: text("address_line").notNull(),
    apartment: text("apartment"),
    reference: text("reference"),
    googlePlaceId: text("google_place_id"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("addresses_customer_id_idx").on(table.customerId),
    index("addresses_district_id_idx").on(table.districtId),
    uniqueIndex("addresses_one_default_per_customer_idx")
      .on(table.customerId)
      .where(sql`${table.isDefault} = true`),
    check(
      "addresses_latitude_check",
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      "addresses_longitude_check",
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
  ],
);

export const services = pgTable(
  "services",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").default("home").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("services_slug_unique_idx").on(table.slug),
    index("services_active_category_idx").on(table.isActive, table.category),
    check("services_category_check", sql`${table.category} in ('home', 'business')`),
  ],
);

export const servicePackages = pgTable(
  "service_packages",
  {
    id: id(),
    serviceId: bigint("service_id", { mode: "number" })
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    maxAreaSqm: integer("max_area_sqm"),
    oneTimePrice: numeric("one_time_price", { precision: 10, scale: 2 }).notNull(),
    recurringPrice: numeric("recurring_price", { precision: 10, scale: 2 }),
    currency: char("currency", { length: 3 }).default("PEN").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("service_packages_service_slug_unique_idx").on(
      table.serviceId,
      table.slug,
    ),
    index("service_packages_service_active_idx").on(table.serviceId, table.isActive),
    check("service_packages_duration_check", sql`${table.durationMinutes} > 0`),
    check(
      "service_packages_area_check",
      sql`${table.maxAreaSqm} is null or ${table.maxAreaSqm} > 0`,
    ),
    check("service_packages_one_time_price_check", sql`${table.oneTimePrice} >= 0`),
    check(
      "service_packages_recurring_price_check",
      sql`${table.recurringPrice} is null or ${table.recurringPrice} >= 0`,
    ),
    check("service_packages_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: id(),
    slug: text("slug").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    profession: text("profession").default("Agente de Limpieza").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    ratingCount: integer("rating_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("agents_slug_unique_idx").on(table.slug),
    index("agents_active_rating_idx").on(table.isActive, table.rating),
    check("agents_rating_range_check", sql`${table.rating} is null or ${table.rating} between 0 and 5`),
    check("agents_rating_count_check", sql`${table.ratingCount} >= 0`),
    check(
      "agents_rating_consistency_check",
      sql`(${table.rating} is null and ${table.ratingCount} = 0) or (${table.rating} is not null and ${table.ratingCount} > 0)`,
    ),
  ],
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id(),
    agentId: bigint("agent_id", { mode: "number" })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    districtId: bigint("district_id", { mode: "number" }).references(
      () => districts.id,
      { onDelete: "cascade" },
    ),
    dayOfWeek: smallint("day_of_week").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    validFrom: date("valid_from", { mode: "date" }),
    validUntil: date("valid_until", { mode: "date" }),
    timezone: text("timezone").default("America/Lima").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("availability_rules_agent_district_day_time_unique_idx").on(
      table.agentId,
      table.districtId,
      table.dayOfWeek,
      table.startsAt,
      table.endsAt,
    ),
    index("availability_rules_agent_day_idx").on(
      table.agentId,
      table.dayOfWeek,
      table.startsAt,
    ),
    index("availability_rules_district_id_idx").on(table.districtId),
    index("availability_rules_active_idx")
      .on(table.agentId, table.dayOfWeek)
      .where(sql`${table.isActive} = true`),
    check("availability_rules_day_check", sql`${table.dayOfWeek} between 0 and 6`),
    check("availability_rules_time_check", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "availability_rules_dates_check",
      sql`${table.validUntil} is null or ${table.validFrom} is null or ${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
);

export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: id(),
    agentId: bigint("agent_id", { mode: "number" })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: text("kind").default("unavailable").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (table) => [
    index("schedule_exceptions_agent_range_idx").on(
      table.agentId,
      table.startsAt,
      table.endsAt,
    ),
    check("schedule_exceptions_kind_check", sql`${table.kind} in ('available', 'unavailable')`),
    check("schedule_exceptions_range_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const bookingOrders = pgTable(
  "booking_orders",
  {
    id: id(),
    publicId: uuid("public_id").defaultRandom().notNull(),
    reference: text("reference")
      .default(
        sql`('RLD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))`,
      )
      .notNull(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhoneE164: text("customer_phone_e164").notNull(),
    status: text("status").default("draft").notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).default("0.00").notNull(),
    discountTotal: numeric("discount_total", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    total: numeric("total", { precision: 10, scale: 2 }).default("0.00").notNull(),
    currency: char("currency", { length: 3 }).default("PEN").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("booking_orders_public_id_unique_idx").on(table.publicId),
    uniqueIndex("booking_orders_reference_unique_idx").on(table.reference),
    index("booking_orders_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("booking_orders_status_created_idx").on(table.status, table.createdAt),
    check(
      "booking_orders_status_check",
      sql`${table.status} in ('draft', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'expired')`,
    ),
    check(
      "booking_orders_amounts_check",
      sql`${table.subtotal} >= 0 and ${table.discountTotal} >= 0 and ${table.total} >= 0 and ${table.discountTotal} <= ${table.subtotal}`,
    ),
    check("booking_orders_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    publicId: uuid("public_id").defaultRandom().notNull(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => bookingOrders.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    serviceId: bigint("service_id", { mode: "number" })
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    servicePackageId: bigint("service_package_id", { mode: "number" })
      .notNull()
      .references(() => servicePackages.id, { onDelete: "restrict" }),
    districtId: bigint("district_id", { mode: "number" })
      .notNull()
      .references(() => districts.id, { onDelete: "restrict" }),
    addressId: bigint("address_id", { mode: "number" }).references(
      () => addresses.id,
      { onDelete: "set null" },
    ),
    status: text("status").default("pending_payment").notNull(),
    bookingMode: text("booking_mode").default("one_time").notNull(),
    recurrenceGroupId: uuid("recurrence_group_id"),
    scheduledStart: timestamp("scheduled_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    originalScheduledStart: timestamp("original_scheduled_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    refundEligibleUntil: timestamp("refund_eligible_until", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    scheduledEnd: timestamp("scheduled_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    packageNameSnapshot: text("package_name_snapshot").notNull(),
    durationMinutesSnapshot: integer("duration_minutes_snapshot").notNull(),
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 10,
      scale: 2,
    }).notNull(),
    totalPriceSnapshot: numeric("total_price_snapshot", {
      precision: 10,
      scale: 2,
    }).notNull(),
    currency: char("currency", { length: 3 }).default("PEN").notNull(),
    addressSnapshot: jsonb("address_snapshot").$type<JsonObject>().notNull(),
    recurrenceSnapshot: jsonb("recurrence_snapshot").$type<JsonObject>(),
    customerNotes: text("customer_notes"),
    rescheduleCount: integer("reschedule_count").default(0).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancellationReason: text("cancellation_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("bookings_public_id_unique_idx").on(table.publicId),
    index("bookings_order_id_idx").on(table.orderId),
    index("bookings_user_status_start_idx").on(
      table.userId,
      table.status,
      table.scheduledStart,
    ),
    index("bookings_district_status_start_idx").on(
      table.districtId,
      table.status,
      table.scheduledStart,
    ),
    index("bookings_package_id_idx").on(table.servicePackageId),
    index("bookings_service_id_idx").on(table.serviceId),
    index("bookings_address_id_idx").on(table.addressId),
    index("bookings_recurrence_group_idx").on(
      table.recurrenceGroupId,
      table.scheduledStart,
    ),
    check(
      "bookings_status_check",
      sql`${table.status} in ('pending_payment', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show')`,
    ),
    check("bookings_mode_check", sql`${table.bookingMode} in ('one_time', 'recurring')`),
    check(
      "bookings_recurrence_check",
      sql`(${table.bookingMode} = 'one_time' and ${table.recurrenceGroupId} is null and ${table.recurrenceSnapshot} is null) or (${table.bookingMode} = 'recurring' and ${table.recurrenceGroupId} is not null and ${table.recurrenceSnapshot} is not null)`,
    ),
    check("bookings_schedule_check", sql`${table.scheduledEnd} > ${table.scheduledStart}`),
    check(
      "bookings_refund_cutoff_check",
      sql`${table.refundEligibleUntil} <= ${table.originalScheduledStart}`,
    ),
    check("bookings_duration_check", sql`${table.durationMinutesSnapshot} > 0`),
    check(
      "bookings_prices_check",
      sql`${table.unitPriceSnapshot} >= 0 and ${table.totalPriceSnapshot} >= 0`,
    ),
    check("bookings_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("bookings_reschedule_count_check", sql`${table.rescheduleCount} >= 0`),
  ],
);

export const bookingAssignments = pgTable(
  "booking_assignments",
  {
    id: id(),
    bookingId: bigint("booking_id", { mode: "number" })
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    agentId: bigint("agent_id", { mode: "number" })
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    status: text("status").default("assigned").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("booking_assignments_booking_id_idx").on(table.bookingId),
    index("booking_assignments_agent_start_idx").on(table.agentId, table.startsAt),
    uniqueIndex("booking_assignments_one_active_per_booking_idx")
      .on(table.bookingId)
      .where(sql`${table.status} in ('assigned', 'confirmed', 'in_progress')`),
    check(
      "booking_assignments_status_check",
      sql`${table.status} in ('assigned', 'confirmed', 'in_progress', 'completed', 'cancelled')`,
    ),
    check("booking_assignments_schedule_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => bookingOrders.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    methodType: text("method_type"),
    status: text("status").default("pending").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    refundedAmount: numeric("refunded_amount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    currency: char("currency", { length: 3 }).default("PEN").notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("payments_order_status_idx").on(table.orderId, table.status),
    index("payments_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("payments_provider_payment_unique_idx")
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    check(
      "payments_provider_check",
      sql`${table.provider} in ('stripe', 'paypal', 'yape', 'bank_transfer')`,
    ),
    check(
      "payments_status_check",
      sql`${table.status} in ('pending', 'requires_action', 'paid', 'failed', 'partially_refunded', 'refunded', 'cancelled')`,
    ),
    check(
      "payments_amounts_check",
      sql`${table.amount} >= 0 and ${table.refundedAmount} >= 0 and ${table.refundedAmount} <= ${table.amount}`,
    ),
    check("payments_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const paymentOperations = pgTable(
  "payment_operations",
  {
    id: id(),
    paymentId: bigint("payment_id", { mode: "number" })
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    operationType: text("operation_type").notNull(),
    source: text("source").notNull(),
    status: text("status").default("pending").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).default("PEN").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    providerOperationId: text("provider_operation_id"),
    metadata: jsonb("metadata").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(8).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payment_operations_idempotency_key_unique_idx").on(
      table.idempotencyKey,
    ),
    uniqueIndex("payment_operations_provider_operation_unique_idx")
      .on(table.providerOperationId)
      .where(sql`${table.providerOperationId} is not null`),
    index("payment_operations_payment_status_idx").on(table.paymentId, table.status),
    index("payment_operations_pending_idx")
      .on(table.availableAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    check(
      "payment_operations_type_check",
      sql`${table.operationType} in ('refund')`,
    ),
    check(
      "payment_operations_source_check",
      sql`${table.source} in ('booking_cancellation', 'late_payment', 'manual', 'external')`,
    ),
    check(
      "payment_operations_status_check",
      sql`${table.status} in ('pending', 'processing', 'completed', 'failed', 'cancelled')`,
    ),
    check("payment_operations_amount_check", sql`${table.amount} > 0`),
    check("payment_operations_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "payment_operations_attempts_check",
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
  ],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").default("received").notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_provider_event_unique_idx").on(
      table.provider,
      table.providerEventId,
    ),
    index("payment_webhook_events_status_received_idx").on(
      table.status,
      table.receivedAt,
    ),
    check(
      "payment_webhook_events_status_check",
      sql`${table.status} in ('received', 'processing', 'processed', 'failed', 'ignored')`,
    ),
    check("payment_webhook_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const bookingStatusEvents = pgTable(
  "booking_status_events",
  {
    id: id(),
    bookingId: bigint("booking_id", { mode: "number" })
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    actorUserId: bigint("actor_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("booking_status_events_booking_created_idx").on(
      table.bookingId,
      table.createdAt,
    ),
    index("booking_status_events_actor_user_id_idx").on(table.actorUserId),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    bookingId: bigint("booking_id", { mode: "number" })
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    reportedByUserId: bigint("reported_by_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    type: text("type").notNull(),
    status: text("status").default("open").notNull(),
    description: text("description").notNull(),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("incidents_booking_status_idx").on(table.bookingId, table.status),
    index("incidents_status_created_idx").on(table.status, table.createdAt),
    index("incidents_reported_by_user_id_idx").on(table.reportedByUserId),
    check(
      "incidents_type_check",
      sql`${table.type} in ('late', 'no_show', 'damage', 'service_quality', 'other')`,
    ),
    check(
      "incidents_status_check",
      sql`${table.status} in ('open', 'investigating', 'resolved', 'dismissed')`,
    ),
  ],
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    bookingId: bigint("booking_id", { mode: "number" }).references(
      () => bookings.id,
      { onDelete: "set null" },
    ),
    channel: text("channel").notNull(),
    templateKey: text("template_key").notNull(),
    recipient: text("recipient").notNull(),
    deduplicationKey: text("deduplication_key"),
    payload: jsonb("payload").$type<JsonObject>().default(sql`'{}'::jsonb`).notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notification_outbox_deduplication_unique_idx")
      .on(table.deduplicationKey)
      .where(sql`${table.deduplicationKey} is not null`),
    index("notification_outbox_pending_idx")
      .on(table.availableAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("notification_outbox_user_id_idx").on(table.userId),
    index("notification_outbox_booking_id_idx").on(table.bookingId),
    check(
      "notification_outbox_channel_check",
      sql`${table.channel} in ('email', 'whatsapp', 'sms')`,
    ),
    check(
      "notification_outbox_status_check",
      sql`${table.status} in ('pending', 'processing', 'sent', 'failed', 'cancelled')`,
    ),
    check(
      "notification_outbox_attempts_check",
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
  ],
);

export const newsletterSubscriptions = pgTable(
  "newsletter_subscriptions",
  {
    id: id(),
    email: text("email").notNull(),
    status: text("status").default("subscribed").notNull(),
    consentSource: text("consent_source").default("website").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("newsletter_subscriptions_email_unique_idx").on(
      sql`lower(${table.email})`,
    ),
    index("newsletter_subscriptions_status_idx").on(table.status),
    check(
      "newsletter_subscriptions_status_check",
      sql`${table.status} in ('pending', 'subscribed', 'unsubscribed')`,
    ),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: id(),
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStart: timestamp("window_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    requestCount: integer("request_count").default(1).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_scope_subject_window_unique_idx").on(
      table.scope,
      table.subjectHash,
      table.windowStart,
    ),
    index("rate_limit_buckets_expires_at_idx").on(table.expiresAt),
    check("rate_limit_buckets_count_check", sql`${table.requestCount} > 0`),
    check(
      "rate_limit_buckets_expiry_check",
      sql`${table.expiresAt} > ${table.windowStart}`,
    ),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<JsonObject>(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_scope_key_unique_idx").on(
      table.scope,
      table.idempotencyKey,
    ),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
    check(
      "idempotency_keys_response_status_check",
      sql`${table.responseStatus} is null or ${table.responseStatus} between 100 and 599`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingOrder = typeof bookingOrders.$inferSelect;
export type NewBookingOrder = typeof bookingOrders.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// The partial GiST exclusion constraint that protects agent schedules lives in
// migrations/0000_initial.sql. Drizzle does not currently model this constraint
// as faithfully as PostgreSQL's native EXCLUDE USING syntax.
