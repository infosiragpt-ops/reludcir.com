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

Para habilitar una primera cuenta interna, registra una cuenta normal y cambia el rol mediante una operación SQL auditada:

```sql
update users set role = 'admin', updated_at = now()
where lower(email) = lower('operaciones@tu-dominio.pe');
```

## Notificaciones

Define `EMAIL_FROM`, `EMAIL_PROVIDER_API_KEY` y, si no usas Resend, `EMAIL_PROVIDER_API_URL`. Para WhatsApp Cloud API define el ID del número, access token y nombres de plantillas aprobadas. Si un proveedor no está configurado, el outbox reintenta y finalmente marca el trabajo como fallido sin deshacer la reserva.

`SUPPORT_OPERATIONS_EMAIL` recibe incidencias; `PAYMENTS_OPERATIONS_EMAIL` recibe revisiones de pago y reembolso. Monitoriza trabajos `failed`, órdenes vencidas, webhooks fallidos y reembolsos pendientes.

## Recuperación y respuesta a incidentes

- Rota de inmediato `AUTH_SECRET` si se sospecha una filtración; esto invalida cookies de claim y evita descifrar nuevos trabajos con la clave anterior. Antes de rotar, drena o cancela mensajes de recuperación pendientes.
- Rota claves de Stripe, correo y WhatsApp desde sus proveedores y actualiza los secretos del despliegue.
- Revoca sesiones activas eliminándolas de `sessions` para el usuario afectado.
- No edites una migración aplicada. Crea una migración posterior y prueba restauración sobre una copia.
