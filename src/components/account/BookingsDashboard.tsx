"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import styles from "./account.module.css";

type BookingStatus =
  | "draft"
  | "pending_payment"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "refunded"
  | string;

type Booking = {
  id: number;
  publicId?: string;
  orderId: number | null;
  orderReference?: string | null;
  status: BookingStatus;
  bookingMode: "one_time" | "recurring";
  recurrenceGroupId?: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  serviceNameSnapshot: string;
  packageNameSnapshot: string | null;
  durationMinutesSnapshot: number;
  unitPriceSnapshot: number | string;
  totalPriceSnapshot: number | string;
  currency: string;
  districtId: number;
  addressSnapshot: unknown;
  manageable?: boolean;
  assignment?: { agentId: number; status: string } | null;
};

type BookingsPayload = {
  user?: { id: number; email: string; role: string } | null;
  guestAccess?: boolean;
  bookings?: Booking[];
  data?: Booking[];
  error?: string | { code?: string; message?: string };
  message?: string;
};

type BookingAction = "cancel" | "reschedule" | "incident";

const DISTRICT_NAMES: Record<number, string> = {
  1: "Miraflores",
  2: "San Borja",
  3: "San Isidro",
  4: "Surco",
  5: "Surquillo",
  6: "Jesús María",
  7: "San Miguel",
  8: "Barranco",
  9: "Magdalena",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmada",
  assigned: "Personal asignado",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "Inasistencia",
  refunded: "Reembolsada",
};

const MANAGEABLE_STATUSES = new Set(["pending_payment", "confirmed", "assigned"]);
const REPORTABLE_STATUSES = new Set([
  "confirmed",
  "assigned",
  "in_progress",
  "completed",
  "no_show",
]);

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function getApiError(payload: BookingsPayload | null, fallback: string) {
  if (typeof payload?.error === "string") {
    return payload.error;
  }

  if (payload?.error && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  if (typeof payload?.message === "string") {
    return payload.message;
  }

  return fallback;
}

async function readPayload(response: Response): Promise<BookingsPayload | null> {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? ((await response.json()) as BookingsPayload)
    : null;
}

function getBookings(payload: BookingsPayload | Booking[] | null) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.bookings)) {
    return payload.bookings;
  }

  return Array.isArray(payload?.data) ? payload.data : [];
}

function districtLabel(booking: Booking) {
  if (booking.addressSnapshot && typeof booking.addressSnapshot === "object") {
    const name = (booking.addressSnapshot as Record<string, unknown>).district;
    if (typeof name === "string" && name.trim()) {
      return name;
    }
  }
  return DISTRICT_NAMES[booking.districtId] ?? `Distrito ${booking.districtId}`;
}

function formatAddress(snapshot: unknown) {
  if (typeof snapshot === "string") {
    return snapshot;
  }

  if (!snapshot || typeof snapshot !== "object") {
    return "Dirección registrada en la reserva";
  }

  const address = snapshot as Record<string, unknown>;
  const formatted =
    address.formattedAddress ?? address.address ?? address.label ?? address.street;
  const apartment = address.apartment ?? address.interior;

  if (typeof formatted !== "string") {
    return "Dirección registrada en la reserva";
  }

  return typeof apartment === "string" && apartment.trim()
    ? `${formatted}, ${apartment}`
    : formatted;
}

function formatPrice(value: number | string, currency: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: currency || "PEN",
  }).format(numericValue);
}

function todayInLima() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function BookingsDashboard() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    id: number;
    email: string;
    role: string;
  } | null>(null);
  const [guestAccess, setGuestAccess] = useState(false);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "error" | "unauthenticated"
  >("loading");
  const [loadError, setLoadError] = useState("");
  const [activeAction, setActiveAction] = useState<
    { bookingId: number; type: BookingAction } | undefined
  >();
  const [pendingAction, setPendingAction] = useState<string>();
  const [logoutPending, setLogoutPending] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >();

  const loadBookings = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve();

    if (signal?.aborted) {
      return;
    }

    setLoadState("loading");
    setLoadError("");

    try {
      const response = await fetch("/api/v1/me/bookings", {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });

      if (response.status === 401) {
        setLoadState("unauthenticated");
        return;
      }

      const payload = await readPayload(response);

      if (!response.ok) {
        throw new Error(
          getApiError(payload, "No pudimos cargar tus reservas en este momento."),
        );
      }

      setBookings(getBookings(payload));
      setCurrentUser(payload?.user ?? null);
      setGuestAccess(Boolean(payload?.guestAccess));
      setLoadState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setLoadError(
        error instanceof Error
          ? error.message
          : "No pudimos cargar tus reservas en este momento.",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = window.setTimeout(() => {
      void loadBookings(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(requestId);
      controller.abort();
    };
  }, [loadBookings]);

  const sortedBookings = useMemo(
    () =>
      [...bookings].sort(
        (left, right) =>
          new Date(right.scheduledStart).getTime() -
          new Date(left.scheduledStart).getTime(),
      ),
    [bookings],
  );

  function openAction(bookingId: number, type: BookingAction) {
    setActiveAction({ bookingId, type });
    setActionFeedback(undefined);
  }

  async function logout() {
    setLogoutPending(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/mi-cuenta-2");
      router.refresh();
    }
  }

  async function submitAction(
    event: FormEvent<HTMLFormElement>,
    booking: Booking,
    type: BookingAction,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const actionKey = `${booking.id}:${type}`;
    let endpoint = `/api/v1/bookings/${booking.id}`;
    let body: Record<string, unknown>;

    if (type === "cancel") {
      endpoint += "/cancel";
      body = { reason: String(formData.get("reason") ?? "").trim() };
    } else if (type === "reschedule") {
      endpoint += "/reschedule";
      const date = String(formData.get("date") ?? "");
      const time = String(formData.get("time") ?? "");
      body = {
        scheduledStart: new Date(`${date}T${time}:00-05:00`).toISOString(),
        timeZone: "America/Lima",
      };
    } else {
      endpoint += "/incidents";
      body = {
        type: String(formData.get("incidentType") ?? "incident"),
        description: String(formData.get("description") ?? "").trim(),
      };
    }

    setPendingAction(actionKey);
    setActionFeedback(undefined);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await readPayload(response)) as
        | (BookingsPayload & { booking?: Booking })
        | null;

      if (!response.ok) {
        throw new Error(
          getApiError(payload, "No pudimos completar la solicitud. Inténtalo nuevamente."),
        );
      }

      if (type === "cancel") {
        await loadBookings();
      } else if (payload?.booking) {
        setBookings((current) =>
          current.map((item) => (item.id === payload.booking?.id ? payload.booking : item)),
        );
      }

      setActionFeedback({
        kind: "success",
        message:
          type === "cancel"
            ? booking.status === "pending_payment"
              ? "El pedido pendiente y sus visitas fueron cancelados."
              : booking.bookingMode === "recurring"
                ? "La visita seleccionada fue cancelada. Las demás continúan activas."
                : "La reserva fue cancelada."
            : type === "reschedule"
              ? "La nueva fecha fue registrada."
              : "El reporte fue enviado a nuestro equipo.",
      });
      setActiveAction(undefined);
    } catch (error) {
      setActionFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "No pudimos completar la solicitud. Inténtalo nuevamente.",
      });
    } finally {
      setPendingAction(undefined);
    }
  }

  if (loadState === "loading") {
    return (
      <section className={styles.dashboardState} aria-live="polite" aria-busy="true">
        <div className={styles.loader} aria-hidden="true" />
        <h2>Cargando tus reservas</h2>
        <p>Estamos consultando la información más reciente.</p>
      </section>
    );
  }

  if (loadState === "unauthenticated") {
    return (
      <section className={styles.dashboardState} aria-labelledby="bookings-login-title">
        <h2 id="bookings-login-title">Inicia sesión para ver tus reservas</h2>
        <p>
          Usa el mismo correo con el que reservaste para consultar y gestionar tus
          servicios.
        </p>
        <Link className={styles.primaryLink} href="/mi-cuenta-2">
          Acceder a mi cuenta
        </Link>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className={styles.dashboardState} aria-labelledby="bookings-error-title">
        <h2 id="bookings-error-title">No pudimos mostrar tus reservas</h2>
        <p role="alert">{loadError}</p>
        <button className={styles.primaryButton} type="button" onClick={() => loadBookings()}>
          Volver a intentar
        </button>
      </section>
    );
  }

  if (bookings.length === 0) {
    return (
      <section className={styles.dashboardState} aria-labelledby="empty-bookings-title">
        <h2 id="empty-bookings-title">Aún no tienes reservas</h2>
        <p>
          Elige el distrito, la duración y el horario que prefieras. Tu primera reserva
          aparecerá aquí.
        </p>
        <Link className={styles.primaryLink} href="/#form">
          Reservar un servicio
        </Link>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={logout}
          disabled={logoutPending}
        >
          {logoutPending ? "Cerrando…" : "Cerrar sesión"}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.dashboard} aria-labelledby="bookings-title">
      <header className={styles.dashboardHeader}>
        <div>
          <h1 id="bookings-title">Mis reservas</h1>
          <p>
            {guestAccess
              ? "Estas reservas están vinculadas a este navegador. Crea una cuenta con el mismo correo para gestionarlas."
              : "Consulta tus servicios y gestiona cualquier cambio desde aquí."}
          </p>
        </div>
        <div className={styles.dashboardHeaderActions}>
          {currentUser && ["admin", "support"].includes(currentUser.role) ? (
            <Link className={styles.secondaryButton} href="/admin">
              Conciliar pagos
            </Link>
          ) : null}
          <Link className={styles.primaryLink} href="/#form">
            Nueva reserva
          </Link>
          {guestAccess ? (
            <Link className={styles.secondaryButton} href="/mi-cuenta-2">
              Crear cuenta
            </Link>
          ) : (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={logout}
              disabled={logoutPending}
            >
              {logoutPending ? "Cerrando…" : "Cerrar sesión"}
            </button>
          )}
        </div>
      </header>

      {actionFeedback ? (
        <p
          className={
            actionFeedback.kind === "error" ? styles.errorMessage : styles.successMessage
          }
          role={actionFeedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {actionFeedback.message}
        </p>
      ) : null}

      <div className={styles.bookingList}>
        {sortedBookings.map((booking) => {
          const canManage =
            booking.manageable !== false && MANAGEABLE_STATUSES.has(booking.status);
          const canReport =
            booking.manageable !== false && REPORTABLE_STATUSES.has(booking.status);
          const activeType =
            activeAction?.bookingId === booking.id ? activeAction.type : undefined;

          return (
            <article className={styles.bookingCard} key={booking.id}>
              <header className={styles.bookingCardHeader}>
                <div>
                  <p className={styles.bookingReference}>
                    Reserva #{booking.id}
                    {booking.orderId ? ` · Pedido #${booking.orderId}` : ""}
                  </p>
                  <h2>{booking.serviceNameSnapshot}</h2>
                  {booking.packageNameSnapshot ? (
                    <p>{booking.packageNameSnapshot}</p>
                  ) : null}
                </div>
                <span className={styles.status} data-status={booking.status}>
                  {STATUS_LABELS[booking.status] ?? booking.status}
                </span>
              </header>

              <dl className={styles.bookingDetails}>
                <div>
                  <dt>Fecha y hora</dt>
                  <dd>{dateFormatter.format(new Date(booking.scheduledStart))}</dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>{booking.durationMinutesSnapshot / 60} horas</dd>
                </div>
                <div>
                  <dt>Distrito</dt>
                  <dd>{districtLabel(booking)}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatPrice(booking.totalPriceSnapshot, booking.currency)}</dd>
                </div>
                <div className={styles.wideDetail}>
                  <dt>Dirección</dt>
                  <dd>{formatAddress(booking.addressSnapshot)}</dd>
                </div>
                <div>
                  <dt>Personal</dt>
                  <dd>{booking.assignment ? "Agente asignado" : "Pendiente de asignación"}</dd>
                </div>
              </dl>

              {canManage || canReport ? (
                <div className={styles.actionBar} aria-label={`Acciones de la reserva ${booking.id}`}>
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => openAction(booking.id, "reschedule")}>
                        Reprogramar
                      </button>
                      <button type="button" onClick={() => openAction(booking.id, "cancel")}>
                        Cancelar
                      </button>
                    </>
                  ) : null}
                  {canReport ? (
                    <button type="button" onClick={() => openAction(booking.id, "incident")}>
                      Reportar
                    </button>
                  ) : null}
                </div>
              ) : null}

              {activeType ? (
                <form
                  className={styles.actionForm}
                  onSubmit={(event) => submitAction(event, booking, activeType)}
                >
                  <div className={styles.actionFormHeader}>
                    <h3>
                      {activeType === "cancel"
                        ? booking.status === "pending_payment"
                          ? "Cancelar pedido pendiente"
                          : booking.bookingMode === "recurring"
                            ? "Cancelar esta visita"
                            : "Cancelar reserva"
                        : activeType === "reschedule"
                          ? "Elegir una nueva fecha"
                          : "Reportar un problema"}
                    </h3>
                    <button
                      className={styles.closeButton}
                      type="button"
                      onClick={() => setActiveAction(undefined)}
                      aria-label="Cerrar formulario"
                    >
                      Cerrar
                    </button>
                  </div>

                  {activeType === "cancel" ? (
                    <>
                      <p className={styles.policyNote}>
                        {booking.status === "pending_payment"
                          ? "Se cancelará el pedido completo y se liberarán todas sus visitas pendientes."
                          : booking.bookingMode === "recurring"
                            ? "Solo se cancelará esta visita; las demás fechas de la serie continuarán activas."
                            : "Se cancelará este servicio."}
                      </p>
                      <label className={styles.field}>
                        <span>Motivo de la cancelación</span>
                        <textarea name="reason" rows={3} required />
                      </label>
                    </>
                  ) : null}

                  {activeType === "reschedule" ? (
                    <div className={styles.fieldGrid}>
                      <label className={styles.field}>
                        <span>Nueva fecha</span>
                        <input name="date" type="date" min={todayInLima()} required />
                      </label>
                      <label className={styles.field}>
                        <span>Nueva hora</span>
                        <select name="time" required defaultValue="07:00">
                          {Array.from({ length: 13 }, (_, index) => {
                            const hour = 7 + index;
                            const value = `${String(hour).padStart(2, "0")}:00`;
                            return (
                              <option value={value} key={value}>
                                {value}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {activeType === "incident" ? (
                    <>
                      <label className={styles.field}>
                        <span>Tipo de reporte</span>
                        <select name="incidentType" defaultValue="incident">
                          <option value="incident">Incidente durante el servicio</option>
                          <option value="late_arrival">El agente llegó tarde</option>
                          <option value="no_show">El agente no llegó</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Cuéntanos qué ocurrió</span>
                        <textarea name="description" rows={4} required />
                      </label>
                    </>
                  ) : null}

                  <p className={styles.policyNote}>
                    Las reprogramaciones son gratuitas hasta 12 horas antes. Las
                    cancelaciones sin costo requieren 24 horas de anticipación.
                  </p>
                  <button
                    className={styles.primaryButton}
                    type="submit"
                    disabled={pendingAction === `${booking.id}:${activeType}`}
                  >
                    {pendingAction === `${booking.id}:${activeType}`
                      ? "Enviando…"
                      : "Confirmar solicitud"}
                  </button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
