create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists users (
  id bigint generated always as identity,
  email text not null,
  password_hash text,
  role text not null default 'customer',
  is_active boolean not null default true,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_pkey primary key (id),
  constraint users_role_check
    check (role in ('customer', 'agent', 'admin', 'support'))
);

create unique index if not exists users_email_unique_idx
  on users (lower(email));

create table if not exists sessions (
  id bigint generated always as identity,
  user_id bigint not null,
  token_hash text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sessions_pkey primary key (id),
  constraint sessions_user_id_fk
    foreign key (user_id) references users (id) on delete cascade,
  constraint sessions_expiry_check check (expires_at > created_at)
);

create unique index if not exists sessions_token_hash_unique_idx
  on sessions (token_hash);
create index if not exists sessions_user_id_idx
  on sessions (user_id);
create index if not exists sessions_expires_at_idx
  on sessions (expires_at);

create table if not exists password_reset_tokens (
  id bigint generated always as identity,
  user_id bigint not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint password_reset_tokens_pkey primary key (id),
  constraint password_reset_tokens_user_id_fk
    foreign key (user_id) references users (id) on delete cascade,
  constraint password_reset_tokens_expiry_check check (expires_at > created_at),
  constraint password_reset_tokens_used_at_check
    check (used_at is null or used_at >= created_at)
);

create unique index if not exists password_reset_tokens_token_hash_unique_idx
  on password_reset_tokens (token_hash);
create index if not exists password_reset_tokens_user_created_idx
  on password_reset_tokens (user_id, created_at);
create index if not exists password_reset_tokens_expires_at_idx
  on password_reset_tokens (expires_at);

create table if not exists customer_profiles (
  user_id bigint not null,
  first_name text not null,
  last_name text not null,
  phone_e164 text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_profiles_pkey primary key (user_id),
  constraint customer_profiles_user_id_fk
    foreign key (user_id) references users (id) on delete cascade
);

create index if not exists customer_profiles_phone_idx
  on customer_profiles (phone_e164);

create table if not exists districts (
  id bigint generated always as identity,
  slug text not null,
  name text not null,
  province text not null default 'Lima',
  is_active boolean not null default true,
  delivery_fee numeric(10, 2) not null default 0.00,
  currency char(3) not null default 'PEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint districts_pkey primary key (id),
  constraint districts_delivery_fee_check check (delivery_fee >= 0),
  constraint districts_currency_check check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists districts_slug_unique_idx
  on districts (slug);
create index if not exists districts_active_name_idx
  on districts (is_active, name);

create table if not exists addresses (
  id bigint generated always as identity,
  customer_id bigint not null,
  district_id bigint not null,
  label text not null default 'Casa',
  address_line text not null,
  apartment text,
  reference text,
  google_place_id text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addresses_pkey primary key (id),
  constraint addresses_customer_id_fk
    foreign key (customer_id) references customer_profiles (user_id) on delete cascade,
  constraint addresses_district_id_fk
    foreign key (district_id) references districts (id) on delete restrict,
  constraint addresses_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint addresses_longitude_check
    check (longitude is null or longitude between -180 and 180)
);

create index if not exists addresses_customer_id_idx
  on addresses (customer_id);
create index if not exists addresses_district_id_idx
  on addresses (district_id);
create unique index if not exists addresses_one_default_per_customer_idx
  on addresses (customer_id)
  where is_default = true;

create table if not exists services (
  id bigint generated always as identity,
  slug text not null,
  name text not null,
  description text not null,
  category text not null default 'home',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_pkey primary key (id),
  constraint services_category_check check (category in ('home', 'business'))
);

create unique index if not exists services_slug_unique_idx
  on services (slug);
create index if not exists services_active_category_idx
  on services (is_active, category);

create table if not exists service_packages (
  id bigint generated always as identity,
  service_id bigint not null,
  slug text not null,
  name text not null,
  description text,
  duration_minutes integer not null,
  max_area_sqm integer,
  one_time_price numeric(10, 2) not null,
  recurring_price numeric(10, 2),
  currency char(3) not null default 'PEN',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_packages_pkey primary key (id),
  constraint service_packages_service_id_fk
    foreign key (service_id) references services (id) on delete restrict,
  constraint service_packages_duration_check check (duration_minutes > 0),
  constraint service_packages_area_check
    check (max_area_sqm is null or max_area_sqm > 0),
  constraint service_packages_one_time_price_check check (one_time_price >= 0),
  constraint service_packages_recurring_price_check
    check (recurring_price is null or recurring_price >= 0),
  constraint service_packages_currency_check check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists service_packages_service_slug_unique_idx
  on service_packages (service_id, slug);
create index if not exists service_packages_service_active_idx
  on service_packages (service_id, is_active);

create table if not exists agents (
  id bigint generated always as identity,
  slug text not null,
  first_name text not null,
  last_name text,
  profession text not null default 'Agente de Limpieza',
  bio text,
  avatar_url text,
  rating numeric(3, 2),
  rating_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_pkey primary key (id),
  constraint agents_rating_range_check
    check (rating is null or rating between 0 and 5),
  constraint agents_rating_count_check check (rating_count >= 0),
  constraint agents_rating_consistency_check
    check (
      (rating is null and rating_count = 0)
      or (rating is not null and rating_count > 0)
    )
);

create unique index if not exists agents_slug_unique_idx
  on agents (slug);
create index if not exists agents_active_rating_idx
  on agents (is_active, rating);

create table if not exists availability_rules (
  id bigint generated always as identity,
  agent_id bigint not null,
  district_id bigint,
  day_of_week smallint not null,
  starts_at time not null,
  ends_at time not null,
  valid_from date,
  valid_until date,
  timezone text not null default 'America/Lima',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_rules_pkey primary key (id),
  constraint availability_rules_agent_id_fk
    foreign key (agent_id) references agents (id) on delete cascade,
  constraint availability_rules_district_id_fk
    foreign key (district_id) references districts (id) on delete cascade,
  constraint availability_rules_day_check check (day_of_week between 0 and 6),
  constraint availability_rules_time_check check (ends_at > starts_at),
  constraint availability_rules_dates_check
    check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists availability_rules_agent_day_idx
  on availability_rules (agent_id, day_of_week, starts_at);
create unique index if not exists availability_rules_agent_district_day_time_unique_idx
  on availability_rules (agent_id, district_id, day_of_week, starts_at, ends_at);
create index if not exists availability_rules_district_id_idx
  on availability_rules (district_id);
create index if not exists availability_rules_active_idx
  on availability_rules (agent_id, day_of_week)
  where is_active = true;

create table if not exists schedule_exceptions (
  id bigint generated always as identity,
  agent_id bigint not null,
  kind text not null default 'unavailable',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint schedule_exceptions_pkey primary key (id),
  constraint schedule_exceptions_agent_id_fk
    foreign key (agent_id) references agents (id) on delete cascade,
  constraint schedule_exceptions_kind_check
    check (kind in ('available', 'unavailable')),
  constraint schedule_exceptions_range_check check (ends_at > starts_at)
);

create index if not exists schedule_exceptions_agent_range_idx
  on schedule_exceptions (agent_id, starts_at, ends_at);

create table if not exists booking_orders (
  id bigint generated always as identity,
  public_id uuid not null default gen_random_uuid(),
  reference text not null default (
    'RLD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  user_id bigint,
  customer_name text not null,
  customer_email text not null,
  customer_phone_e164 text not null,
  status text not null default 'draft',
  subtotal numeric(10, 2) not null default 0.00,
  discount_total numeric(10, 2) not null default 0.00,
  total numeric(10, 2) not null default 0.00,
  currency char(3) not null default 'PEN',
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_orders_pkey primary key (id),
  constraint booking_orders_user_id_fk
    foreign key (user_id) references users (id) on delete set null,
  constraint booking_orders_status_check
    check (
      status in (
        'draft',
        'pending_payment',
        'confirmed',
        'completed',
        'cancelled',
        'expired'
      )
    ),
  constraint booking_orders_amounts_check
    check (
      subtotal >= 0
      and discount_total >= 0
      and total >= 0
      and discount_total <= subtotal
    ),
  constraint booking_orders_currency_check check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists booking_orders_public_id_unique_idx
  on booking_orders (public_id);
create unique index if not exists booking_orders_reference_unique_idx
  on booking_orders (reference);
create index if not exists booking_orders_user_status_created_idx
  on booking_orders (user_id, status, created_at);
create index if not exists booking_orders_status_created_idx
  on booking_orders (status, created_at);

create table if not exists bookings (
  id bigint generated always as identity,
  public_id uuid not null default gen_random_uuid(),
  order_id bigint not null,
  user_id bigint,
  service_id bigint not null,
  service_package_id bigint not null,
  district_id bigint not null,
  address_id bigint,
  status text not null default 'pending_payment',
  booking_mode text not null default 'one_time',
  recurrence_group_id uuid,
  scheduled_start timestamptz not null,
  original_scheduled_start timestamptz not null,
  refund_eligible_until timestamptz not null,
  scheduled_end timestamptz not null,
  service_name_snapshot text not null,
  package_name_snapshot text not null,
  duration_minutes_snapshot integer not null,
  unit_price_snapshot numeric(10, 2) not null,
  total_price_snapshot numeric(10, 2) not null,
  currency char(3) not null default 'PEN',
  address_snapshot jsonb not null,
  recurrence_snapshot jsonb,
  customer_notes text,
  reschedule_count integer not null default 0,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_pkey primary key (id),
  constraint bookings_order_id_fk
    foreign key (order_id) references booking_orders (id) on delete cascade,
  constraint bookings_user_id_fk
    foreign key (user_id) references users (id) on delete set null,
  constraint bookings_service_id_fk
    foreign key (service_id) references services (id) on delete restrict,
  constraint bookings_service_package_id_fk
    foreign key (service_package_id) references service_packages (id) on delete restrict,
  constraint bookings_district_id_fk
    foreign key (district_id) references districts (id) on delete restrict,
  constraint bookings_address_id_fk
    foreign key (address_id) references addresses (id) on delete set null,
  constraint bookings_status_check
    check (
      status in (
        'pending_payment',
        'confirmed',
        'assigned',
        'in_progress',
        'completed',
        'cancelled',
        'no_show'
      )
    ),
  constraint bookings_mode_check check (booking_mode in ('one_time', 'recurring')),
  constraint bookings_recurrence_check
    check (
      (booking_mode = 'one_time' and recurrence_group_id is null and recurrence_snapshot is null)
      or
      (booking_mode = 'recurring' and recurrence_group_id is not null and recurrence_snapshot is not null)
    ),
  constraint bookings_schedule_check check (scheduled_end > scheduled_start),
  constraint bookings_refund_cutoff_check
    check (refund_eligible_until <= original_scheduled_start),
  constraint bookings_duration_check check (duration_minutes_snapshot > 0),
  constraint bookings_prices_check
    check (unit_price_snapshot >= 0 and total_price_snapshot >= 0),
  constraint bookings_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint bookings_reschedule_count_check check (reschedule_count >= 0)
);

create unique index if not exists bookings_public_id_unique_idx
  on bookings (public_id);
create index if not exists bookings_order_id_idx
  on bookings (order_id);
create index if not exists bookings_user_status_start_idx
  on bookings (user_id, status, scheduled_start);
create index if not exists bookings_district_status_start_idx
  on bookings (district_id, status, scheduled_start);
create index if not exists bookings_package_id_idx
  on bookings (service_package_id);
create index if not exists bookings_service_id_idx
  on bookings (service_id);
create index if not exists bookings_address_id_idx
  on bookings (address_id);
create index if not exists bookings_recurrence_group_idx
  on bookings (recurrence_group_id, scheduled_start);

create table if not exists booking_assignments (
  id bigint generated always as identity,
  booking_id bigint not null,
  agent_id bigint not null,
  status text not null default 'assigned',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_assignments_pkey primary key (id),
  constraint booking_assignments_booking_id_fk
    foreign key (booking_id) references bookings (id) on delete cascade,
  constraint booking_assignments_agent_id_fk
    foreign key (agent_id) references agents (id) on delete restrict,
  constraint booking_assignments_status_check
    check (status in ('assigned', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  constraint booking_assignments_schedule_check check (ends_at > starts_at)
);

create index if not exists booking_assignments_booking_id_idx
  on booking_assignments (booking_id);
create index if not exists booking_assignments_agent_start_idx
  on booking_assignments (agent_id, starts_at);
create unique index if not exists booking_assignments_one_active_per_booking_idx
  on booking_assignments (booking_id)
  where status in ('assigned', 'confirmed', 'in_progress');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_assignments_no_agent_overlap'
      and conrelid = 'booking_assignments'::regclass
  ) then
    alter table booking_assignments
      add constraint booking_assignments_no_agent_overlap
      exclude using gist (
        agent_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status in ('assigned', 'confirmed', 'in_progress'));
  end if;
end
$$;

create table if not exists payments (
  id bigint generated always as identity,
  order_id bigint not null,
  provider text not null,
  provider_payment_id text,
  method_type text,
  status text not null default 'pending',
  amount numeric(10, 2) not null,
  refunded_amount numeric(10, 2) not null default 0.00,
  currency char(3) not null default 'PEN',
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_pkey primary key (id),
  constraint payments_order_id_fk
    foreign key (order_id) references booking_orders (id) on delete restrict,
  constraint payments_provider_check
    check (provider in ('stripe', 'paypal', 'yape', 'bank_transfer')),
  constraint payments_status_check
    check (
      status in (
        'pending',
        'requires_action',
        'paid',
        'failed',
        'partially_refunded',
        'refunded',
        'cancelled'
      )
    ),
  constraint payments_amounts_check
    check (amount >= 0 and refunded_amount >= 0 and refunded_amount <= amount),
  constraint payments_currency_check check (currency ~ '^[A-Z]{3}$')
);

create index if not exists payments_order_status_idx
  on payments (order_id, status);
create index if not exists payments_status_created_idx
  on payments (status, created_at);
create unique index if not exists payments_provider_payment_unique_idx
  on payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists payment_operations (
  id bigint generated always as identity,
  payment_id bigint not null,
  operation_type text not null,
  source text not null,
  status text not null default 'pending',
  amount numeric(10, 2) not null,
  currency char(3) not null default 'PEN',
  idempotency_key text not null,
  provider_operation_id text,
  metadata jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_operations_pkey primary key (id),
  constraint payment_operations_payment_id_fk
    foreign key (payment_id) references payments (id) on delete restrict,
  constraint payment_operations_type_check
    check (operation_type in ('refund')),
  constraint payment_operations_source_check
    check (source in ('booking_cancellation', 'late_payment', 'manual', 'external')),
  constraint payment_operations_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  constraint payment_operations_amount_check check (amount > 0),
  constraint payment_operations_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_operations_attempts_check
    check (attempts >= 0 and max_attempts > 0 and attempts <= max_attempts)
);

create unique index if not exists payment_operations_idempotency_key_unique_idx
  on payment_operations (idempotency_key);
create unique index if not exists payment_operations_provider_operation_unique_idx
  on payment_operations (provider_operation_id)
  where provider_operation_id is not null;
create index if not exists payment_operations_payment_status_idx
  on payment_operations (payment_id, status);
create index if not exists payment_operations_pending_idx
  on payment_operations (available_at, id)
  where status = 'pending';

create table if not exists payment_webhook_events (
  id bigint generated always as identity,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  status text not null default 'received',
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_webhook_events_pkey primary key (id),
  constraint payment_webhook_events_status_check
    check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  constraint payment_webhook_events_attempts_check check (attempts >= 0)
);

create unique index if not exists payment_webhook_events_provider_event_unique_idx
  on payment_webhook_events (provider, provider_event_id);
create index if not exists payment_webhook_events_status_received_idx
  on payment_webhook_events (status, received_at);

create table if not exists booking_status_events (
  id bigint generated always as identity,
  booking_id bigint not null,
  actor_user_id bigint,
  from_status text,
  to_status text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint booking_status_events_pkey primary key (id),
  constraint booking_status_events_booking_id_fk
    foreign key (booking_id) references bookings (id) on delete cascade,
  constraint booking_status_events_actor_user_id_fk
    foreign key (actor_user_id) references users (id) on delete set null
);

create index if not exists booking_status_events_booking_created_idx
  on booking_status_events (booking_id, created_at);
create index if not exists booking_status_events_actor_user_id_idx
  on booking_status_events (actor_user_id);

create table if not exists incidents (
  id bigint generated always as identity,
  booking_id bigint not null,
  reported_by_user_id bigint,
  type text not null,
  status text not null default 'open',
  description text not null,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incidents_pkey primary key (id),
  constraint incidents_booking_id_fk
    foreign key (booking_id) references bookings (id) on delete restrict,
  constraint incidents_reported_by_user_id_fk
    foreign key (reported_by_user_id) references users (id) on delete set null,
  constraint incidents_type_check
    check (type in ('late', 'no_show', 'damage', 'service_quality', 'other')),
  constraint incidents_status_check
    check (status in ('open', 'investigating', 'resolved', 'dismissed'))
);

create index if not exists incidents_booking_status_idx
  on incidents (booking_id, status);
create index if not exists incidents_status_created_idx
  on incidents (status, created_at);
create index if not exists incidents_reported_by_user_id_idx
  on incidents (reported_by_user_id);

create table if not exists notification_outbox (
  id bigint generated always as identity,
  user_id bigint,
  booking_id bigint,
  channel text not null,
  template_key text not null,
  recipient text not null,
  deduplication_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint notification_outbox_pkey primary key (id),
  constraint notification_outbox_user_id_fk
    foreign key (user_id) references users (id) on delete set null,
  constraint notification_outbox_booking_id_fk
    foreign key (booking_id) references bookings (id) on delete set null,
  constraint notification_outbox_channel_check
    check (channel in ('email', 'whatsapp', 'sms')),
  constraint notification_outbox_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  constraint notification_outbox_attempts_check
    check (attempts >= 0 and max_attempts > 0 and attempts <= max_attempts)
);

create unique index if not exists notification_outbox_deduplication_unique_idx
  on notification_outbox (deduplication_key)
  where deduplication_key is not null;
create index if not exists notification_outbox_pending_idx
  on notification_outbox (available_at, id)
  where status = 'pending';
create index if not exists notification_outbox_user_id_idx
  on notification_outbox (user_id);
create index if not exists notification_outbox_booking_id_idx
  on notification_outbox (booking_id);

create table if not exists newsletter_subscriptions (
  id bigint generated always as identity,
  email text not null,
  status text not null default 'subscribed',
  consent_source text not null default 'website',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_subscriptions_pkey primary key (id),
  constraint newsletter_subscriptions_status_check
    check (status in ('pending', 'subscribed', 'unsubscribed'))
);

create unique index if not exists newsletter_subscriptions_email_unique_idx
  on newsletter_subscriptions (lower(email));
create index if not exists newsletter_subscriptions_status_idx
  on newsletter_subscriptions (status);

create table if not exists rate_limit_buckets (
  id bigint generated always as identity,
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_limit_buckets_pkey primary key (id),
  constraint rate_limit_buckets_count_check check (request_count > 0),
  constraint rate_limit_buckets_expiry_check check (expires_at > window_start)
);

create unique index if not exists rate_limit_buckets_scope_subject_window_unique_idx
  on rate_limit_buckets (scope, subject_hash, window_start);
create index if not exists rate_limit_buckets_expires_at_idx
  on rate_limit_buckets (expires_at);

create table if not exists idempotency_keys (
  id bigint generated always as identity,
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint idempotency_keys_pkey primary key (id),
  constraint idempotency_keys_response_status_check
    check (response_status is null or response_status between 100 and 599)
);

create unique index if not exists idempotency_keys_scope_key_unique_idx
  on idempotency_keys (scope, idempotency_key);
create index if not exists idempotency_keys_expires_at_idx
  on idempotency_keys (expires_at);

create or replace function reludcir_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'users',
    'customer_profiles',
    'districts',
    'addresses',
    'services',
    'service_packages',
    'agents',
    'availability_rules',
    'booking_orders',
    'bookings',
    'booking_assignments',
    'payments',
    'payment_operations',
    'incidents',
    'newsletter_subscriptions',
    'rate_limit_buckets'
  ]
  loop
    trigger_name := target_table || '_set_updated_at';

    if not exists (
      select 1
      from pg_trigger
      where tgname = trigger_name
        and tgrelid = ('public.' || target_table)::regclass
        and not tgisinternal
    ) then
      execute format(
        'create trigger %I before update on public.%I '
        || 'for each row execute function reludcir_set_updated_at()',
        trigger_name,
        target_table
      );
    end if;
  end loop;
end
$$;
