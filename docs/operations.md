# Runbook operativo

## Tareas programadas

`vercel.json` invoca:

- `/api/v1/internal/dispatch-notifications` cada minuto: reclama hasta 20 mensajes con `FOR UPDATE SKIP LOCKED`, reintenta con backoff y recupera locks abandonados.
- `/api/v1/internal/process-payment-operations` cada minuto: ejecuta o consulta reembolsos Stripe idempotentes y recupera trabajos interrumpidos.
- `/api/v1/internal/expire-bookings` cada cinco minutos: vence pedidos impagos, libera agentes y depura sesiones, tokens, idempotencia y rate limits caducados.

Vercel adjunta `Authorization: Bearer <CRON_SECRET>`. En otro proveedor, configura el mismo encabezado y utiliza HTTPS. Una respuesta `503 NOT_CONFIGURED` indica que falta el secreto.

En Vercel, los rate limits toman la IP de `x-vercel-forwarded-for`, que el edge
sobrescribe. En otro proveedor define `RATE_LIMIT_IP_HEADER` únicamente cuando el
proxy de confianza elimine o reemplace siempre esa cabecera; nunca confíes directamente
en un valor aportado por el navegador.

## Stripe

Configura Stripe para enviar `checkout.session.completed`, `refund.created`,
`refund.updated` y `refund.failed` a:

```text
https://TU_DOMINIO/api/v1/payments/stripe/webhook
```

El cuerpo se verifica con `STRIPE_WEBHOOK_SECRET`, la ventana de firma es de cinco minutos y cada evento se registra una sola vez. Un pago recibido después de cancelar o vencer una orden no reactiva el cupo: se intenta devolver automáticamente y, si Stripe no confirma el reembolso, se envía una alerta a `PAYMENTS_OPERATIONS_EMAIL`.

Las cancelaciones con al menos 24 horas de anticipación intentan un reembolso Stripe por el monto de la visita. Una devolución no confirmada, Yape o transferencia queda marcada para revisión humana.

## Conciliación de Yape y transferencia

Las rutas requieren una sesión con rol `admin` o `support`:

```text
GET  /api/v1/admin/payments
POST /api/v1/admin/payments/:id/confirm
POST /api/v1/admin/payments/:id/refund
POST /api/v1/admin/payment-operations/:id/retry
```

Cuerpo de confirmación:

```json
{
  "externalReference": "OPERACION-123456",
  "paidAt": "2026-08-11T15:30:00-05:00",
  "notes": "Validado en el estado de cuenta"
}
```

La confirmación bloquea el pago y la orden, rechaza pedidos vencidos, confirma todas las visitas y encola avisos al cliente. Conserva el comprobante externo según la política contable; no agregues imágenes ni datos financieros sensibles al JSON.

Para cerrar un reembolso de Yape o transferencia, toma el `operationId` y monto
inmutable que devuelve el listado, y envía a `/:id/refund` la operación, la referencia
externa y una nota opcional:

```json
{
  "operationId": 42,
  "externalReference": "DEVOLUCION-123456",
  "notes": "Abono verificado"
}
```

`paidAt` es la hora efectiva que figura en la constancia. Si el pago llegó dentro del
plazo y el cupo sigue retenido, se confirma aunque la revisión administrativa ocurra
después. Si el horario ya fue liberado o el pago fue tardío, el importe queda en el
ledger y se crea una operación manual por el monto íntegro, sin resucitar la reserva.

La referencia es única e idempotente y el API impide devolver más que el saldo
disponible. Los reembolsos Stripe agotados también aparecen en el listado; una vez
resuelta la causa, la ruta `/payment-operations/:id/retry` conserva el refund pendiente
para seguir consultándolo, o crea una nueva generación únicamente cuando Stripe
confirmó un fallo terminal.

La interfaz interna está en `/admin` (no se indexa). Tras iniciar sesión en `/mi-cuenta-2`, un `admin` entra al hub completo: reservas, personal, clientes, pagos, catálogo, calendario y equipo. `support` solo ve conciliación de Yape/transferencia y reintentos Stripe.

`pnpm db:seed` crea siempre `nina.v@example.com` / `Reludcir#Admin26` (rol admin, nombre Operaciones Reludcir), o los valores de `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` si los defines. Esas credenciales son solo de desarrollo. El mismo correo puede entrar con Google si configuras `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`; el callback es `{NEXT_PUBLIC_SITE_URL}/api/v1/auth/google/callback`. Sin esas claves, `/api/v1/auth/google/start` redirige a `/mi-cuenta-2?error=google_unavailable`.

En producción, registra una cuenta normal y cambia el rol con una operación SQL auditada:

```sql
update users set role = 'admin', updated_at = now()
where lower(email) = lower('operaciones@tu-dominio.pe');
```

## Notificaciones

Define `EMAIL_FROM`, `EMAIL_PROVIDER_API_KEY` y, si no usas Resend, `EMAIL_PROVIDER_API_URL`. El conector por defecto apunta a `https://api.resend.com/emails`.

Para WhatsApp Cloud API define `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` y los nombres de plantillas aprobadas:

- `WHATSAPP_TEMPLATE_BOOKING_CREATED`
- `WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED`
- `WHATSAPP_TEMPLATE_BOOKING_CANCELLED`
- `WHATSAPP_TEMPLATE_BOOKING_RESCHEDULED`

Si un proveedor no está configurado, el dispatcher marca el trabajo como `failed` con `lastError = not_configured` y no deshace la reserva. Los fallos del proveedor sí se reintentan con backoff hasta `maxAttempts`.

La recuperación de contraseña encola `password_reset` en el outbox. Sin `EMAIL_*` el enlace no llega; en desarrollo la API puede devolver `previewUrl`. En producción define `NEXT_PUBLIC_SITE_URL` para que el enlace use el dominio público.

`SUPPORT_OPERATIONS_EMAIL` recibe incidencias; `PAYMENTS_OPERATIONS_EMAIL` recibe revisiones de pago y reembolso. Monitoriza trabajos `failed`, órdenes vencidas, webhooks fallidos y reembolsos pendientes.

## Variables de entorno pendientes en un despliegue real

La aplicación funciona en local con PostgreSQL, seed y pagos manuales. Antes de producción completa estos secretos (nunca commits):

| Variable | Uso |
| --- | --- |
| `AUTH_SECRET` | Sesiones, cookies de claim de invitado y cifrado del outbox |
| `RATE_LIMIT_SECRET` | Rate limits compartidos |
| `CRON_SECRET` | Bearer de `/api/v1/internal/*` |
| `DATABASE_URL` / `DATABASE_DIRECT_URL` | App y migraciones, con TLS |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | Checkout y webhook |
| `EMAIL_FROM` / `EMAIL_PROVIDER_API_KEY` | Correo transaccional |
| `YAPE_NUMBER` / `YAPE_HOLDER` / `BANK_*` | Instrucciones de pago manual |
| `WHATSAPP_*` | Plantillas Cloud API (opcional) |
| `SEED_ADMIN_*` | Solo local; no definir en producción |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login opcional con Google; el redirect URI debe coincidir con el callback |

Sin `STRIPE_SECRET_KEY` el checkout con tarjeta responde `503 PAYMENT_UNAVAILABLE`; Yape y transferencia siguen disponibles. Sin `CRON_SECRET` las rutas internas responden `503 NOT_CONFIGURED`.

## Reservas de invitado

Tras crear un pedido sin sesión, el servidor firma una cookie `httpOnly` `reludcir_booking_claims` con `publicId` + referencia de orden. `/mis-reservas` lista esas visitas. Reprogramar, cancelar o reportar exige cuenta: al registrarse o iniciar sesión, el claim se adjunta solo si coinciden cookie y correo, nunca por el correo solo.

## Recuperación y respuesta a incidentes

- Rota de inmediato `AUTH_SECRET` si se sospecha una filtración; esto invalida cookies de claim y evita descifrar nuevos trabajos con la clave anterior. Antes de rotar, drena o cancela mensajes de recuperación pendientes.
- Rota claves de Stripe, correo y WhatsApp desde sus proveedores y actualiza los secretos del despliegue.
- Revoca sesiones activas eliminándolas de `sessions` para el usuario afectado.
- No edites una migración aplicada. Crea una migración posterior y prueba restauración sobre una copia.
