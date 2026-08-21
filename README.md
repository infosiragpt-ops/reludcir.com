# Reludcir

Reconstrucción en código de la plataforma pública de Reludcir: sitio responsive, reservas únicas y recurrentes, disponibilidad por agente, cuenta de cliente, pagos y operación sobre PostgreSQL.

## Stack

- Next.js 16, React 19 y TypeScript estricto.
- PostgreSQL 16 con Drizzle ORM y migraciones SQL versionadas.
- Stripe Checkout para tarjeta; Yape y transferencia con conciliación administrativa.
- Sesiones opacas, contraseñas con `scrypt`, rate limits compartidos en PostgreSQL y tokens de recuperación de un solo uso.
- Outbox transaccional para correo/WhatsApp y tareas programadas en `vercel.json`.

## Inicio local

Requisitos: Node.js 20.9 o superior, pnpm 10 y Docker.

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

La web queda en `http://localhost:3000`. Antes de exponer el proyecto, define como mínimo `AUTH_SECRET`, `RATE_LIMIT_SECRET`, las conexiones PostgreSQL y `CRON_SECRET`; usa valores aleatorios diferentes por entorno.

Para crear un usuario interno local (opcional), añade `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` en `.env` y vuelve a ejecutar `pnpm db:seed`. Esos valores son solo de desarrollo.

## Verificación

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Flujos incluidos

- Reserva única de 4, 6 u 8 horas y series recurrentes materializadas visita por visita.
- Nueve distritos, horario 07:00–19:00, mínimo de anticipación y disponibilidad real por reglas, excepciones y solapes.
- Prevención de doble asignación mediante una restricción de exclusión GiST en PostgreSQL.
- Carrito/revisión, datos del domicilio, selección de agente y confirmación de pago.
- Stripe con webhook idempotente, protección frente a pagos tardíos y reembolsos automáticos elegibles.
- Yape/transferencia con vencimiento del cupo y conciliación por personal autorizado.
- Registro, inicio/cierre de sesión, recuperación de contraseña, panel de reservas, reprogramación, cancelación e incidencias.
- Claim seguro de pedidos de invitado mediante cookie firmada; no se apropian reservas solo por coincidir un correo.
- Newsletter, SEO técnico, sitemap, manifest, páginas distritales (nueve distritos) y diseño adaptable.
- Panel interno `/admin` para conciliar Yape/transferencia, cerrar reembolsos manuales y reintentar Stripe.

## Producción

1. Aprovisiona PostgreSQL con TLS, copias PITR y dos conexiones: `DATABASE_URL` para la aplicación y `DATABASE_DIRECT_URL` para migraciones.
2. Ejecuta `pnpm db:migrate` y `pnpm db:seed` durante el despliegue controlado.
3. Configura el webhook de Stripe hacia `/api/v1/payments/stripe/webhook` para `checkout.session.completed`, `refund.created`, `refund.updated` y `refund.failed`, y guarda su secreto.
4. Configura correo, WhatsApp y los datos de Yape/banco de `.env.example`.
5. Mantén activas las tareas de `vercel.json` o invoca sus rutas desde un scheduler equivalente con `Authorization: Bearer $CRON_SECRET`.
6. Crea cuentas internas con rol `admin` o `support` para usar `/admin`. No uses `SEED_ADMIN_*` en producción.
7. Configura el webhook de Stripe, `EMAIL_*` y, si aplica, plantillas de WhatsApp. Sin esas claves el dominio de reservas y la conciliación manual siguen operativos; correo/WhatsApp y tarjeta quedan pendientes de forma explícita (503 o outbox `not_configured`), no como no-ops silenciosos.

La guía del esquema está en [docs/database.md](docs/database.md) y el runbook operativo en [docs/operations.md](docs/operations.md). Lo que aún depende de proveedores externos está listado allí.

## Notas de seguridad

La aplicación no almacena datos de tarjeta. Los identificadores públicos de pedidos son UUID, los tokens de sesión y recuperación se persisten hasheados, y las URLs sensibles pendientes en el outbox se cifran con AES-256-GCM usando una clave derivada de `AUTH_SECRET`. Nunca uses las credenciales del `docker-compose.yml` en producción.
