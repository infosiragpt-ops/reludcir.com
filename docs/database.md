# Base de datos de Reludcir

La aplicación usa PostgreSQL como fuente de verdad, Drizzle ORM para acceso tipado y migraciones SQL versionadas para cambios de esquema. Los nombres físicos son `snake_case`; la API TypeScript expone propiedades `camelCase`.

## Desarrollo local

Requisitos: Docker, Node.js compatible con el proyecto y pnpm.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

El contenedor local escucha en `localhost:5432`. Las credenciales incluidas son solo para desarrollo; producción debe usar secretos administrados y una contraseña distinta.

La migración inicial también puede inspeccionarse o ejecutarse con `psql`:

```bash
psql "$DATABASE_DIRECT_URL" -1 -v ON_ERROR_STOP=1 -f migrations/0000_initial.sql
```

## Organización del esquema

- Identidad: `users`, `sessions`, `password_reset_tokens`, `customer_profiles`, `addresses`.
- Catálogo: `districts`, `services`, `service_packages`, `agents`.
- Agenda: `availability_rules`, `schedule_exceptions`, `booking_orders`, `bookings`, `booking_assignments`.
- Cobros: `payments`, `payment_operations`, `payment_webhook_events`.
- Operación: `booking_status_events`, `incidents`, `notification_outbox`.
- Plataforma: `newsletter_subscriptions`, `rate_limit_buckets`, `idempotency_keys`.

Los identificadores internos son `bigint generated always as identity`. Las órdenes y reservas tienen además UUID públicos para no exponer secuencias internas. Los montos se almacenan como `numeric(10,2)` y Drizzle los devuelve como cadenas decimales; el código de precios calcula en céntimos enteros y convierte al límite de persistencia.

## Invariantes importantes

### Evitar doble asignación

La extensión `btree_gist` permite la restricción `booking_assignments_no_agent_overlap`. PostgreSQL rechaza dos rangos `[inicio, fin)` que se solapen para el mismo agente cuando ambos están activos (`assigned`, `confirmed` o `in_progress`). La verificación vive en la base y sigue siendo segura ante solicitudes concurrentes.

La asignación debe crearse en la misma transacción que confirma la disponibilidad. Un error de exclusión significa que otro proceso tomó el horario y debe devolverse al cliente como conflicto de disponibilidad, no reintentarse a ciegas.

### Snapshots

`bookings` conserva nombre de servicio, paquete, duración, precio, moneda y dirección tal como fueron confirmados. Cambiar el catálogo o una dirección posteriormente no altera reservas históricas.

### Webhooks e idempotencia

`payment_webhook_events` tiene unicidad por proveedor y evento. Se debe insertar el evento antes de procesarlo y confirmar el pago dentro de una transacción. `idempotency_keys` protege operaciones iniciadas por el cliente, como crear una orden o reprogramar.

`payment_operations` mantiene la saga durable de reembolsos. Cada solicitud tiene una
clave idempotente, monto inmutable, estado, locks y reintentos; por eso un cierre del
proceso después de llamar a Stripe no pierde ni duplica la devolución.

No se guardan números de tarjeta, CVC ni payloads con datos financieros sensibles. El proveedor de pagos es responsable del cumplimiento PCI; antes de persistir un webhook hay que reducir su payload a los campos operativos necesarios.

`rate_limit_buckets` aplica contadores atómicos por ventana e identificadores HMAC.
Los límites sobreviven reinicios y se comparten entre todas las instancias; en producción
deben complementarse con reglas del CDN/WAF.

### Notificaciones

`notification_outbox` implementa el patrón transactional outbox. La reserva y el mensaje pendiente se escriben juntos; un worker reclama lotes con `for update skip locked`, envía y actualiza el estado. `deduplication_key` evita recordatorios duplicados.

Los enlaces de recuperación usan un token aleatorio que nunca se persiste en claro en
su tabla: solo se guarda SHA-256, caduca en una hora y queda consumido de forma
atómica. Si el correo queda pendiente en el outbox, la URL se protege con AES-256-GCM
y una clave derivada de `AUTH_SECRET`. Al establecer una nueva contraseña se invalidan
todas las sesiones y los demás tokens pendientes del usuario.

## Migraciones

`migrations/0000_initial.sql` es la línea base. Usa `create extension/table/index if not exists` y comprueba explícitamente la existencia de la restricción de exclusión, porque PostgreSQL no admite `add constraint if not exists`.

La idempotencia permite reintentar una instalación limpia; no pretende reconciliar una base que haya divergido manualmente. Todo cambio posterior debe generarse como una nueva migración, revisarse y probarse sobre una copia restaurada:

```bash
pnpm db:generate
pnpm db:migrate
```

No se deben editar migraciones ya aplicadas en producción.

## Conexiones

`src/db/index.ts` crea el pool de forma diferida y lo reutiliza durante hot reload. El límite predeterminado es 10 y nunca supera 20 por proceso. En producción se recomienda un pooler administrado o PgBouncer en modo transacción. El total de todos los procesos debe permanecer por debajo del límite de conexiones del servidor.

- `DATABASE_URL`: conexión de la aplicación, preferiblemente al pooler.
- `DATABASE_DIRECT_URL`: conexión directa reservada para migraciones.

No use la cuenta propietaria o superusuario desde la aplicación. Cree un rol de despliegue para migraciones y un rol de ejecución con solo `select`, `insert`, `update` y los permisos de secuencia estrictamente necesarios.

## Seguridad y operación

- Mantener secretos fuera de Git y rotarlos mediante el proveedor de despliegue.
- Restringir la clave de Google Maps por hostname y APIs permitidas.
- Cifrar tráfico con TLS y habilitar cifrado en reposo en el proveedor.
- Limitar acceso a PII; registrar acciones administrativas en eventos de auditoría.
- Aplicar retención y eliminación de sesiones, idempotency keys y payloads de webhook.
- Ejecutar copias automáticas con recuperación a un punto en el tiempo y probar restauraciones.
- Activar `pg_stat_statements`, monitorear consultas lentas y ejecutar `explain (analyze, buffers)` antes de añadir índices reactivos.

## Datos iniciales

El seed es reejecutable y carga:

- nueve distritos de Lima;
- limpieza para hogares y limpieza para empresas como próxima disponibilidad;
- paquetes de 4, 6 y 8 horas a S/ 67, S/ 99 y S/ 127;
- tarifas recurrentes desde S/ 61;
- Juan (4.5), Alex Reategui (5.0) y Alan sin calificación visible.

El seed no crea usuarios, contraseñas, pagos ni reservas ficticias.
